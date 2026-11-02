// 文章庫的檔案讀寫：所有資料都是資料夾裡的普通檔案，這裡只負責讀、寫、搬。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const YAML = require('yaml');

const ARTICLE_FILE = 'article.md';
const APP_DIR = '.app';
const GAMES_DIR = '_works';

// ---------- 小工具 ----------

function toRel(root, abs) {
  return path.relative(root, abs).split(path.sep).join('/');
}

// 把相對路徑轉成絕對路徑，並確保不會跑出文章庫外面
function resolveInside(root, rel = '') {
  const abs = path.resolve(root, rel);
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
    throw new Error('路徑超出文章庫範圍：' + rel);
  }
  return abs;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function nowStamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function newId(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${crypto.randomBytes(2).toString('hex')}`;
}

// Windows 資料夾名稱不能有的字元一律換掉
function safeName(name) {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80);
  return cleaned || '未命名';
}

function uniquePath(dir, name) {
  let candidate = path.join(dir, name);
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${name} (${i})`);
    i += 1;
  }
  return candidate;
}

function writeAtomic(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

// ---------- front matter 與外部格式 ----------

// 巴哈爬蟲輸出的開頭：# 標題、- 分類：… 等條列，再一條 ---
const BAHAMUT_HEAD = /^#\s+(.+)\r?\n+((?:-\s*[^\n]+\r?\n)+)\s*---\s*\r?\n/;

// 巴哈的表格（例如時數統計）被爬蟲轉成「 共通 2.4小時 |  雨 1.5小時 |」這種一行一列、
// 中間還隔空行的文字。把連續的這種行收回成標準 Markdown 表格
const PIPE_ROW = /^\s*[^|\n]*\|(?:[^|\n]*\|)+\s*$/;

function bahamutTables(body) {
  const lines = body.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (!PIPE_ROW.test(lines[i])) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    const rows = [];
    while (i < lines.length && (PIPE_ROW.test(lines[i]) || (!lines[i].trim() && PIPE_ROW.test(lines[i + 1] || '')))) {
      if (lines[i].trim()) rows.push(lines[i].trim().replace(/\|\s*$/, '').split('|').map((c) => c.trim()));
      i += 1;
    }
    const cols = Math.max(...rows.map((r) => r.length));
    const fmt = (r) => `| ${Array.from({ length: cols }, (_, k) => r[k] || '').join(' | ')} |`;
    out.push(fmt(rows[0]), `|${' --- |'.repeat(cols)}`, ...rows.slice(1).map(fmt));
  }
  return out.join('\n');
}

function isoToStamp(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : nowStamp(d);
}

