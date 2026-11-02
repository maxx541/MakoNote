// 方塊 ⇄ Markdown。BlockNote 內建的轉換會丟掉摺疊清單與段落錨點，這裡補上：
//   摺疊清單 → <details><summary>標題</summary> 內容 </details>（GitHub、Obsidian 都看得懂）
//   被連結的段落 → 行尾加「 ^錨點」，連結寫成 [文字](#^錨點)（和 Obsidian 的段落連結同一套）
// 只有真的被連結的段落才會寫出錨點，平常的 Markdown 保持乾淨
//   置中／靠右／有顏色的段落 → 單行 HTML（見 richtext.js）
//   併排圖片 → 同一行連續的圖片語法：![](a.webp) ![](b.webp)
//   內嵌影片 → 獨立一行的連結＋註解標記：[YouTube 影片](https://…) <!-- makonote:video {"aspect":"16:9"} -->
//   書籤連結 → [標題](https://…) <!-- makonote:bookmark {"desc":"…"} -->（註解在別的軟體看不到，連結照樣能點）
//   提示框 → GitHub／Obsidian 的 callout 寫法：> [!NOTE] 換行 > 內容

import { HTML_LINE, htmlLineToBlock, needsHtml, blockToHtml } from './richtext.js';
import { parseImageLine, imageLine, rowImages, imagesProp } from './imageRow.js';
import { parseVideoUrl } from './embed.js';

const ANCHOR_TAIL = /\s\^([A-Za-z0-9-]{4,})\s*$/;
const FILE_BLOCKS = new Set(['image', 'video', 'audio', 'file', 'sideImage']);
const CUSTOM_BLOCKS = new Set(['imageRow', 'sideImage', 'videoEmbed', 'bookmark', 'callout']);

export const BLOCK_LINK_PREFIX = '#^';

function isToggle(b) {
  return b.type === 'toggleListItem' || (b.type === 'heading' && b.props && b.props.isToggleable);
}

function walk(blocks, fn) {
  for (const b of blocks) {
    fn(b);
    if (b.children && b.children.length) walk(b.children, fn);
  }
}

function inlineItems(content) {
  return Array.isArray(content) ? content : [];
}

// ---------- Markdown → 方塊 ----------

