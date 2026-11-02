// 主稿（方塊）→ 各平台格式。每個轉換都吃同一份方塊資料，排版規則集中在這裡。
//   巴哈：照 bahamut-formatter 的規則（段落 [div][size=3][color=#4D5156][bgcolor=#FFFFFF]、表格微軟正黑體…）
//   FB：純文字，標題用【】，圖片標成〔圖N〕依序上傳
//   Google 文件：帶行內樣式的 HTML，貼進 Google 文件會保留格式
//   Markdown：沿用主稿的 Markdown（含置中／顏色的單行 HTML）
// img(url) 把方塊裡的圖片網址換成輸出用的路徑（目前是文章資料夾內的相對路徑，接上圖床後換成網址）

import { rowImages, rowWidths } from './imageRow.js';
import { parseVideoUrl } from './embed.js';

// BlockNote 色名在淺色背景下的色碼（巴哈與 Google 文件都是白底）
const NAMED_COLORS = {
  gray: '#9b9a97',
  brown: '#64473a',
  red: '#e03e3e',
  orange: '#d9730d',
  yellow: '#dfab01',
  green: '#4d6461',
  blue: '#0b6e99',
  purple: '#6940a5',
  pink: '#ad1a72',
};
const NAMED_BG = {
  gray: '#ebeced',
  brown: '#e9e5e3',
  red: '#fbe4e4',
  orange: '#f6e9d9',
  yellow: '#fbf3db',
  green: '#ddedea',
  blue: '#ddebf1',
  purple: '#eae4f2',
  pink: '#f4dfeb',
};
const hexOf = (c, table) => (!c || c === 'default' ? '' : c.startsWith('#') ? c : table[c] || '');

export const BLOCK_LINK = '#^';

export function cellContent(cell) {
  return cell && cell.type === 'tableCell' ? cell.content || [] : Array.isArray(cell) ? cell : typeof cell === 'string' ? [{ type: 'text', text: cell, styles: {} }] : [];
}

export function plainOf(content) {
  if (typeof content === 'string') return content;
  return (content || []).map((c) => (c.type === 'link' ? plainOf(c.content) : c.text || '')).join('');
}

const linkPara = (b, href, text) => ({ id: b.id, type: 'paragraph', props: {}, content: [{ type: 'link', href, content: [{ type: 'text', text, styles: {} }] }], children: [] });

// 本程式自訂的方塊轉成各平台都懂的方塊：
//   併排圖片 → 一張張圖片（帶 row 資訊，巴哈和 Google 文件會排回同一列）
//   內嵌影片、書籤連結 → 連結段落；提示框 → 引用
function exportable(b) {
  if (b.type === 'imageRow') {
    const list = rowImages(b);
    const urls = list.map((x) => x.url);
    return list.map((x, index) => ({ id: `${b.id}-${index}`, type: 'image', props: { url: x.url, name: x.name || '' }, children: [], row: { id: b.id, index, urls, weights: list.map((y) => y.w || 0) } }));
  }
  if (b.type === 'sideImage') {
    // 其他平台沒有圖文並排：文字在前、圖片接在後面（圖在左就圖在前）
    const para = { id: b.id + '-t', type: 'paragraph', props: {}, content: b.content || [], children: [] };
    const img = { id: b.id + '-i', type: 'image', props: { url: b.props.url, name: b.props.name || '' }, children: [] };
    return b.props.side === 'left' ? [img, para] : [para, img];
  }
  if (b.type === 'videoEmbed') {
    const info = parseVideoUrl(b.props.url);
    const url = info ? info.watchUrl : b.props.url;
    return url ? [linkPara(b, url, url)] : [];
  }
  if (b.type === 'bookmark') return b.props.url ? [linkPara(b, b.props.url, b.props.title || b.props.url)] : [];
  if (b.type === 'callout') return [{ ...b, type: 'quote', props: {}, children: [] }];
  return [b];
}

// 把方塊樹攤平成一串，摺疊清單的內容接在標題後面（各平台都沒有摺疊）
export function flatten(blocks, out = []) {
  for (const b of blocks || []) {
    out.push(...exportable(b));
    if (b.children && b.children.length) flatten(b.children, out);
  }
  return out;
}

// 巴哈內文寬約 760px；併排的圖片整列控制在這個寬度內
export const BAHAMUT_ROW_WIDTH = 740; // 留給圖片之間的空白，四張併排也不會超出

