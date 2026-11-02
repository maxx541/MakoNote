// 圖片併排：一排 2～4 張，每張等高縮放、整排剛好填滿寬度。
// 方塊的 props.images 是 JSON 字串：[{ url, name }]（BlockNote 的屬性只能存字串／數字）。
// 存成 Markdown 時是同一行連續的圖片語法：![](a.webp) ![](b.webp)，別的軟體也會顯示成並排或連續的圖。

export const MAX_PER_ROW = 4;

export function rowImages(block) {
  try {
    const list = JSON.parse((block && block.props && block.props.images) || '[]');
    return Array.isArray(list) ? list.filter((x) => x && x.url) : [];
  } catch {
    return [];
  }
}

// w＝這張在整排裡的寬度比重（拖中間的分隔線調過才有；沒有就是預設的等高）
export const imagesProp = (list) => JSON.stringify(list.map(({ url, name, w }) => ({ url, name: name || '', ...(w > 0 ? { w } : {}) })));

// 圖片的寬高比（寬÷高）。顯示時量到就記下來，轉巴哈格式算寬度時用；沒量到的當 4:3
const ratios = new Map();

export function rememberRatio(url, w, h) {
  if (url && w > 0 && h > 0) ratios.set(url, w / h);
}

export const ratioOf = (url) => ratios.get(url) || 4 / 3;

// 整排要放進 total 寬度（px）：沒調過就等高，每張寬度依比例分配；調過的（weights）照比重。中間留 gap
export function rowWidths(urls, total, gap = 4, weights = []) {
  const rs = urls.map((u, i) => (weights[i] > 0 ? weights[i] : ratioOf(u)));
  const sum = rs.reduce((a, b) => a + b, 0) || 1;
  const usable = total - gap * (urls.length - 1);
  return rs.map((r) => Math.max(40, Math.floor((usable * r) / sum)));
}

// 一行 Markdown 是不是「兩張以上的圖片、中間只有空白」→ 回傳 [{ url, name }]
const IMG = /!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+"([^"]*)")?\s*\)/g;

export function parseImageLine(line) {
  const t = line.trim();
  if (!t.startsWith('![')) return null;
  const list = [];
  let rest = t;
  for (const m of t.matchAll(IMG)) {
    let url = m[2];
    if (url.startsWith('<')) url = url.slice(1, -1);
    const w = /^w=([\d.]+)$/.exec(m[3] || '');
    list.push({ url, name: m[1], ...(w ? { w: Number(w[1]) } : {}) });
    rest = rest.replace(m[0], '');
  }
  return list.length >= 2 && !rest.trim() ? list : null;
}

// Markdown 的圖片網址遇到空白或括號要包起來
const mdUrl = (u) => (/[\s()]/.test(u) ? `<${u}>` : u);

export function imageLine(list) {
  // 調過寬度比重的圖，在網址後面加 "w=1.23"（Markdown 的圖片標題，別的軟體只當成滑過去的提示文字）
  return list.map((x) => `![${(x.name || '').replace(/[[\]]/g, '')}](${mdUrl(x.url)}${x.w > 0 ? ` "w=${x.w}"` : ''})`).join(' ');
}