// 讀進來的時候把各種來源的欄位翻成本程式的欄位；原檔不會因為「讀」而被改動，
// 只有在程式裡真的編輯後存檔，才會改寫成統一的 front matter 格式
function parseArticle(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  let meta = {};
  let body = text;
  if (m) {
    try {
      meta = YAML.parse(m[1]) || {};
    } catch {
      meta = {};
    }
    body = text.slice(m[0].length).replace(/^\s+/, '');
  }

  // Anytype 匯出：Name、Creation date、Object type
  if (!meta.title && meta.Name) meta.title = String(meta.Name);
  if (!meta.created && meta['Creation date']) meta.created = isoToStamp(meta['Creation date']);
  if (!meta.topic && Array.isArray(meta['Object type']) && meta['Object type'][0]) meta.topic = String(meta['Object type'][0]);

  // 巴哈小屋爬蟲：把開頭的資訊條列收進欄位，正文從 --- 之後開始。
  // 前面已經有 front matter（例如批次配對作品時只補了屬性）也一樣處理，front matter 的值優先
  const b = BAHAMUT_HEAD.exec(body);
  if (b) {
    const own = { ...meta };
    const info = {};
    for (const line of b[2].split(/\r?\n/)) {
      const kv = /^-\s*([^：:]+)[：:]\s*(.*)$/.exec(line.trim());
      if (kv) info[kv[1].trim()] = kv[2].trim();
    }
    meta.title = b[1].trim();
    if (info['分類']) meta.topic = info['分類'];
    if (info['發表時間']) meta.created = meta.completed = info['發表時間'].slice(0, 16);
    if (info['原文']) meta.source = info['原文'];
    if (info['標籤']) meta.tags = info['標籤'].split(/\s+/).map((t) => t.replace(/^#/, '')).filter(Boolean);
    meta.status = '完成';
    Object.assign(meta, own);
    body = bahamutTables(body.slice(b[0].length));
  }

  // 沒有任何標題欄位時，用正文第一個 # 標題
  if (!meta.title) {
    const h = /^#\s+(.+)$/m.exec(body);
    if (h) meta.title = h[1].trim();
  }
  return { meta, body, bahamut: !!b };
}

// 固定欄位順序，讓檔案用記事本打開也好讀
const META_ORDER = ['id', 'title', 'status', 'topic', 'tags', 'works', 'cover', 'created', 'updated', 'completed', 'active_seconds', 'source'];

function stringifyArticle(meta, body) {
  const ordered = {};
  for (const k of META_ORDER) if (meta[k] !== undefined) ordered[k] = meta[k];
  for (const k of Object.keys(meta)) if (!(k in ordered)) ordered[k] = meta[k];
  const yaml = YAML.stringify(ordered, { lineWidth: 0, flowCollectionPadding: false }).trimEnd();
  return `---\n${yaml}\n---\n\n${body.replace(/^\s+/, '')}`;
}

function normalizeMeta(meta, fallbackTitle) {
  const toList = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(String).filter(Boolean);
  return {
    ...meta,
    id: meta.id ? String(meta.id) : '',
    title: meta.title ? String(meta.title) : fallbackTitle,
    status: meta.status ? String(meta.status) : '撰寫中',
    topic: meta.topic ? String(meta.topic) : '',
    tags: toList(meta.tags),
    // works：連結的作品編號（v123＝VNDB、bgm123＝Bangumi、custom-…＝自建）；舊版的 games、vndb 一起併進來
    works: [...new Set([...toList(meta.works), ...toList(meta.games), ...toList(meta.vndb)])],
    cover: meta.cover ? String(meta.cover) : '',
    created: meta.created ? String(meta.created) : '',
    updated: meta.updated ? String(meta.updated) : '',
    completed: meta.completed ? String(meta.completed) : '',
    active_seconds: Number(meta.active_seconds) || 0,
  };
}

// 把 Markdown 粗略轉成純文字，給摘要與搜尋用
function plainText(md) {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s\^b-[a-z0-9]+\b/g, '')
    .replace(/^[#>\-*+\s]+|[*_`~|]/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 字數：中文、日文（漢字、假名）、韓文每個字算 1，英文與數字每個單字算 1。
// Markdown 標記、HTML、圖片語法、連結網址、段落錨點、註解都不算
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯ㇰ-ㇿｦ-ﾟ]/g;
const LATIN_WORD = /[A-Za-z0-9À-ɏ]+(?:['’.-][A-Za-z0-9À-ɏ]+)*/g;

function countWords(md) {
  const text = md
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s\^[A-Za-z0-9-]{4,}\s*$/gm, ' ')
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, ' ');
  const cjk = (text.match(CJK) || []).length;
  const latin = (text.replace(CJK, ' ').match(LATIN_WORD) || []).length;
  return cjk + latin;
}

function firstImage(md) {
  const m = /!\[[^\]]*\]\(([^)\s]+)/.exec(md);
  if (!m) return '';
  try {
    return decodeURI(m[1]).replace(/\\/g, '/');
  } catch {
    return m[1].replace(/\\/g, '/');
  }
}

// ---------- 掃描 ----------
// 一篇文章 = 一個 .md 檔。辨識規則：
//   1. 資料夾裡有 article.md → 這個資料夾就是一篇文章（本程式與巴哈爬蟲的格式）
//   2. 資料夾裡沒有子文章、但有 .md（例如 Anytype 匯出）→ 每個 .md 各是一篇
//   3. 有子文章的資料夾是「分類資料夾」，裡面零散的 .md（例如目錄清單）不當文章
// 資料夾裡只有一篇時，這篇「擁有」整個資料夾，搬移時連圖片一起搬

const ASSET_DIRS = new Set(['assets', 'files', 'images', 'schemas', 'variants']);

function listMd(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.md'));
  } catch {
    return [];
  }
}

// 文章是否獨佔所在資料夾
function ownsDir(file) {
  return path.basename(file) === ARTICLE_FILE || listMd(path.dirname(file)).length === 1;
}

function scan(root) {
  const articles = [];
  const folders = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return 0;
    }
    if (dir !== root && entries.some((e) => e.isFile() && e.name === ARTICLE_FILE)) {
      articles.push(readSummary(root, path.join(dir, ARTICLE_FILE), true));
      return 1;
    }
    let found = 0;
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_') || ASSET_DIRS.has(e.name.toLowerCase())) continue;
      found += walk(path.join(dir, e.name));
    }
    const md = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md') && e.name !== ARTICLE_FILE);
    if (found === 0 && md.length && dir !== root) {
      for (const e of md) articles.push(readSummary(root, path.join(dir, e.name), md.length === 1));
      if (md.length === 1) return 1;
      found += md.length;
    }
    if (dir !== root) folders.push(toRel(root, dir));
    return found;
  }

  walk(root);
  return { articles, folders, games: readGames(root) };
}