const imageBlocks = (blocks) => flatten(blocks).filter((b) => b.type === 'image' && b.props.url);

// 依序合併相鄰的同類清單項目
export function groupLists(blocks) {
  const out = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if ((b.type === 'bulletListItem' || b.type === 'numberedListItem' || b.type === 'checkListItem') && last && last.list === b.type) last.items.push(b);
    else if (b.type === 'bulletListItem' || b.type === 'numberedListItem' || b.type === 'checkListItem') out.push({ list: b.type, items: [b] });
    else out.push(b);
  }
  return out;
}

// ---------- 巴哈 ----------

const P_OPEN = '[size=3][color=#4D5156][bgcolor=#FFFFFF]';
const P_CLOSE = '[/bgcolor][/color][/size]';
const CELL_OPEN = '[size=3][color=#000000][font=微軟正黑體]';
const CELL_CLOSE = '[/font][/color][/size]';

function bbText(t) {
  let s = t.text || '';
  const st = t.styles || {};
  if (st.code) s = `[font=Consolas]${s}[/font]`;
  if (st.strike) s = `[s]${s}[/s]`;
  if (st.underline) s = `[u]${s}[/u]`;
  if (st.italic) s = `[i]${s}[/i]`;
  if (st.bold) s = `[b]${s}[/b]`;
  const bg = hexOf(st.backgroundColor, NAMED_BG);
  if (bg) s = `[bgcolor=${bg}]${s}[/bgcolor]`;
  const fg = hexOf(st.textColor, NAMED_COLORS);
  if (fg) s = `[color=${fg}]${s}[/color]`;
  return s;
}

function bbInline(content) {
  return (content || [])
    .map((c) => {
      if (c.type !== 'link') return bbText(c);
      const inner = (c.content || []).map(bbText).join('');
      // 文中段落連結在巴哈上沒有意義，只留文字
      return c.href && !c.href.startsWith(BLOCK_LINK) ? `[url=${c.href}]${inner}[/url]` : inner;
    })
    .join('');
}

const divOpen = (b) => {
  const a = b.props && b.props.textAlignment;
  return a && a !== 'left' ? `[div align=${a}]` : '[div]';
};

export const BAHAMUT_SIZES = { original: 0, large: 500, medium: 370, small: 250 };

function bbImage(url, width) {
  return `[img=${url}${width ? ` width=${width}` : ''}]`;
}

function bbBlock(b, img) {
  const content = b.content;
  switch (b.type) {
    case 'heading': {
      const lv = b.props.level;
      const align = b.props.textAlignment && b.props.textAlignment !== 'left' ? b.props.textAlignment : lv === 1 ? 'center' : '';
      const open = align ? `[div align=${align}]` : '[div]';
      const size = lv === 1 ? 6 : lv === 2 ? 5 : 4;
      return `${open}[size=${size}][b]${bbInline(content)}[/b][/size][/div]`;
    }
    case 'image':
      return `${divOpen(b)}${bbImage(img(b.props.url), 0)}[/div]`;
    case 'quote':
      return `[quote]${bbInline(content)}[/quote]`;
    case 'divider':
      return '[hr]';
    case 'table': {
      const rows = (b.content.rows || []).map(
        (row, ri) =>
          `[tr]\n${row.cells
            .map((cell) => {
              const inner = bbInline(cellContent(cell));
              return `[td]${CELL_OPEN}${ri === 0 && b.content.headerRows ? `[b]${inner}[/b]` : inner}${CELL_CLOSE}[/td]`;
            })
            .join('\n')}\n[/tr]`,
      );
      return `[table width=98% cellspacing=1 cellpadding=1 border=1 align=left]\n${rows.join('\n')}\n[/table]`;
    }
    case 'codeBlock':
      return plainOf(content)
        .split('\n')
        .map((l) => `[div][font=Consolas]${l}[/font][/div]`)
        .join('\n');
    case 'checkListItem':
      return `[div]${P_OPEN}${b.props.checked ? '☑' : '☐'} ${bbInline(content)}${P_CLOSE}[/div]`;
    default: {
      if (!Array.isArray(content)) return '';
      const inner = bbInline(content);
      if (!inner.trim()) return '';
      // 摺疊清單的標題在巴哈上以粗體段落呈現
      return `${divOpen(b)}${P_OPEN}${b.type === 'toggleListItem' ? `[b]${inner}[/b]` : inner}${P_CLOSE}[/div]`;
    }
  }
}

