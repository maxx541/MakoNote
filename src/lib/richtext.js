// 置中、靠右、文字顏色這些 Markdown 沒有的排版，存成單行 HTML 段落：
//   <p align="center"><strong><span style="color:#1d267e">文字</span></strong></p>
// GitHub、Obsidian 都看得懂 align；顏色保留原始色碼，之後轉巴哈格式時才不會走樣。
// 巴哈小屋爬下來的 content.html 也用同一套轉換讀進來，排版跟原文一致。

import { parseVideoUrl } from './embed.js';

// ---------- 顏色 ----------

function parseHex(c) {
  const s = String(c || '').trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return m[1].split('').map((x) => parseInt(x + x, 16));
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

const toHex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

// 黑、白、灰是巴哈的預設文字色或底色，不當成特別的顏色；只保留有色彩的
function chromatic(c) {
  if (!c) return '';
  if (/^[a-z]+$/i.test(c) && !/^(black|white|gray|grey|default)$/i.test(c)) return c.toLowerCase();
  const rgb = parseHex(c);
  if (!rgb) return '';
  return Math.max(...rgb) - Math.min(...rgb) < 24 ? '' : toHex(rgb);
}

// ---------- HTML → 行內內容 ----------

const BOLD = new Set(['B', 'STRONG']);
const ITALIC = new Set(['I', 'EM']);
const STRIKE = new Set(['S', 'STRIKE', 'DEL']);

function stylesOf(el, base) {
  const st = { ...base };
  const tag = el.tagName;
  if (BOLD.has(tag)) st.bold = true;
  if (ITALIC.has(tag)) st.italic = true;
  if (tag === 'U') st.underline = true;
  if (STRIKE.has(tag)) st.strike = true;
  if (tag === 'CODE') st.code = true;
  const css = el.style || {};
  if (/^(bold|[6-9]00)$/.test(css.fontWeight || '')) st.bold = true;
  if (css.fontStyle === 'italic') st.italic = true;
  if (/line-through/.test(css.textDecoration || '')) st.strike = true;
  if (/underline/.test(css.textDecoration || '')) st.underline = true;
  const color = chromatic(el.getAttribute('data-text-color') || el.getAttribute('color') || css.color);
  if (color) st.textColor = color;
  const bg = chromatic(el.getAttribute('data-background-color') || css.backgroundColor);
  if (bg) st.backgroundColor = bg;
  return st;
}

// 回傳 [{ type:'text'|'link', … } | { image: src }]，以及這段用到的最大字級（給判斷標題用）
function collectInline(node, base, out, info) {
  if (node.nodeType === 3) {
    const text = node.textContent.replace(/[\r\n\t]+/g, '').replace(/ {2,}/g, ' ');
    if (text) out.push({ type: 'text', text, styles: { ...base } });
    return;
  }
  if (node.nodeType !== 1) return;
  const tag = node.tagName;
  if (tag === 'BR') {
    out.push({ type: 'text', text: '\n', styles: {} });
    return;
  }
  if (tag === 'IMG') {
    out.push({ image: node.getAttribute('src') || '' });
    return;
  }
  if (tag === 'IFRAME') {
    const src = node.getAttribute('src') || '';
    // YouTube／bilibili 的內嵌播放器 → 影片方塊（和原文一樣可以直接播放）；其他嵌入內容留成連結
    const video = parseVideoUrl(src.startsWith('//') ? 'https:' + src : src);
    if (video) out.push({ video: video.watchUrl });
    else if (src) out.push({ type: 'link', href: src, content: [{ type: 'text', text: '嵌入內容', styles: {} }] });
    return;
  }
  if (tag === 'FONT' && node.getAttribute('size')) info.size = Math.max(info.size, Number(node.getAttribute('size')) || 0);
  const st = stylesOf(node, base);
  if (tag === 'A' && node.getAttribute('href')) {
    const inner = [];
    node.childNodes.forEach((c) => collectInline(c, st, inner, info));
    const textOnly = inner.filter((x) => x.type === 'text');
    if (textOnly.length) out.push({ type: 'link', href: node.getAttribute('href'), content: textOnly });
    inner.filter((x) => x.image || x.video).forEach((x) => out.push(x));
    return;
  }
  node.childNodes.forEach((c) => collectInline(c, st, out, info));
}

const sameStyles = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 文字與連結才是行內內容；圖片、影片要另外變成方塊
const isInline = (x) => x.image === undefined && !x.video;

function tidyInline(items) {
  const out = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (it.type === 'text' && prev && prev.type === 'text' && sameStyles(prev.styles, it.styles)) prev.text += it.text;
    else out.push(it.type === 'text' ? { ...it } : it);
  }
  // 頭尾的換行與空白拿掉
  while (out.length && out[0].type === 'text' && !out[0].text.replace(/^[\s\n]+/, '')) out.shift();
  if (out.length && out[0].type === 'text') out[0].text = out[0].text.replace(/^[\n ]+/, '');
  while (out.length && out[out.length - 1].type === 'text' && !out[out.length - 1].text.replace(/[\s\n]+$/, '')) out.pop();
  if (out.length && out[out.length - 1].type === 'text') out[out.length - 1].text = out[out.length - 1].text.replace(/[\n ]+$/, '');
  return out;
}