// 掃描結果快取：檔案的修改時間與大小沒變就不重新解析（字數、摘要都在裡面）
const summaryCache = new Map();

function readSummary(root, file, owns) {
  const stat = fs.statSync(file);
  const key = `${root}\n${file}\n${owns}`;
  const hit = summaryCache.get(key);
  if (hit && hit.mtime === stat.mtimeMs && hit.size === stat.size) return hit.summary;
  const summary = buildSummary(root, file, owns, fs.readFileSync(file, 'utf8'), stat);
  summaryCache.set(key, { mtime: stat.mtimeMs, size: stat.size, summary });
  return summary;
}

function buildSummary(root, file, owns, text, stat) {
  const { meta, body } = parseArticle(text);
  const dirAbs = path.dirname(file);
  const plain = plainText(body);
  const fallback = owns && path.basename(file) === ARTICLE_FILE ? path.basename(dirAbs) : path.basename(file, '.md');
  return {
    rel: toRel(root, file),
    dir: toRel(root, dirAbs),
    folder: toRel(root, owns ? path.dirname(dirAbs) : dirAbs),
    ownsDir: owns,
    meta: normalizeMeta(meta, fallback),
    excerpt: plain.slice(0, 160),
    text: plain.slice(0, 20000),
    words: countWords(body),
    firstImage: firstImage(body),
    mtime: stat.mtimeMs,
  };
}

function readGames(root) {
  const dir = path.join(root, GAMES_DIR);
  const games = {};
  if (!fs.existsSync(dir)) return games;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const file = path.join(dir, e.name, 'work.json');
    try {
      const g = JSON.parse(fs.readFileSync(file, 'utf8'));
      // work.json 只記檔名，搬資料夾也不會壞；這裡補成文章庫內的完整路徑
      const full = (f) => (f ? `${GAMES_DIR}/${e.name}/${path.basename(f)}` : '');
      games[g.id] = { ...g, cover: full(g.cover), customCover: full(g.customCover) };
    } catch {
      // 壞掉或不完整的作品資料就略過，不影響其他文章
    }
  }
  return games;
}

// ---------- 文章（rel 一律是 .md 檔的相對路徑） ----------

function readArticle(root, rel) {
  const file = resolveInside(root, rel);
  const { meta, body, bahamut } = parseArticle(fs.readFileSync(file, 'utf8'));
  const fallback = path.basename(file) === ARTICLE_FILE ? path.basename(path.dirname(file)) : path.basename(file, '.md');
  // 還沒在本程式改過的巴哈文章：附上爬蟲存的原始排版，編輯器用它還原置中、顏色、標題、刪除線
  const htmlFile = path.join(path.dirname(file), 'content.html');
  const html = bahamut && fs.existsSync(htmlFile) ? fs.readFileSync(htmlFile, 'utf8') : '';
  return { meta: normalizeMeta(meta, fallback), body, html };
}

function writeArticle(root, rel, meta, body) {
  const file = resolveInside(root, rel);
  const clean = { ...meta };
  // 空欄位不寫進檔案，保持乾淨
  for (const k of ['topic', 'cover', 'created', 'completed']) if (!clean[k]) delete clean[k];
  delete clean.vndb;
  delete clean.games;
  // 匯入的文章第一次存檔時補上固定編號（之後 Cloudinary 還原圖片靠它對應）
  if (!clean.id) clean.id = newId();
  if (Array.isArray(clean.works) && clean.works.length === 0) delete clean.works;
  writeAtomic(file, stringifyArticle(clean, body));
}