export function toBahamut(blocks, img) {
  const out = [];
  for (const g of groupLists(flatten(blocks))) {
    if (g.list) {
      if (g.list === 'bulletListItem') out.push(`[ul]\n${g.items.map((b) => `[li]${bbInline(b.content)}[/li]`).join('\n')}\n[/ul]`);
      else out.push(g.items.map((b, i) => bbBlock({ ...b, type: g.list === 'numberedListItem' ? 'paragraph' : b.type, content: g.list === 'numberedListItem' ? [{ type: 'text', text: `${i + 1}. `, styles: {} }, ...b.content] : b.content }, img)).join('\n'));
      continue;
    }
    // 併排圖片：整列放進同一個 [div]，每張等高、寬度依比例換算，整列不超過巴哈內文寬
    if (g.type === 'image' && g.row) {
      if (g.row.index === 0) {
        const widths = rowWidths(g.row.urls, BAHAMUT_ROW_WIDTH, 4, g.row.weights);
        out.push(`[div]${g.row.urls.map((u, i) => bbImage(img(u), widths[i])).join(' ')}[/div]`);
      }
      continue;
    }
    const s = bbBlock(g, img);
    if (s) out.push(s);
  }
  return out.join('\n\n') + '\n';
}

// ---------- 巴哈預覽（BBCode → HTML）與圖片大小／併排 ----------

const IMG_TAG = /\[img=([^\]\s]+)(?:\s+width=(\d+))?\]/g;
export const IMG_LINE = /^\s*\[div(?: align=\w+)?\]\s*((?:\[img=[^\]]+\]\s*)+)\[\/div\]\s*$/;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SIZE_PX = { 1: 10, 2: 13, 3: 16, 4: 18, 5: 24, 6: 32, 7: 48 };

// 預覽用：盡量接近巴哈的顯示。resolve(url) → 可顯示的圖片網址
export function bahamutToHtml(text, resolve) {
  let imgIndex = 0;
  const lines = text.split('\n');
  const html = lines
    .map((line, li) => {
      if (!line.trim()) return '';
      let h = esc(line);
      const isImgLine = IMG_LINE.test(line);
      h = h.replace(/\[img=([^\]\s]+)(?:\s+width=(\d+))?\]/g, (_, url, w) => {
        const idx = imgIndex++;
        const style = w ? ` style="width:${w}px"` : '';
        return `<span class="bh-img" data-idx="${idx}" data-line="${li}"><img src="${esc(resolve(url.replace(/&amp;/g, '&')))}"${style} alt=""></span>`;
      });
      h = h
        .replace(/\[div align=(\w+)\]/g, '<div style="text-align:$1">')
        .replace(/\[div\]/g, '<div>')
        .replace(/\[\/div\]/g, '</div>')
        .replace(/\[size=(\d)\]/g, (_, n) => `<span style="font-size:${SIZE_PX[n] || 16}px">`)
        .replace(/\[color=([^\]]+)\]/g, '<span style="color:$1">')
        .replace(/\[bgcolor=([^\]]+)\]/g, '<span style="background:$1">')
        .replace(/\[font=([^\]]+)\]/g, '<span style="font-family:$1">')
        .replace(/\[\/(size|color|bgcolor|font)\]/g, '</span>')
        .replace(/\[(\/?)(b|i|u|s)\]/g, '<$1$2>')
        .replace(/\[url=([^\]]+)\]/g, '<a href="$1">')
        .replace(/\[\/url\]/g, '</a>')
        .replace(/\[hr\]/g, '<hr>')
        .replace(/\[quote\]/g, '<blockquote>')
        .replace(/\[\/quote\]/g, '</blockquote>')
        .replace(/\[ul\]/g, '<ul>')
        .replace(/\[\/ul\]/g, '</ul>')
        .replace(/\[li\]/g, '<li>')
        .replace(/\[\/li\]/g, '</li>')
        .replace(/\[table[^\]]*\]/g, '<table class="bh-table">')
        .replace(/\[\/table\]/g, '</table>')
        .replace(/\[(\/?)(tr|td)\]/g, '<$1$2>');
      return isImgLine ? `<div class="bh-imgline">${h}</div>` : h;
    });
  // 同一個區塊裡的換行（例如引用裡的多句台詞）在巴哈會變成換行；區塊之間的換行只是排版用
  const STRUCT_END = /\[\/(div|tr|td|li|ul|table|quote)\]\s*$|\[hr\]\s*$/;
  const STRUCT_START = /^\s*\[(\/?(tr|td|li|ul)|table|div|hr|quote)/;
  return html
    .map((h, i) => {
      if (i === html.length - 1 || !lines[i].trim() || !lines[i + 1].trim()) return h + '\n';
      return h + (STRUCT_END.test(lines[i]) || STRUCT_START.test(lines[i + 1]) ? '\n' : '<br>');
    })
    .join('');
}

