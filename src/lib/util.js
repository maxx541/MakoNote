// 介面共用的小工具

export const api = window.api;

// 文章庫裡的檔案 → 介面可以載入的網址
export function libUrl(rel) {
  return 'lib://local/' + rel.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

// 文章庫外的檔案（小貼圖資料夾）→ lib://ext/<絕對路徑>，主程式只開放設定裡登記過的資料夾
export function extUrl(absPath) {
  return 'lib://ext/' + absPath.split(/[\\/]/).filter(Boolean).map(encodeURIComponent).join('/');
}

const ABSOLUTE = /^(https?:|lib:|data:|blob:)/i;

// 文章 .md 的相對路徑 → 它所在的資料夾（圖片路徑都從這裡算起）
export function dirOf(rel) {
  return rel.split('/').slice(0, -1).join('/');
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// 文章內的相對路徑（assets/img-01.webp）→ 可顯示的網址
// Anytype 匯出的路徑用反斜線（files\kv.webp），也一併處理
export function assetUrl(baseDir, p) {
  if (!p) return '';
  if (ABSOLUTE.test(p)) return p;
  const clean = p.replace(/\\/g, '/').split('/').map(safeDecode).join('/');
  return libUrl(baseDir ? `${baseDir}/${clean}` : clean);
}

// 反過來：可顯示的網址 → 存檔用的相對路徑；不是這篇文章資料夾裡的檔案就原樣保留
export function toRelative(baseDir, url) {
  if (!url || !url.startsWith('lib://')) return url;
  const decoded = new URL(url).pathname.split('/').filter(Boolean).map(safeDecode).join('/');
  const prefix = baseDir ? baseDir + '/' : '';
  if (!decoded.startsWith(prefix)) return url;
  // 檔名有空白等字元時要編碼，Markdown 才讀得回來
  return decoded.slice(prefix.length).split('/').map(encodeURIComponent).join('/');
}

export function nowStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h} 小時 ${m} 分`;
  if (m) return `${m} 分`;
  return `${s} 秒`;
}

export function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const p = (n) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function shortDate(stamp) {
  return stamp ? stamp.slice(0, 10) : '';
}

// 卡片與部落格模式的縮圖：文章封面 → 文中第一張圖 → 作品封面
export function articleThumb(a, games) {
  if (a.meta.cover) return assetUrl(a.dir, a.meta.cover);
  if (a.firstImage) return assetUrl(a.dir, a.firstImage);
  return gameCover(a, games);
}

// 作品封面：自己換過的優先，其次是從 VNDB／Bangumi 抓下來的
export function gameCoverUrl(g) {
  if (!g) return '';
  if (g.customCover) return libUrl(g.customCover) + `?t=${g.customCoverAt || 0}`;
  return g.cover ? libUrl(g.cover) : '';
}

// Galgame 模式與編輯頁背景：作品封面優先
export function gameCover(a, games) {
  for (const id of a.meta.works) {
    const url = gameCoverUrl(games[id]);
    if (url) return url;
  }
  return '';
}

export const SOURCE_LABEL = { vndb: 'VNDB', bangumi: 'Bangumi', custom: '自建' };

export function gameName(id, games) {
  return games[id] ? games[id].title : id;
}

export function errMsg(e) {
  return String(e && e.message ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

// ---------- Cloudinary 圖片網址 ----------

// 上傳清單（<檔名>.cloud.json）裡某個檔案的對外網址。
// 巴哈圖片網址要以圖片副檔名結尾，而且文中沒有列 webp；asJpg 時把 webp 等格式轉成 jpg 輸出（Cloudinary 的 f_jpg 轉檔）
export function cloudImageUrl(entry, asJpg) {
  if (!entry || !entry.url) return '';
  if (asJpg && /\.(webp|avif|bmp|tiff?)$/i.test(entry.url) && entry.url.includes('/image/upload/')) {
    return entry.url.replace('/image/upload/', '/image/upload/f_jpg,q_90/').replace(/\.[a-z0-9]+$/i, '.jpg');
  }
  return entry.url;
}

// toRelative() 回傳的是逐段編碼過的相對路徑；上傳清單用原始路徑當鍵
export function decodeRel(rel) {
  return String(rel).split('/').map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }).join('/');
}