function createArticle(root, folderRel, title) {
  const parent = resolveInside(root, folderRel || '');
  const abs = uniquePath(parent, safeName(title || '未命名心得'));
  fs.mkdirSync(path.join(abs, 'assets'), { recursive: true });
  const stamp = nowStamp();
  const meta = {
    id: newId(),
    title: title || '未命名心得',
    status: '撰寫中',
    tags: [],
    created: stamp,
    updated: stamp,
    active_seconds: 0,
  };
  writeAtomic(path.join(abs, ARTICLE_FILE), stringifyArticle(meta, ''));
  return toRel(root, path.join(abs, ARTICLE_FILE));
}

// 資料夾名稱原本跟著標題走時，改標題就一起改名；匯入的資料夾（名稱跟標題不同）一律不動
function renameToTitle(root, rel, title, oldTitle) {
  const file = resolveInside(root, rel);
  if (path.basename(file) !== ARTICLE_FILE) return rel;
  const dir = path.dirname(file);
  const want = safeName(title);
  if (path.basename(dir) === want || path.basename(dir) !== safeName(oldTitle)) return rel;
  const target = path.join(path.dirname(dir), want);
  if (fs.existsSync(target)) return rel;
  fs.renameSync(dir, target);
  return toRel(root, path.join(target, ARTICLE_FILE));
}

function move(root, rel, targetFolderRel) {
  const file = resolveInside(root, rel);
  if (!ownsDir(file)) throw new Error('這篇和其他文章共用同一個資料夾的圖片，請在檔案總管裡整理後再搬');
  const dir = path.dirname(file);
  const targetDir = resolveInside(root, targetFolderRel || '');
  if (path.dirname(dir) === targetDir) return rel;
  if (targetDir === dir || targetDir.startsWith(dir + path.sep)) throw new Error('不能把資料夾搬進自己裡面');
  const dest = uniquePath(targetDir, path.basename(dir));
  fs.renameSync(dir, dest);
  return toRel(root, path.join(dest, path.basename(file)));
}

// 獨佔資料夾的文章整個資料夾丟資源回收筒；共用資料夾的只丟 .md
function trashTarget(root, rel) {
  const file = resolveInside(root, rel);
  return ownsDir(file) ? path.dirname(file) : file;
}

function createFolder(root, parentRel, name) {
  const parent = resolveInside(root, parentRel || '');
  const abs = uniquePath(parent, safeName(name || '新資料夾'));
  fs.mkdirSync(abs, { recursive: true });
  return toRel(root, abs);
}

// 存一張圖片到文章所在資料夾的 assets/，檔名依序編號
function saveAsset(root, articleRel, data, ext) {
  const dir = path.join(path.dirname(resolveInside(root, articleRel)), 'assets');
  fs.mkdirSync(dir, { recursive: true });
  const used = fs
    .readdirSync(dir)
    .map((f) => /^img-(\d+)\./.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  const name = `img-${pad(next)}.${ext}`;
  fs.writeFileSync(path.join(dir, name), Buffer.from(data));
  return `assets/${name}`;
}

// ---------- 文章庫設定（跟著文章庫走，換電腦也帶得走） ----------

function readLibSettings(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, APP_DIR, 'settings.json'), 'utf8'));
  } catch {
    return {};
  }
}

function writeLibSettings(root, settings) {
  const dir = path.join(root, APP_DIR);
  fs.mkdirSync(dir, { recursive: true });
  writeAtomic(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2));
}