// 改第 idx 張圖的寬度（0 = 原尺寸）
export function setImageWidth(text, idx, width) {
  let n = 0;
  return text.replace(IMG_TAG, (m, url) => (n++ === idx ? bbImage(url, width) : m));
}

function imageLineIndex(lines, idx) {
  let n = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const c = (lines[i].match(IMG_TAG) || []).length;
    if (idx < n + c) return { line: i, count: c, first: n };
    n += c;
  }
  return null;
}

// 第 idx 張圖所在的圖片列，和下一個圖片列併成同一列（兩張圖並排）
export function mergeWithNext(text, idx) {
  const lines = text.split('\n');
  const at = imageLineIndex(lines, idx);
  if (!at || !IMG_LINE.test(lines[at.line])) return text;
  let j = at.line + 1;
  while (j < lines.length && !lines[j].trim()) j += 1;
  if (j >= lines.length || !IMG_LINE.test(lines[j])) return text;
  const imgs = [...(lines[at.line].match(IMG_TAG) || []), ...(lines[j].match(IMG_TAG) || [])];
  lines.splice(at.line, j - at.line + 1, `[div]${imgs.join(' ')}[/div]`);
  return lines.join('\n');
}

// 把併排的圖片列拆回一張一列
export function splitImageLine(text, idx) {
  const lines = text.split('\n');
  const at = imageLineIndex(lines, idx);
  if (!at || at.count < 2) return text;
  const imgs = lines[at.line].match(IMG_TAG);
  lines.splice(at.line, 1, imgs.map((t) => `[div]${t}[/div]`).join('\n\n'));
  return lines.join('\n');
}

export function imageInfo(text, idx) {
  const lines = text.split('\n');
  const at = imageLineIndex(lines, idx);
  if (!at) return null;
  let j = at.line + 1;
  while (j < lines.length && !lines[j].trim()) j += 1;
  const tags = lines[at.line].match(IMG_TAG) || [];
  const tag = tags[idx - at.first] || '';
  const w = /width=(\d+)/.exec(tag);
  return {
    width: w ? Number(w[1]) : 0,
    inRow: at.count > 1,
    lastInRow: idx - at.first === at.count - 1,
    canMerge: at.count === 1 || idx - at.first === at.count - 1 ? j < lines.length && IMG_LINE.test(lines[j]) && IMG_LINE.test(lines[at.line]) : false,
  };
}

// ---------- FB ----------

export function fbInline(content) {
  return (content || [])
    .map((c) => {
      if (c.type !== 'link') return c.text || '';
      const t = plainOf(c.content);
      return c.href && !c.href.startsWith(BLOCK_LINK) && c.href !== t ? `${t} ${c.href}` : t;
    })
    .join('');
}