const plain = (items) => items.map((x) => (x.type === 'text' ? x.text : x.content.map((c) => c.text).join(''))).join('');

function alignOf(el, inherited) {
  const a = (el.getAttribute && (el.getAttribute('align') || (el.style && el.style.textAlign))) || '';
  if (el.tagName === 'CENTER') return 'center';
  return /^(center|right|justify|left)$/i.test(a) ? a.toLowerCase() : inherited;
}

// 一行行內內容 → 段落／標題／圖片方塊（行內夾著圖片時切開）
function lineToBlocks(items, align, info, mapUrl) {
  const blocks = [];
  let buf = [];
  const flush = () => {
    const content = tidyInline(buf);
    buf = [];
    if (!content.length) return;
    const props = align && align !== 'left' ? { textAlignment: align } : {};
    const text = plain(content);
    const allBold = content.every((c) => c.type !== 'text' || !c.text.trim() || c.styles.bold);
    // 字級 4 以上、整行粗體、而且是短句 → 當作小標題
    if (info.size >= 4 && allBold && text.length <= 40 && !text.includes('\n')) {
      const level = info.size >= 5 ? 2 : 3;
      content.forEach((c) => c.type === 'text' && delete c.styles.bold);
      blocks.push({ type: 'heading', props: { ...props, level }, content });
    } else {
      blocks.push({ type: 'paragraph', props, content });
    }
  };
  for (const it of items) {
    if (it.video) {
      flush();
      blocks.push({ type: 'videoEmbed', props: { url: it.video } });
    } else if (it.image !== undefined) {
      flush();
      if (it.image) blocks.push({ type: 'image', props: { url: mapUrl(it.image), ...(align === 'center' ? { textAlignment: 'center' } : {}) } });
    } else buf.push(it);
  }
  flush();
  return blocks;
}

const BLOCK_TAGS = new Set(['DIV', 'P', 'CENTER', 'SECTION', 'ARTICLE', 'TABLE', 'UL', 'OL', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'FIGURE']);

function convertChildren(el, align, mapUrl, out) {
  let line = [];
  let info = { size: 0 };
  const flush = () => {
    if (line.length) out.push(...lineToBlocks(line, align, info, mapUrl));
    line = [];
    info = { size: 0 };
  };
  for (const child of el.childNodes) {
    if (child.nodeType === 1 && BLOCK_TAGS.has(child.tagName)) {
      flush();
      convertBlock(child, align, mapUrl, out);
    } else if (child.nodeType === 1 && child.tagName === 'BR' && !line.some((x) => x.type === 'text' && x.text.trim())) {
      // 行首的空白換行只是間距
    } else {
      collectInline(child, {}, line, info);
    }
  }
  flush();
}

function convertBlock(el, inherited, mapUrl, out) {
  const tag = el.tagName;
  const align = alignOf(el, inherited);
  if (tag === 'HR') return;
  if (/^H[1-6]$/.test(tag)) {
    const items = [];
    collectInline(el, {}, items, { size: 0 });
    const content = tidyInline(items.filter(isInline));
    if (content.length) {
      content.forEach((c) => c.type === 'text' && delete c.styles.bold);
      const level = Math.min(Math.max(Number(tag[1]), 2), 3);
      out.push({ type: 'heading', props: { level, ...(align && align !== 'left' ? { textAlignment: align } : {}) }, content });
    }
    items.filter((x) => x.image).forEach((x) => out.push({ type: 'image', props: { url: mapUrl(x.image) } }));
    items.filter((x) => x.video).forEach((x) => out.push({ type: 'videoEmbed', props: { url: x.video } }));
    return;
  }
  if (tag === 'TABLE') {
    const rows = [...el.querySelectorAll('tr')].map((tr) => ({
      cells: [...tr.children].map((td) => {
        const items = [];
        collectInline(td, {}, items, { size: 0 });
        return tidyInline(items.filter(isInline).map((x) => (x.type === 'text' ? { ...x, text: x.text.replace(/\n/g, ' ') } : x)));
      }),
    }));
    // 沒有儲存格的空列 BlockNote 不收（整篇會讀不進來），去掉；各列補齊成一樣的欄數
    const kept = rows.filter((r) => r.cells.length);
    const cols = Math.max(0, ...kept.map((r) => r.cells.length));
    kept.forEach((r) => {
      while (r.cells.length < cols) r.cells.push([]);
    });
    if (kept.length) out.push({ type: 'table', content: { type: 'tableContent', rows: kept } });
    return;
  }
  if (tag === 'UL' || tag === 'OL') {
    for (const li of el.children) {
      if (li.tagName !== 'LI') continue;
      const items = [];
      collectInline(li, {}, items, { size: 0 });
      const content = tidyInline(items.filter(isInline));
      if (content.length) out.push({ type: tag === 'UL' ? 'bulletListItem' : 'numberedListItem', content });
    }
    return;
  }
  if (tag === 'BLOCKQUOTE') {
    const inner = [];
    convertChildren(el, align, mapUrl, inner);
    const content = [];
    for (const b of inner) {
      if (b.type === 'image' || b.type === 'videoEmbed') out.push(b);
      else if (b.content && b.content.length) {
        if (content.length) content.push({ type: 'text', text: '\n', styles: {} });
        content.push(...b.content);
      }
    }
    if (content.length) out.push({ type: 'quote', content });
    return;
  }
  convertChildren(el, align, mapUrl, out);
}