function saveBackground(root, data, ext) {
  const dir = path.join(root, APP_DIR, 'backgrounds');
  fs.mkdirSync(dir, { recursive: true });
  const name = `bg-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(dir, name), Buffer.from(data));
  return `${APP_DIR}/backgrounds/${name}`;
}

function listThemes(root) {
  const dir = path.join(root, APP_DIR, 'themes');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return { name: f.replace(/\.json$/, ''), theme: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function saveTheme(root, name, theme) {
  const dir = path.join(root, APP_DIR, 'themes');
  fs.mkdirSync(dir, { recursive: true });
  writeAtomic(path.join(dir, safeName(name) + '.json'), JSON.stringify(theme, null, 2));
}

function deleteTheme(root, name) {
  const file = path.join(root, APP_DIR, 'themes', safeName(name) + '.json');
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

// ---------- 只更新屬性 ----------
// 批次配對作品等只動屬性的操作用：front matter 合併新值，正文一個字都不動。
// 還沒有 front matter 的匯入文章（巴哈爬蟲）會補上 front matter，原本的開頭資訊與正文照舊保留，
// 所以編輯器仍然會從 content.html 還原原始排版

function updateMeta(root, rel, patch) {
  const file = resolveInside(root, rel);
  const text = fs.readFileSync(file, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  let base;
  let rest = text;
  if (m) {
    try {
      base = YAML.parse(m[1]) || {};
    } catch {
      throw new Error('這篇的 front matter 格式有誤，先用記事本修正再試');
    }
    rest = text.slice(m[0].length);
  } else {
    const derived = parseArticle(text).meta;
    base = {};
    for (const k of ['title', 'status', 'topic', 'tags', 'created', 'completed', 'source']) if (derived[k] !== undefined) base[k] = derived[k];
  }
  const next = { ...base, ...patch };
  if ('works' in patch) {
    delete next.games;
    delete next.vndb;
    if (!Array.isArray(next.works) || !next.works.length) delete next.works;
  }
  if (!next.id) next.id = newId();
  writeAtomic(file, stringifyArticle(next, rest));
}

// ---------- 多格式版本（Markdown／巴哈／FB） ----------
// 存在文章旁的 variants/：<檔名>.<格式>.md|txt，產生時的主稿時間記在 <檔名>.variants.json

const VARIANT_EXT = { markdown: 'md', bahamut: 'txt', facebook: 'txt', thread: 'json' };

function variantPaths(root, rel, kind) {
  if (!VARIANT_EXT[kind]) throw new Error('不支援的格式：' + kind);
  const file = resolveInside(root, rel);
  const dir = path.join(path.dirname(file), 'variants');
  const base = path.basename(file, '.md');
  return { dir, file: path.join(dir, `${base}.${kind}.${VARIANT_EXT[kind]}`), info: path.join(dir, `${base}.variants.json`) };
}

function readVariantInfo(infoFile) {
  try {
    return JSON.parse(fs.readFileSync(infoFile, 'utf8'));
  } catch {
    return {};
  }
}

function listVariants(root, rel) {
  return Object.keys(VARIANT_EXT).filter((k) => fs.existsSync(variantPaths(root, rel, k).file));
}

function readVariant(root, rel, kind) {
  const p = variantPaths(root, rel, kind);
  if (!fs.existsSync(p.file)) return null;
  return { text: fs.readFileSync(p.file, 'utf8'), info: readVariantInfo(p.info)[kind] || {} };
}

function writeVariant(root, rel, kind, text, info) {
  const p = variantPaths(root, rel, kind);
  fs.mkdirSync(p.dir, { recursive: true });
  writeAtomic(p.file, text);
  if (info) {
    const all = readVariantInfo(p.info);
    all[kind] = { ...(all[kind] || {}), ...info };
    writeAtomic(p.info, JSON.stringify(all, null, 2));
  }
}

function deleteVariant(root, rel, kind) {
  const p = variantPaths(root, rel, kind);
  if (fs.existsSync(p.file)) fs.unlinkSync(p.file);
  const all = readVariantInfo(p.info);
  delete all[kind];
  if (Object.keys(all).length) writeAtomic(p.info, JSON.stringify(all, null, 2));
  else if (fs.existsSync(p.info)) fs.unlinkSync(p.info);
}

// 沒有編號的文章（匯入後從沒存過檔）補上固定編號；雲端備份與還原都靠它對應
function ensureId(root, rel) {
  const cur = readArticle(root, rel).meta.id;
  if (cur) return cur;
  updateMeta(root, rel, {});
  return readArticle(root, rel).meta.id;
}

module.exports = {
  GAMES_DIR,
  countWords,
  parseArticle,
  ensureId,
  updateMeta,
  listVariants,
  readVariant,
  writeVariant,
  deleteVariant,
  resolveInside,
  trashTarget,
  nowStamp,
  scan,
  readArticle,
  writeArticle,
  createArticle,
  renameToTitle,
  move,
  createFolder,
  saveAsset,
  readLibSettings,
  writeLibSettings,
  saveBackground,
  listThemes,
  saveTheme,
  deleteTheme,
  writeAtomic,
};
