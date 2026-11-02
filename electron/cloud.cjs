// Cloudinary 圖床：上傳、更新、列出、還原。
// 不用官方 SDK，直接呼叫 REST API（簽章上傳＋Admin API），金鑰由主程式傳進來，不會進到介面。
//
// 命名與還原的設計（為了「以後能從 Cloudinary 把所有東西準確放回原位」）：
//   public_id   makonote/<文章編號>/<檔案在文章資料夾內的路徑>   編號固定，改標題也不影響
//   display_name  <標題>_圖N（N 是圖片在文中出現的順序）     在 Cloudinary 後台看到的名稱
//   tags        makonote、makonote-<文章編號>
//   context     article、title、dir（文章資料夾在文章庫的位置）、path（含副檔名的原始相對路徑）、sha1
// 每個資產自己就記著放回哪裡，所以不靠任何本機檔案也能還原；文章本身（.md、原始排版、各格式版本）
// 也以 raw 檔案一併備份。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lib = require('./library.cjs');

const PREFIX = 'makonote';
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg', 'tif', 'tiff']);
const RAW_EXT = new Set(['md', 'txt', 'html', 'json']);
const MAX_BYTES = 10 * 1024 * 1024; // 免費方案單檔上限
const CONCURRENCY = 3;

// 只給測試用：指到本機模擬伺服器
const apiBase = () => (process.env.GALNOTE_CLOUDINARY_API || 'https://api.cloudinary.com').replace(/\/$/, '');

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const extOf = (p) => path.extname(p).slice(1).toLowerCase();

// ---------- 簽章與 context ----------

// 簽章：排除 file、cloud_name、resource_type、api_key 之外的欄位，依名稱排序、用 & 串接，最後直接接上 secret，SHA-1
function signParams(params, secret) {
  const s = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return sha1(Buffer.from(s + secret, 'utf8'));
}