// 回傳 { text, images }：images 是依〔圖N〕順序的圖片路徑
export function toFacebook(blocks, title, img) {
  const out = [title, ''];
  const images = [];
  for (const g of groupLists(flatten(blocks))) {
    if (g.list) {
      out.push(g.items.map((b, i) => (g.list === 'numberedListItem' ? `${i + 1}. ` : g.list === 'checkListItem' ? (b.props.checked ? '☑ ' : '☐ ') : '・') + fbInline(b.content)).join('\n'), '');
      continue;
    }
    const b = g;
    if (b.type === 'image') {
      images.push(img(b.props.url));
      out.push(`〔圖${images.length}〕`, '');
    } else if (b.type === 'heading') out.push(`【${plainOf(b.content)}】`, '');
    else if (b.type === 'quote')
      out.push(
        fbInline(b.content)
          .split('\n')
          .map((l) => `｜${l}`)
          .join('\n'),
        '',
      );
    else if (b.type === 'divider') out.push('──────────', '');
    else if (b.type === 'table') out.push((b.content.rows || []).map((r) => r.cells.map((c) => plainOf(cellContent(c))).join('｜')).join('\n'), '');
    else if (Array.isArray(b.content) && fbInline(b.content).trim()) out.push(fbInline(b.content), '');
  }
  return { text: out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n', images };
}

// ---------- Google 文件（HTML） ----------

function htmlText(t) {
  let s = esc(t.text || '').replace(/\n/g, '<br>');
  const st = t.styles || {};
  if (st.code) s = `<code>${s}</code>`;
  if (st.strike) s = `<s>${s}</s>`;
  if (st.underline) s = `<u>${s}</u>`;
  if (st.italic) s = `<i>${s}</i>`;
  if (st.bold) s = `<b>${s}</b>`;
  const css = [];
  const fg = hexOf(st.textColor, NAMED_COLORS);
  const bg = hexOf(st.backgroundColor, NAMED_BG);
  if (fg) css.push(`color:${fg}`);
  if (bg) css.push(`background-color:${bg}`);
  return css.length ? `<span style="${css.join(';')}">${s}</span>` : s;
}

function htmlInline(content) {
  return (content || [])
    .map((c) => (c.type === 'link' ? (c.href && !c.href.startsWith(BLOCK_LINK) ? `<a href="${esc(c.href)}">${(c.content || []).map(htmlText).join('')}</a>` : (c.content || []).map(htmlText).join('')) : htmlText(c)))
    .join('');
}

const alignCss = (b) => (b.props && b.props.textAlignment && b.props.textAlignment !== 'left' ? ` style="text-align:${b.props.textAlignment}"` : '');

export function toGdocHtml(blocks, title, img) {
  const out = [`<h1>${esc(title)}</h1>`];
  for (const g of groupLists(flatten(blocks))) {
    if (g.list) {
      const tag = g.list === 'numberedListItem' ? 'ol' : 'ul';
      out.push(`<${tag}>${g.items.map((b) => `<li>${g.list === 'checkListItem' ? (b.props.checked ? '☑ ' : '☐ ') : ''}${htmlInline(b.content)}</li>`).join('')}</${tag}>`);
      continue;
    }
    const b = g;
    if (b.type === 'heading') out.push(`<h${b.props.level + 1}${alignCss(b)}>${htmlInline(b.content)}</h${b.props.level + 1}>`);
    else if (b.type === 'image' && b.row) {
      // Google 文件版面寬約 620px，併排的圖片整列放在同一段
      if (b.row.index === 0) {
        const widths = rowWidths(b.row.urls, 620, 6, b.row.weights);
        out.push(`<p>${b.row.urls.map((u, i) => `<img src="${esc(img(u))}" width="${widths[i]}" alt="">`).join(' ')}</p>`);
      }
    } else if (b.type === 'image') out.push(`<p${alignCss(b)}><img src="${esc(img(b.props.url))}" style="max-width:100%" alt=""></p>`);
    else if (b.type === 'quote') out.push(`<blockquote style="border-left:3px solid #c8c8c8;margin:0;padding-left:12px;color:#555">${htmlInline(b.content)}</blockquote>`);
    else if (b.type === 'divider') out.push('<hr>');
    else if (b.type === 'table')
      out.push(
        `<table style="border-collapse:collapse">${(b.content.rows || [])
          .map((r) => `<tr>${r.cells.map((c) => `<td style="border:1px solid #999;padding:4px 10px">${htmlInline(cellContent(c))}</td>`).join('')}</tr>`)
          .join('')}</table>`,
      );
    else if (b.type === 'codeBlock') out.push(`<pre>${esc(plainOf(b.content))}</pre>`);
    else if (Array.isArray(b.content)) {
      const inner = htmlInline(b.content);
      if (inner.trim()) out.push(`<p${alignCss(b)}>${b.type === 'toggleListItem' ? `<b>${inner}</b>` : inner}</p>`);
    }
  }
  return out.join('\n');
}

export function gdocImages(blocks) {
  return imageBlocks(blocks).map((b) => b.props.url);
}