// 巴哈小屋爬蟲的 content.html → 方塊（mapUrl：圖片相對路徑 → 可顯示網址）
export function bahamutHtmlToBlocks(html, mapUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('#article_content') || doc.body;
  const out = [];
  convertChildren(root, '', mapUrl, out);
  return out;
}

// ---------- 自己存的單行 HTML 段落 ----------

export const HTML_LINE = /^\s*<(p|h[1-6])(\s[^>]*)?>[\s\S]*<\/\1>\s*$/i;

export function htmlLineToBlock(line) {
  const doc = new DOMParser().parseFromString(line, 'text/html');
  const el = doc.body.firstElementChild;
  if (!el) return null;
  const items = [];
  collectInline(el, {}, items, { size: 0 });
  const content = tidyInline(items.filter(isInline));
  const align = alignOf(el, '');
  const props = align && align !== 'left' ? { textAlignment: align } : {};
  if (/^H/.test(el.tagName)) return { type: 'heading', props: { ...props, level: Math.min(Number(el.tagName[1]), 3) }, content };
  return { type: 'paragraph', props, content };
}

// ---------- 方塊 → 單行 HTML ----------

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

function colorAttr(kind, value) {
  // 色碼存成 style（通用）；BlockNote 的色名（blue…）存成 data 屬性
  if (/^#/.test(value)) return kind === 'text' ? ` style="color:${value}"` : ` style="background-color:${value}"`;
  return kind === 'text' ? ` data-text-color="${attr(value)}"` : ` data-background-color="${attr(value)}"`;
}

function textToHtml(t) {
  let h = esc(t.text);
  const s = t.styles || {};
  if (s.code) h = `<code>${h}</code>`;
  if (s.strike) h = `<s>${h}</s>`;
  if (s.underline) h = `<u>${h}</u>`;
  if (s.italic) h = `<em>${h}</em>`;
  if (s.bold) h = `<strong>${h}</strong>`;
  if (s.backgroundColor && s.backgroundColor !== 'default') h = `<span${colorAttr('bg', s.backgroundColor)}>${h}</span>`;
  if (s.textColor && s.textColor !== 'default') h = `<span${colorAttr('text', s.textColor)}>${h}</span>`;
  return h;
}

export function inlineToHtml(content) {
  return (content || [])
    .map((c) => (c.type === 'link' ? `<a href="${attr(c.href)}">${(c.content || []).map(textToHtml).join('')}</a>` : textToHtml(c)))
    .join('');
}

function hasColor(content) {
  return (content || []).some((c) => {
    if (c.type === 'link') return hasColor(c.content);
    const s = c.styles || {};
    return (s.textColor && s.textColor !== 'default') || (s.backgroundColor && s.backgroundColor !== 'default');
  });
}

// 段落或標題有置中／靠右，或有文字顏色時，才改存 HTML；其餘維持一般 Markdown
export function needsHtml(b) {
  if (b.type !== 'paragraph' && b.type !== 'heading') return false;
  if (b.children && b.children.length) return false;
  const align = b.props && b.props.textAlignment;
  return (align && align !== 'left') || hasColor(b.content);
}

export function blockToHtml(b) {
  const tag = b.type === 'heading' ? `h${b.props.level}` : 'p';
  const align = b.props.textAlignment && b.props.textAlignment !== 'left' ? ` align="${b.props.textAlignment}"` : '';
  return `<${tag}${align}>${inlineToHtml(b.content)}</${tag}>`;
}