const EMBED_LINE = /^\s*\[([^\]]*)\]\(\s*<?([^)\s>]+)>?\s*\)\s*<!--\s*makonote:(video|bookmark)\s*(\{[\s\S]*?\})?\s*-->\s*$/;
const CALLOUT_HEAD = /^\s*>\s*\[!(note|tip|important|warning|caution)\]\s*(.*)$/i;
const FENCE = /^\s*(```|~~~)/;

function readAttrs(json) {
  try {
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
}

// 註解裡不能出現 --，存的時候換成 JSON 的跳脫寫法
const writeAttrs = (o) => JSON.stringify(o).replace(/--/g, '\\u002d\\u002d');

// 自訂寫法的單行（或 callout 的連續引用行）→ 方塊；不是的話回傳 null
// 文字和圖片併排：同一行裡一張帶 "side=left|right;w=0.4" 標題的圖片加上文字
//   圖在左：![](a.webp "side=left;w=0.4") 文字…　　圖在右：文字… ![](a.webp "side=right;w=0.4")
const SIDE_LEAD = /^\s*!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)\s+"side=left(?:;w=([\d.]+))?"\s*\)\s*(.*)$/;
const SIDE_TAIL = /^(.*?)\s*!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)\s+"side=right(?:;w=([\d.]+))?"\s*\)\s*$/;

// 一行文字（裡面的 <br> 是同一段裡的換行）→ 行內內容
function sideText(editor, text) {
  const content = [];
  text.split(/<br\s*\/?>/i).forEach((piece, k) => {
    if (k) content.push({ type: 'text', text: '\n', styles: {} });
    if (piece.trim()) content.push(...parseInline(editor, piece.trim()));
  });
  return content;
}

function customLine(editor, lines, i) {
  const line = lines[i];
  const sl = SIDE_LEAD.exec(line);
  if (sl) {
    const url = sl[2].startsWith('<') ? sl[2].slice(1, -1) : sl[2];
    return { block: { type: 'sideImage', props: { url, name: sl[1], side: 'left', w: Number(sl[3]) || 0.4 }, content: sideText(editor, sl[4]) }, next: i + 1 };
  }
  const st = SIDE_TAIL.exec(line);
  if (st) {
    const url = st[3].startsWith('<') ? st[3].slice(1, -1) : st[3];
    return { block: { type: 'sideImage', props: { url, name: st[2], side: 'right', w: Number(st[4]) || 0.4 }, content: sideText(editor, st[1]) }, next: i + 1 };
  }
  const row = parseImageLine(line);
  if (row) return { block: { type: 'imageRow', props: { images: imagesProp(row) } }, next: i + 1 };
  const em = EMBED_LINE.exec(line);
  if (em) {
    const attrs = readAttrs(em[4]);
    if (em[3] === 'video') return { block: { type: 'videoEmbed', props: { url: em[2], aspect: String(attrs.aspect || ''), width: Number(attrs.width) || 0 } }, next: i + 1 };
    const title = em[1] === em[2] ? '' : em[1];
    return { block: { type: 'bookmark', props: { url: em[2], title, desc: String(attrs.desc || ''), image: String(attrs.image || '') } }, next: i + 1 };
  }
  const co = CALLOUT_HEAD.exec(line);
  if (co) {
    const texts = co[2].trim() ? [co[2].trim()] : [];
    let j = i + 1;
    while (j < lines.length && /^\s*>/.test(lines[j])) {
      texts.push(lines[j].replace(/^\s*>\s?/, ''));
      j += 1;
    }
    const content = [];
    texts.forEach((t, k) => {
      if (k) content.push({ type: 'text', text: '\n', styles: {} });
      if (t.trim()) content.push(...parseInline(editor, t));
    });
    return { block: { type: 'callout', props: { kind: co[1].toLowerCase() }, content }, next: j };
  }
  return null;
}

// 切出最外層的 <details> 區塊與自訂寫法的行，其餘交給 BlockNote 解析
function splitDetails(editor, md) {
  const lines = md.split(/\r?\n/);
  const parts = [];
  let buf = [];
  let i = 0;
  let fence = false;
  while (i < lines.length) {
    // 程式碼區塊裡的內容原樣交給 BlockNote，不當成自訂寫法
    if (FENCE.test(lines[i])) {
      fence = !fence;
      buf.push(lines[i]);
      i += 1;
      continue;
    }
    if (fence) {
      buf.push(lines[i]);
      i += 1;
      continue;
    }
    const custom = customLine(editor, lines, i);
    if (custom) {
      if (buf.length) parts.push({ type: 'md', text: buf.join('\n') });
      buf = [];
      parts.push({ type: 'block', block: custom.block });
      i = custom.next;
      continue;
    }
    if (/^\s*<details(\s[^>]*)?>\s*$/i.test(lines[i])) {
      let depth = 1;
      let j = i + 1;
      const inner = [];
      while (j < lines.length && depth > 0) {
        if (/^\s*<details(\s[^>]*)?>\s*$/i.test(lines[j])) depth += 1;
        if (/^\s*<\/details>\s*$/i.test(lines[j])) depth -= 1;
        if (depth > 0) inner.push(lines[j]);
        j += 1;
      }
      const sm = inner.length ? /^\s*<summary>([\s\S]*?)<\/summary>\s*$/i.exec(inner[0]) : null;
      if (sm) {
        if (buf.length) parts.push({ type: 'md', text: buf.join('\n') });
        buf = [];
        parts.push({ type: 'details', summary: sm[1], inner: inner.slice(1).join('\n') });
        i = j;
        continue;
      }
    }
    // 置中／有顏色的段落存成單行 HTML（見 richtext.js）
    if (HTML_LINE.test(lines[i])) {
      if (buf.length) parts.push({ type: 'md', text: buf.join('\n') });
      buf = [];
      parts.push({ type: 'html', line: lines[i] });
      i += 1;
      continue;
    }
    buf.push(lines[i]);
    i += 1;
  }
  if (buf.length) parts.push({ type: 'md', text: buf.join('\n') });
  return parts;
}

function parseInline(editor, md) {
  const [first] = editor.tryParseMarkdownToBlocks(md || ' ');
  return first ? first.content : [];
}

function parseParts(editor, md) {
  const blocks = [];
  for (const p of splitDetails(editor, md)) {
    if (p.type === 'block') {
      blocks.push(p.block);
      continue;
    }
    if (p.type === 'md') {
      if (p.text.trim()) blocks.push(...editor.tryParseMarkdownToBlocks(p.text));
      continue;
    }
    if (p.type === 'html') {
      const b = htmlLineToBlock(p.line);
      if (b) blocks.push(b);
      continue;
    }
    const h = /^\s*<h([1-6])>([\s\S]*)<\/h\1>\s*$/i.exec(p.summary);
    const head = h
      ? { type: 'heading', props: { level: Math.min(Number(h[1]), 3), isToggleable: true }, content: parseInline(editor, h[2]) }
      : { type: 'toggleListItem', content: parseInline(editor, p.summary) };
    head.children = parseParts(editor, p.inner);
    blocks.push(head);
  }
  return blocks;
}

// mapUrl：存檔用的相對路徑 → 顯示用網址
export function markdownToBlocks(editor, md, mapUrl) {
  const blocks = parseParts(editor, md || '');
  walk(blocks, (b) => {
    if (FILE_BLOCKS.has(b.type) && b.props && b.props.url) b.props = { ...b.props, url: mapUrl(b.props.url) };
    if (b.type === 'imageRow') b.props = { ...b.props, images: imagesProp(rowImages(b).map((x) => ({ ...x, url: mapUrl(x.url) }))) };
    // 多行引用（例如遊戲台詞）讀回來時，BlockNote 會在每個換行後面多留一個空白，拿掉
    if (b.type === 'quote') for (const it of inlineItems(b.content)) if (it.type === 'text') it.text = it.text.replace(/\n /g, '\n');
    // 段落尾端的錨點：拿掉文字，改成這個方塊的 id
    const items = inlineItems(b.content);
    const last = items[items.length - 1];
    if (last && last.type === 'text') {
      const m = ANCHOR_TAIL.exec(last.text);
      if (m) {
        last.text = last.text.slice(0, m.index);
        if (!last.text) items.pop();
        b.id = m[1];
      }
    }
  });
  return blocks;
}

// ---------- 方塊 → Markdown ----------

function linkTargets(blocks) {
  const ids = new Set();
  const scan = (items) => {
    for (const it of items) {
      if (it.type === 'link' && typeof it.href === 'string' && it.href.startsWith(BLOCK_LINK_PREFIX)) ids.add(it.href.slice(2));
      if (Array.isArray(it.content)) scan(it.content);
    }
  };
  walk(blocks, (b) => scan(inlineItems(b.content)));
  return ids;
}

function prepare(b, targets, unmapUrl) {
  const out = { ...b, props: { ...b.props }, content: Array.isArray(b.content) ? [...b.content] : b.content };
  if (FILE_BLOCKS.has(b.type) && out.props.url) out.props.url = unmapUrl(out.props.url);
  if (b.type === 'imageRow') out.props.images = imagesProp(rowImages(b).map((x) => ({ ...x, url: unmapUrl(x.url) })));
  if (targets.has(b.id) && Array.isArray(out.content)) out.content.push({ type: 'text', text: ` ^${b.id}`, styles: {} });
  out.children = (b.children || []).map((c) => prepare(c, targets, unmapUrl));
  return out;
}

const inlineMd = (editor, content) => (content.length ? editor.blocksToMarkdownLossy([{ type: 'paragraph', props: {}, content, children: [] }]).trim() : '');

// 自訂方塊 → 一行（或 callout 的幾行）Markdown；不是自訂方塊回傳 null
function customToMarkdown(editor, b) {
  if (b.type === 'imageRow') return imageLine(rowImages(b));
  if (b.type === 'sideImage') {
    // 文字裡的換行（同段內）存成 <br>，整個併排維持單行
    const lines = [[]];
    for (const it of b.content || []) {
      if (it.type === 'text' && it.text.includes('\n')) {
        it.text.split('\n').forEach((piece, k) => {
          if (k) lines.push([]);
          if (piece) lines[lines.length - 1].push({ ...it, text: piece });
        });
      } else lines[lines.length - 1].push(it);
    }
    const text = lines.map((l) => inlineMd(editor, l)).join('<br>');
    const w = Number(b.props.w) || 0.4;
    const url = /[\s()]/.test(b.props.url) ? `<${b.props.url}>` : b.props.url;
    const img = `![${(b.props.name || '').replace(/[[\]]/g, '')}](${url} "side=${b.props.side === 'left' ? 'left' : 'right'};w=${w}")`;
    return b.props.side === 'left' ? `${img} ${text}`.trimEnd() : `${text} ${img}`.trimStart();
  }
  if (b.type === 'videoEmbed') {
    const info = parseVideoUrl(b.props.url);
    const attrs = {};
    if (b.props.aspect && (!info || b.props.aspect !== info.aspect)) attrs.aspect = b.props.aspect;
    if (Number(b.props.width)) attrs.width = Number(b.props.width);
    const label = info ? `${info.label} 影片` : '影片';
    return `[${label}](${info ? info.watchUrl : b.props.url}) <!-- makonote:video ${writeAttrs(attrs)} -->`;
  }
  if (b.type === 'bookmark') {
    const attrs = {};
    if (b.props.desc) attrs.desc = b.props.desc;
    if (b.props.image) attrs.image = b.props.image;
    const title = (b.props.title || b.props.url).replace(/[[\]]/g, '').replace(/\s+/g, ' ');
    return `[${title}](${b.props.url}) <!-- makonote:bookmark ${writeAttrs(attrs)} -->`;
  }
  if (b.type === 'callout') {
    // 依換行切成幾行，每行各自轉 Markdown，前面加「> 」
    const lines = [[]];
    for (const it of b.content || []) {
      if (it.type === 'text' && it.text.includes('\n')) {
        it.text.split('\n').forEach((piece, k) => {
          if (k) lines.push([]);
          if (piece) lines[lines.length - 1].push({ ...it, text: piece });
        });
      } else lines[lines.length - 1].push(it);
    }
    return [`> [!${(b.props.kind || 'note').toUpperCase()}]`, ...lines.map((l) => `> ${inlineMd(editor, l)}`.trimEnd())].join('\n');
  }
  return null;
}

function serialize(editor, blocks, targets, unmapUrl) {
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length) out.push(editor.blocksToMarkdownLossy(run).trim());
    run = [];
  };
  for (const b of blocks) {
    const custom = CUSTOM_BLOCKS.has(b.type) ? customToMarkdown(editor, prepare(b, targets, unmapUrl)) : null;
    if (custom !== null) {
      flush();
      out.push(custom);
      continue;
    }
    if (needsHtml(b)) {
      flush();
      out.push(blockToHtml(prepare(b, targets, unmapUrl)));
      continue;
    }
    if (!isToggle(b)) {
      run.push(prepare(b, targets, unmapUrl));
      continue;
    }
    flush();
    const head = prepare({ ...b, type: 'paragraph', props: {}, children: [] }, targets, unmapUrl);
    let summary = editor.blocksToMarkdownLossy([head]).trim().replace(/\n+/g, ' ');
    if (b.type === 'heading') summary = `<h${b.props.level}>${summary}</h${b.props.level}>`;
    const inner = serialize(editor, b.children || [], targets, unmapUrl);
    out.push(`<details>\n<summary>${summary}</summary>\n\n${inner}\n\n</details>`);
  }
  flush();
  return out.filter(Boolean).join('\n\n');
}

// unmapUrl：顯示用網址 → 存檔用的相對路徑
export function blocksToMarkdown(editor, blocks, unmapUrl) {
  const md = serialize(editor, blocks, linkTargets(blocks), unmapUrl);
  return md ? md + '\n' : '';
}
