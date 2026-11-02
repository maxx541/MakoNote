// 作品資料來源：VNDB（視覺小說）、Bangumi（遊戲、動畫、書籍），或自己建立。
// 資料與封面存到 <文章庫>/_works/<編號>/（work.json＋cover.*），之後不需要網路。
// 編號：VNDB 是 v12345、Bangumi 是 bgm12345、自建的是 custom-xxxx
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { GAMES_DIR, writeAtomic } = require('./library.cjs');

const UA = 'MakoNote/0.1 (personal writing app)';

// ---------- VNDB ----------

const VNDB_API = 'https://api.vndb.org/kana/vn';
const VNDB_FIELDS = 'id,title,alttitle,aliases,released,developers.name,image.url,image.sexual';

async function vndbQuery(filters, results = 12) {
  const res = await fetch(VNDB_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filters, fields: VNDB_FIELDS, results, sort: filters[0] === 'search' ? 'searchrank' : 'id' }),
  });
  if (!res.ok) throw new Error(`VNDB 回應 ${res.status}`);
  return (await res.json()).results.map((v) => ({
    id: v.id,
    source: 'vndb',
    kind: '遊戲',
    title: v.alttitle || v.title,
    romaji: v.title,
    aliases: Array.isArray(v.aliases) ? v.aliases : String(v.aliases || '').split('\n').filter(Boolean),
    released: v.released || '',
    developers: (v.developers || []).map((d) => d.name),
    imageUrl: v.image ? v.image.url : '',
    nsfw: v.image ? v.image.sexual > 1 : false,
    url: `https://vndb.org/${v.id}`,
  }));
}

// ---------- Bangumi ----------

const BGM_API = 'https://api.bgm.tv/v0';
// Bangumi 的條目類型
const BGM_KIND = { 1: '書籍', 2: '動畫', 3: '音樂', 4: '遊戲', 6: '三次元' };
const BGM_TYPES = { game: [4], anime: [2], book: [1], work: [4, 2] };

function infoValues(infobox, keys) {
  const out = [];
  for (const item of infobox || []) {
    if (!keys.includes(item.key)) continue;
    const vals = Array.isArray(item.value) ? item.value.map((x) => x.v) : [item.value];
    for (const v of vals) if (v) out.push(...String(v).split(/[、/]/).map((s) => s.trim()).filter(Boolean));
  }
  return out;
}

function bgmToWork(s) {
  const img = s.images || {};
  return {
    id: `bgm${s.id}`,
    source: 'bangumi',
    kind: BGM_KIND[s.type] || '',
    title: s.name || s.name_cn,
    titleCn: s.name_cn || '',
    romaji: '',
    aliases: [s.name_cn, ...infoValues(s.infobox, ['别名', '中文名'])].filter(Boolean),
    released: s.date || '',
    developers: infoValues(s.infobox, ['开发', '游戏开发商', '开发商', '动画制作', '作者']),
    imageUrl: img.large || img.common || '',
    thumbUrl: img.common || img.medium || img.large || '',
    nsfw: !!s.nsfw,
    url: `https://bgm.tv/subject/${s.id}`,
  };
}

async function bgmFetch(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`Bangumi 回應 ${res.status}`);
  return res.json();
}

// ---------- 對外 ----------

// source：vndb / bangumi；bgmTypes：game / anime / book / work（遊戲＋動畫）
async function search(source, text, bgmTypes = 'work', limit = 12) {
  const q = String(text || '').trim();
  if (!q) return [];
  if (source === 'bangumi') {
    if (/^(bgm)?\d+$/i.test(q)) return [bgmToWork(await bgmFetch(`${BGM_API}/subjects/${q.replace(/^bgm/i, '')}`))];
    const data = await bgmFetch(`${BGM_API}/search/subjects?limit=${limit}`, {
      method: 'POST',
      body: JSON.stringify({ keyword: q, filter: { type: BGM_TYPES[bgmTypes] || BGM_TYPES.work } }),
    });
    return (data.data || []).map(bgmToWork);
  }
  if (/^v\d+$/i.test(q)) return vndbQuery(['id', '=', q.toLowerCase()], 1);
  return vndbQuery(['search', '=', q], limit);
}

async function downloadCover(dir, url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return '';
  const ext = (path.extname(new URL(url).pathname) || '.jpg').slice(1).toLowerCase();
  const name = `cover.${ext}`;
  fs.writeFileSync(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
  return name;
}

function workDir(root, id) {
  const dir = path.join(root, GAMES_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readWork(root, id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, GAMES_DIR, id, 'work.json'), 'utf8'));
  } catch {
    return null;
  }
}

// work.json 只記封面檔名；回傳給介面時補成文章庫內的完整路徑
function writeWork(root, work) {
  writeAtomic(path.join(workDir(root, work.id), 'work.json'), JSON.stringify(work, null, 2));
  const full = (f) => (f ? `${GAMES_DIR}/${work.id}/${f}` : '');
  return { ...work, cover: full(work.cover), customCover: full(work.customCover) };
}

async function bind(root, id) {
  let work;
  if (/^bgm\d+$/.test(id)) {
    const s = await bgmFetch(`${BGM_API}/subjects/${id.slice(3)}`);
    work = bgmToWork(s);
    // Bangumi 常附上 VNDB 連結，記下來以後可以交叉對照
    const links = ((s.infobox || []).find((x) => x.key === '链接') || { value: [] }).value;
    const v = Array.isArray(links) && links.find((x) => x.k === 'VNDB');
    if (v) work.vndb = (/v\d+/.exec(v.v) || [])[0] || '';
  } else {
    [work] = await vndbQuery(['id', '=', id], 1);
  }
  if (!work) throw new Error('找不到 ' + id);
  const old = readWork(root, work.id);
  const dir = workDir(root, work.id);
  if (work.imageUrl) {
    const name = await downloadCover(dir, work.imageUrl);
    if (name) work.cover = name;
  }
  // 重新抓資料時保留自己換過的封面
  if (old && old.customCover) {
    work.customCover = old.customCover;
    work.customCoverAt = old.customCoverAt;
  }
  work.fetched = new Date().toISOString();
  return writeWork(root, work);
}

// 資料庫裡沒有的作品，自己建一筆
function createCustom(root, title) {
  const id = `custom-${crypto.randomBytes(3).toString('hex')}`;
  return writeWork(root, { id, source: 'custom', kind: '', title: String(title).trim(), aliases: [], developers: [], released: '' });
}

// 自訂封面：存成 cover-custom.*，原本抓下來的封面保留，隨時可以還原
function setCustomCover(root, id, data, ext) {
  const work = readWork(root, id);
  if (!work) throw new Error('找不到作品資料 ' + id);
  const dir = workDir(root, id);
  for (const f of fs.readdirSync(dir)) if (f.startsWith('cover-custom.')) fs.unlinkSync(path.join(dir, f));
  if (data) {
    work.customCover = `cover-custom.${ext}`;
    work.customCoverAt = Date.now();
    fs.writeFileSync(path.join(dir, work.customCover), Buffer.from(data));
  } else {
    delete work.customCover;
  }
  return writeWork(root, work);
}

function updateWork(root, id, patch) {
  const work = readWork(root, id);
  if (!work) throw new Error('找不到作品資料 ' + id);
  return writeWork(root, { ...work, ...patch, id });
}

module.exports = { search, bind, createCustom, setCustomCover, updateWork };