// context 的值裡的 = 和 | 要用反斜線跳脫
const escCtx = (v) => String(v).replace(/\\/g, '/').replace(/[=|]/g, '\\$&').replace(/[\u0000-\u0008\u000b-\u001f]/g, '');
function ctxString(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${escCtx(v)}`)
    .join('|');
}

// ---------- HTTP ----------

class CloudError extends Error {}

async function readError(res) {
  let msg = `HTTP ${res.status}`;
  try {
    const j = await res.json();
    if (j && j.error && j.error.message) msg = j.error.message;
  } catch {
    // 不是 JSON 就只回狀態碼
  }
  if (res.status === 401 || res.status === 403) msg = `金鑰或權限不對（${msg}）`;
  if (res.status === 420 || res.status === 429) msg = `超過 Cloudinary 的呼叫頻率限制，稍後再試（${msg}）`;
  return new CloudError(msg);
}

// 網路錯誤與 5xx 重試；其他錯誤（金鑰錯、檔案太大…）重試也沒用，直接丟出
async function withRetry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (e instanceof CloudError && !/^HTTP 5\d\d/.test(e.message)) throw e;
      if (i < tries - 1) await sleep(600 * (i + 1));
    }
  }
  throw last;
}

const basic = (c) => 'Basic ' + Buffer.from(`${c.apiKey}:${c.apiSecret}`).toString('base64');

async function uploadFile(creds, resourceType, buffer, filename, fields) {
  return withRetry(async () => {
    const params = { ...fields, timestamp: String(Math.floor(Date.now() / 1000)) };
    const form = new FormData();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') form.append(k, String(v));
    form.append('api_key', creds.apiKey);
    form.append('signature', signParams(params, creds.apiSecret));
    form.append('file', new Blob([buffer]), filename);
    const res = await fetch(`${apiBase()}/v1_1/${creds.cloudName}/${resourceType}/upload`, { method: 'POST', body: form });
    if (!res.ok) throw await readError(res);
    return res.json();
  });
}

// 更新既有資產的名稱、資料夾與 context，不用重傳檔案（Admin API，有頻率限制）
async function updateAsset(creds, resourceType, publicId, fields) {
  const idPath = publicId.split('/').map(encodeURIComponent).join('/');
  return withRetry(async () => {
    const res = await fetch(`${apiBase()}/v1_1/${creds.cloudName}/resources/${resourceType}/upload/${idPath}`, {
      method: 'POST',
      headers: { Authorization: basic(creds), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    });
    if (!res.ok) throw await readError(res);
    return res.json();
  });
}

// 依 tag 列出資產（含 context），自動翻頁
async function listByTag(creds, resourceType, tag) {
  const out = [];
  let cursor = '';
  do {
    const q = new URLSearchParams({ max_results: '500', context: 'true', tags: 'true' });
    if (cursor) q.set('next_cursor', cursor);
    const data = await withRetry(async () => {
      const res = await fetch(`${apiBase()}/v1_1/${creds.cloudName}/resources/${resourceType}/tags/${encodeURIComponent(tag)}?${q}`, {
        headers: { Authorization: basic(creds) },
      });
      if (!res.ok) throw await readError(res);
      return res.json();
    });
    for (const r of data.resources || []) out.push({ ...r, resource_type: r.resource_type || resourceType, ctx: (r.context && (r.context.custom || r.context)) || {} });
    cursor = data.next_cursor || '';
  } while (cursor);
  return out;
}

// 設定頁的「儲存並測試」：列出 tag 下的 1 筆，順便驗證金鑰
async function testCredentials(creds) {
  const res = await fetch(`${apiBase()}/v1_1/${creds.cloudName}/resources/image/tags/${PREFIX}?max_results=1`, { headers: { Authorization: basic(creds) } });
  if (!res.ok) throw await readError(res);
  return true;
}

// ---------- 這篇文章有哪些檔案要上傳 ----------

function refsIn(text) {
  const out = [];
  for (const m of text.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) out.push(m[1]);
  for (const m of text.matchAll(/<img\b[^>]*?\bsrc=["']([^"']+)["']/gi)) out.push(m[1]);
  for (const m of text.matchAll(/\[img=([^\]\s]+)/g)) out.push(m[1]);
  return out;
}

function cleanRef(ref) {
  let p = ref;
  try {
    p = decodeURIComponent(ref);
  } catch {
    // 本來就不是編碼過的路徑
  }
  p = p.replace(/\\/g, '/').replace(/[?#].*$/, '').replace(/^\.\//, '');
  return /^(https?:|data:|lib:|blob:|#|\/\/)/i.test(p) ? '' : p;
}

const safeSeg = (s) => s.replace(/[?&#\\%<>+]/g, '_').replace(/^\s+|\s+$/g, '').replace(/^\/+|\/+$/g, '') || '_';
const safeIdPath = (p) => p.split('/').map(safeSeg).join('/');
const displayOf = (s) => String(s).replace(/\//g, '／').slice(0, 200);
const manifestFile = (mdAbs) => path.join(path.dirname(mdAbs), path.basename(mdAbs, '.md') + '.cloud.json');

function readManifest(mdAbs) {
  try {
    return JSON.parse(fs.readFileSync(manifestFile(mdAbs), 'utf8'));
  } catch {
    return null;
  }
}

// 建立上傳計畫（只讀、不寫檔）
function buildPlan(root, rel) {
  const mdAbs = lib.resolveInside(root, rel);
  const mdDir = path.dirname(mdAbs);
  const { meta, body } = lib.readArticle(root, rel);
  const baseName = path.basename(mdAbs, '.md');
  const items = [];
  const skipped = [];
  const seen = new Map();

  const add = (relPath, kind, extra = {}) => {
    const key = relPath.toLowerCase();
    if (seen.has(key)) return seen.get(key);
    const abs = path.resolve(mdDir, relPath);
    if (abs !== mdDir && !abs.startsWith(mdDir + path.sep)) {
      skipped.push({ path: relPath, reason: '在文章資料夾之外' });
      return null;
    }
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      skipped.push({ path: relPath, reason: '找不到檔案' });
      return null;
    }
    if (!st.isFile()) return null;
    const ext = extOf(relPath);
    const isImage = IMAGE_EXT.has(ext);
    if (!isImage && !RAW_EXT.has(ext)) {
      skipped.push({ path: relPath, reason: `不支援的檔案類型 .${ext}` });
      return null;
    }
    if (st.size > MAX_BYTES) {
      skipped.push({ path: relPath, reason: `超過 10 MB（${(st.size / 1048576).toFixed(1)} MB）` });
      return null;
    }
    const buf = fs.readFileSync(abs);
    const item = { abs, path: relPath, kind, type: isImage ? 'image' : 'raw', bytes: st.size, sha1: sha1(buf), ...extra };
    seen.set(key, item);
    items.push(item);
    return item;
  };

  // 文章本體與原始排版、各格式版本
  add(path.basename(mdAbs), 'article');
  if (path.basename(mdAbs) === 'article.md') {
    // 巴哈小屋爬蟲的原始排版與資訊檔
    for (const f of ['content.html', 'meta.json']) if (fs.existsSync(path.join(mdDir, f))) add(f, 'source');
  }
  const variantsDir = path.join(mdDir, 'variants');
  const variantTexts = [];
  if (fs.existsSync(variantsDir)) {
    for (const f of fs.readdirSync(variantsDir)) {
      if (f.startsWith(baseName + '.') && /\.(md|txt|json)$/i.test(f) && !f.endsWith('.cloud.json')) {
        const it = add(`variants/${f}`, 'variant');
        if (it && /\.(md|txt)$/i.test(f)) variantTexts.push(fs.readFileSync(it.abs, 'utf8'));
      }
    }
  }

  // 圖片：文中出現的順序（圖1、圖2…）→ 封面 → 其他地方（原始排版、各格式版本）用到的
  const ordered = [];
  const push = (r) => {
    const p = cleanRef(r);
    if (p && !ordered.includes(p)) ordered.push(p);
  };
  refsIn(body).forEach(push);
  const bodyCount = ordered.length;
  if (meta.cover) push(meta.cover);
  const htmlItem = items.find((i) => i.kind === 'source' && i.path === 'content.html');
  if (htmlItem) refsIn(fs.readFileSync(htmlItem.abs, 'utf8')).forEach(push);
  variantTexts.forEach((t) => refsIn(t).forEach(push));

  let n = 0;
  ordered.forEach((p, idx) => {
    if (!IMAGE_EXT.has(extOf(p))) return;
    const inBody = idx < bodyCount;
    const isCover = !inBody && meta.cover && cleanRef(meta.cover) === p;
    const it = add(p, 'image', { n: inBody ? (n += 1) : 0, cover: !!isCover });
    if (it && !inBody && !isCover) it.n = (n += 1);
  });

  // public_id：圖片不含副檔名，文字檔含；路徑相同只差副檔名時加上副檔名區分
  const idCount = new Map();
  for (const it of items) {
    const base = it.type === 'image' ? it.path.replace(/\.[^./]+$/, '') : it.path;
    it.idBase = safeIdPath(base);
    idCount.set(it.idBase, (idCount.get(it.idBase) || 0) + 1);
  }
  for (const it of items) if (idCount.get(it.idBase) > 1 && it.type === 'image') it.idBase += '_' + extOf(it.path);

  const title = meta.title || baseName;
  const dir = path.relative(root, mdDir).split(path.sep).join('/');
  for (const it of items) {
    it.displayName = displayOf(
      it.kind === 'image' ? `${title}_${it.cover ? '封面' : '圖' + it.n}` : it.kind === 'article' ? `${title}_文章` : it.kind === 'source' ? `${title}_原始排版` : `${title}_${path.basename(it.path)}`,
    );
  }
  return { mdAbs, meta, title, dir, articleId: meta.id || '', items, skipped, folder: `${PREFIX}/${displayOf(title).replace(/^\s+|\s+$/g, '')}` };
}

const metaSig = (it, plan) => sha1(Buffer.from([it.displayName, plan.folder, plan.dir, plan.title].join('\u0001')));

// 給介面確認用：這次要上傳什麼、哪些已經在雲端
function plan(root, rel) {
  const p = buildPlan(root, rel);
  const man = readManifest(p.mdAbs);
  const files = (man && man.files) || {};
  let fresh = 0;
  let same = 0;
  let bytes = 0;
  for (const it of p.items) {
    const old = files[it.path];
    if (old && old.sha1 === it.sha1) same += 1;
    else {
      fresh += 1;
      bytes += it.bytes;
    }
  }
  return {
    images: p.items.filter((i) => i.type === 'image').length,
    texts: p.items.filter((i) => i.type === 'raw').length,
    toUpload: fresh,
    unchanged: same,
    bytes,
    skipped: p.skipped,
    lastUpload: man ? man.uploadedAt : '',
    cloudName: man ? man.cloud : '',
  };
}

// ---------- 上傳 ----------

async function upload(root, rel, creds, onProgress = () => {}) {
  const articleId = lib.ensureId(root, rel);
  const p = buildPlan(root, rel);
  p.articleId = articleId;
  const prev = readManifest(p.mdAbs);
  const files = prev && prev.cloud === creds.cloudName ? { ...prev.files } : {};
  const result = { uploaded: 0, updated: 0, unchanged: 0, failed: [], skipped: p.skipped, bytes: 0 };
  let done = 0;

  const worker = async (it) => {
    const old = files[it.path];
    const publicId = `${PREFIX}/${articleId}/${it.idBase}`;
    const context = ctxString({ article: articleId, title: p.title, dir: p.dir, path: it.path, kind: it.kind, sha1: it.sha1, n: it.n || '' });
    const common = { public_id: publicId, display_name: it.displayName, asset_folder: p.folder, tags: `${PREFIX},${PREFIX}-${articleId}`, context };
    try {
      if (old && old.sha1 === it.sha1 && old.public_id === publicId) {
        // 從雲端還原回來的紀錄沒有 metaSig（空字串），視為沒變，不要為了它對每個檔案都呼叫一次 Admin API
        if (old.metaSig === '' || old.metaSig === metaSig(it, p)) {
          result.unchanged += 1;
        } else {
          // 檔案沒變，只是標題或順序變了：更新名稱與資料夾，不重傳
          await updateAsset(creds, it.type, publicId, { display_name: it.displayName, asset_folder: p.folder, context });
          files[it.path] = { ...old, displayName: it.displayName, metaSig: metaSig(it, p) };
          result.updated += 1;
        }
      } else {
        const res = await uploadFile(creds, it.type, fs.readFileSync(it.abs), path.basename(it.abs), { ...common, overwrite: 'true' });
        files[it.path] = {
          public_id: res.public_id || publicId,
          resource_type: it.type,
          url: res.secure_url || res.url,
          version: res.version,
          format: res.format || extOf(it.path),
          sha1: it.sha1,
          bytes: it.bytes,
          displayName: it.displayName,
          metaSig: metaSig(it, p),
          uploaded: new Date().toISOString(),
        };
        result.uploaded += 1;
        result.bytes += it.bytes;
      }
    } catch (e) {
      result.failed.push({ path: it.path, error: e.message });
    }
    done += 1;
    onProgress({ phase: 'upload', done, total: p.items.length, path: it.path });
  };

  const queue = [...p.items];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  }));

  // 這次沒有用到的舊紀錄留著（雲端上的檔案不會被刪），清單記錄最新狀態
  const manifest = { version: 1, cloud: creds.cloudName, articleId, title: p.title, dir: p.dir, uploadedAt: new Date().toISOString(), files };
  lib.writeAtomic(manifestFile(p.mdAbs), JSON.stringify(manifest, null, 2));
  return result;
}

function manifest(root, rel) {
  return readManifest(lib.resolveInside(root, rel));
}

// ---------- 從雲端還原 ----------

const normCtx = (r) => ({
  article: r.ctx.article || (r.public_id.split('/')[1] || ''),
  title: r.ctx.title || '',
  dir: r.ctx.dir,
  path: r.ctx.path || (r.resource_type === 'raw' ? r.public_id.split('/').slice(2).join('/') : `${r.public_id.split('/').slice(2).join('/')}.${r.format || 'jpg'}`),
  sha1: r.ctx.sha1 || '',
  kind: r.ctx.kind || '',
});

async function listAll(creds) {
  const all = [...(await listByTag(creds, 'image', PREFIX)), ...(await listByTag(creds, 'raw', PREFIX))];
  return all.filter((r) => r.public_id.startsWith(PREFIX + '/')).map((r) => ({ ...r, n: normCtx(r) }));
}

// 雲端上有哪些文章（給還原清單用）
async function listArticles(creds) {
  const by = new Map();
  for (const r of await listAll(creds)) {
    const a = by.get(r.n.article) || { id: r.n.article, title: '', dir: '', images: 0, texts: 0, bytes: 0 };
    if (r.n.kind === 'article' || !a.title) a.title = r.n.title || a.title;
    if (r.n.dir !== undefined && (r.n.kind === 'article' || !a.dir)) a.dir = r.n.dir;
    if (r.resource_type === 'image') a.images += 1;
    else a.texts += 1;
    a.bytes += r.bytes || 0;
    by.set(a.id, a);
  }
  return [...by.values()].sort((x, y) => x.dir.localeCompare(y.dir, 'zh-Hant'));
}

// 還原：把檔案放回「文章庫位置／文章資料夾／原始相對路徑」。已經存在的檔案一律不覆蓋。
async function restore(creds, targetRoot, articleIds, onProgress = () => {}) {
  const want = articleIds && articleIds.length ? new Set(articleIds) : null;
  const list = (await listAll(creds)).filter((r) => !want || want.has(r.n.article));
  const out = { restored: 0, existing: 0, mismatched: 0, failed: [], articles: new Set() };
  const manifests = new Map();
  let done = 0;
  const root = path.resolve(targetRoot);

  const worker = async (r) => {
    const rel = `${r.n.dir || ''}/${r.n.path}`.split('/').filter(Boolean).join('/');
    const dest = path.resolve(root, rel);
    try {
      // 路徑來自雲端資料，當作不可信輸入：一律不能跑出還原資料夾外面
      if (dest !== root && !dest.startsWith(root + path.sep)) throw new Error('路徑超出還原資料夾，已略過');
      if (fs.existsSync(dest)) {
        out.existing += 1;
      } else {
        const res = await withRetry(async () => {
          const x = await fetch(r.secure_url || r.url);
          if (!x.ok) throw await readError(x);
          return Buffer.from(await x.arrayBuffer());
        });
        if (r.n.sha1 && sha1(res) !== r.n.sha1) out.mismatched += 1;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, res);
        out.restored += 1;
      }
      out.articles.add(r.n.article);
      // 順便重建上傳清單，還原後這篇就直接跟雲端對得上，之後再按上傳會全部略過
      const mdName = rel.endsWith('.md') && r.n.kind === 'article' ? rel : '';
      const key = `${r.n.article}`;
      const m = manifests.get(key) || { files: {}, dir: r.n.dir || '', title: r.n.title, md: '' };
      if (mdName) m.md = mdName;
      m.files[r.n.path] = {
        public_id: r.public_id,
        resource_type: r.resource_type,
        url: r.secure_url || r.url,
        version: r.version,
        format: r.format || extOf(r.n.path),
        sha1: r.n.sha1,
        bytes: r.bytes || 0,
        displayName: r.display_name || '',
        metaSig: '',
        uploaded: r.created_at || '',
      };
      manifests.set(key, m);
    } catch (e) {
      out.failed.push({ path: rel, error: e.message });
    }
    done += 1;
    onProgress({ phase: 'restore', done, total: list.length, path: rel });
  };

  const queue = [...list];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  }));

  for (const [id, m] of manifests) {
    if (!m.md) continue;
    const mdAbs = path.resolve(root, m.md);
    const file = manifestFile(mdAbs);
    if (!fs.existsSync(file)) {
      lib.writeAtomic(file, JSON.stringify({ version: 1, cloud: creds.cloudName, articleId: id, title: m.title, dir: m.dir, uploadedAt: '', files: m.files }, null, 2));
    }
  }
  return { ...out, articles: out.articles.size };
}

module.exports = { signParams, ctxString, testCredentials, plan, upload, manifest, listArticles, restore, buildPlan };
