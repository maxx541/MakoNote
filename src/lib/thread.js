// 串文（Threads、X、Bluesky）：把主稿拆成多則，每則一個字數上限；方塊可以在則與則之間搬動。
// 資料長這樣（存在 variants/<檔名>.thread.json）：
//   { version: 1, platform, numbering, posts: [ { id, items: [ { id, type: 'text', text } | { id, type: 'image', src } ] } ] }
// 這裡全部是純函式，不碰畫面。
import { flatten, groupLists, fbInline, plainOf, cellContent } from './formats.js';

export const THREAD_PLATFORMS = {
  threads: { label: 'Threads（500 字）', limit: 500, cjkWeight: 1, maxImages: 10 },
  x: { label: 'X（280，中日文每字算 2）', limit: 280, cjkWeight: 2, maxImages: 4 },
  bluesky: { label: 'Bluesky（300 字）', limit: 300, cjkWeight: 1, maxImages: 4 },
};

const CJK = /[ᄀ-ᇿ⺀-鿿ꥠ-꥿가-퟿豈-﫿＀-￯]/u;
const URL_RE = /https?:\/\/\S+/g;

let counter = 0;
export const newId = () => `t${Date.now().toString(36)}${(counter += 1).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// 平台算的「字數」：X 的中日韓字算 2、網址一律算 23
export function threadLength(text, platform) {
  const p = THREAD_PLATFORMS[platform] || THREAD_PLATFORMS.threads;
  let s = String(text);
  let n = 0;
  if (platform === 'x') {
    s = s.replace(URL_RE, () => {
      n += 23;
      return '';
    });
  }
  for (const ch of s) n += CJK.test(ch) ? p.cjkWeight : 1;
  return n;
}

// 結尾的「 1/12」佔的位置先預留
const NUMBERING_RESERVE = 8;
export const postText = (post) => post.items.filter((i) => i.type === 'text').map((i) => i.text.trim()).filter(Boolean).join('\n\n');
export const postImages = (post) => post.items.filter((i) => i.type === 'image');

// 複製出去的樣子：文字＋（選用）結尾編號
export function copyText(data, index) {
  const t = postText(data.posts[index]);
  return data.numbering ? `${t}\n\n${index + 1}/${data.posts.length}` : t;
}

export function postLength(data, index) {
  return threadLength(copyText(data, index), data.platform);
}

// ---------- 主稿方塊 → 單位（文字段或圖片） ----------

function toUnits(blocks, img) {
  const units = [];
  const text = (t, extra = {}) => t.trim() && units.push({ kind: 'text', text: t.trim(), ...extra });
  for (const g of groupLists(flatten(blocks))) {
    if (g.list) {
      text(g.items.map((b, i) => (g.list === 'numberedListItem' ? `${i + 1}. ` : g.list === 'checkListItem' ? (b.props.checked ? '☑ ' : '☐ ') : '・') + fbInline(b.content)).join('\n'));
      continue;
    }
    const b = g;
    if (b.type === 'image') {
      if (b.props.url) units.push({ kind: 'image', src: img(b.props.url) });
    } else if (b.type === 'heading') text(`【${plainOf(b.content)}】`, { heading: true });
    else if (b.type === 'quote') text(fbInline(b.content).split('\n').map((l) => `｜${l}`).join('\n'));
    else if (b.type === 'divider') continue;
    else if (b.type === 'table') text((b.content.rows || []).map((r) => r.cells.map((c) => plainOf(cellContent(c))).join('｜')).join('\n'));
    else if (Array.isArray(b.content)) text(fbInline(b.content));
  }
  return units;
}

// 太長的一段，依句子拆成不超過上限的幾段（第一段可以用比較小的上限，塞進目前這則剩下的空間）；單一句子還是太長就硬切
function splitLong(text, cap, platform, firstCap = cap) {
  if (threadLength(text, platform) <= firstCap) return [text];
  const out = [];
  const lim = () => (out.length === 0 ? firstCap : cap);
  let cur = '';
  const flush = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = '';
  };
  for (const s of text.split(/(?<=[。！？!?；;\n])/).filter((x) => x.length)) {
    if (threadLength(s, platform) > lim()) {
      flush();
      let piece = '';
      for (const ch of s) {
        if (threadLength(piece + ch, platform) > lim()) {
          out.push(piece.trim());
          piece = '';
        }
        piece += ch;
      }
      cur = piece;
    } else if (threadLength(cur + s, platform) > lim()) {
      flush();
      cur = s;
    } else cur += s;
  }
  flush();
  return out;
}

// 主稿 → 串文。標題在目前這則用掉一半以上時換新的一則；圖片放在它前面那段文字所在的那則
export function toThread(blocks, platform, numbering, img) {
  const p = THREAD_PLATFORMS[platform] || THREAD_PLATFORMS.threads;
  const cap = p.limit - (numbering ? NUMBERING_RESERVE : 0);
  const posts = [];
  let cur = { id: newId(), items: [], len: 0, imgs: 0 };
  const close = () => {
    if (cur.items.length) posts.push({ id: cur.id, items: cur.items });
    cur = { id: newId(), items: [], len: 0, imgs: 0 };
  };
  for (const u of toUnits(blocks, img)) {
    if (u.kind === 'image') {
      if (cur.imgs >= p.maxImages) close();
      cur.items.push({ id: newId(), type: 'image', src: u.src });
      cur.imgs += 1;
      continue;
    }
    if (u.heading && cur.len > cap * 0.5) close();
    // 這一段放不進目前這則：剩下的空間夠大（至少三成）就先塞一部分，不夠就整段換到新的一則
    let room = cap - (cur.len ? cur.len + 2 : 0);
    if (threadLength(u.text, platform) > room && room < cap * 0.3) {
      close();
      room = cap;
    }
    for (const chunk of splitLong(u.text, cap, platform, room)) {
      const l = threadLength(chunk, platform) + (cur.len ? 2 : 0);
      if (cur.len && cur.len + l > cap) close();
      cur.items.push({ id: newId(), type: 'text', text: chunk });
      cur.len += l;
    }
  }
  close();
  if (!posts.length) posts.push({ id: newId(), items: [{ id: newId(), type: 'text', text: '' }] });
  return { version: 1, platform, numbering, posts };
}

// ---------- 編輯操作（回傳新資料，不改原本的） ----------

const clone = (d) => ({ ...d, posts: d.posts.map((p) => ({ ...p, items: [...p.items] })) });

function locate(d, itemId) {
  for (let pi = 0; pi < d.posts.length; pi += 1) {
    const ii = d.posts[pi].items.findIndex((i) => i.id === itemId);
    if (ii >= 0) return { pi, ii };
  }
  return null;
}

// 搬完空掉的那則就拿掉；至少留一則
function tidy(d) {
  d.posts = d.posts.filter((p) => p.items.length);
  if (!d.posts.length) d.posts = [{ id: newId(), items: [{ id: newId(), type: 'text', text: '' }] }];
  return d;
}

// 把方塊搬到第 toPost 則的第 toIndex 個位置（拖曳用）
export function moveItem(data, itemId, toPost, toIndex) {
  const d = clone(data);
  const at = locate(d, itemId);
  if (!at) return data;
  const [item] = d.posts[at.pi].items.splice(at.ii, 1);
  // 同一則裡往後搬時，拿掉自己之後位置會往前移一格
  const idx = at.pi === toPost && toIndex > at.ii ? toIndex - 1 : toIndex;
  d.posts[toPost].items.splice(Math.max(0, Math.min(idx, d.posts[toPost].items.length)), 0, item);
  return tidy(d);
}

// 上移／下移一格；移到頭或尾就跨到相鄰那一則
export function shiftItem(data, itemId, dir) {
  const at = locate(data, itemId);
  if (!at) return data;
  const { pi, ii } = at;
  const last = data.posts[pi].items.length - 1;
  if (dir < 0) {
    if (ii > 0) return moveItem(data, itemId, pi, ii - 1);
    if (pi === 0) return data;
    return moveItem(data, itemId, pi - 1, data.posts[pi - 1].items.length);
  }
  if (ii < last) return moveItem(data, itemId, pi, ii + 2);
  if (pi === data.posts.length - 1) return data;
  return moveItem(data, itemId, pi + 1, 0);
}

// 從這個方塊開始拆成新的一則
export function splitBefore(data, itemId) {
  const at = locate(data, itemId);
  if (!at || at.ii === 0) return data;
  const d = clone(data);
  const rest = d.posts[at.pi].items.splice(at.ii);
  d.posts.splice(at.pi + 1, 0, { id: newId(), items: rest });
  return d;
}

export function mergeWithPrev(data, postIndex) {
  if (postIndex <= 0) return data;
  const d = clone(data);
  d.posts[postIndex - 1].items.push(...d.posts[postIndex].items);
  d.posts.splice(postIndex, 1);
  return d;
}

export function editText(data, itemId, text) {
  const d = clone(data);
  const at = locate(d, itemId);
  if (!at) return data;
  d.posts[at.pi].items[at.ii] = { ...d.posts[at.pi].items[at.ii], text };
  return d;
}

export function removeItem(data, itemId) {
  const d = clone(data);
  const at = locate(d, itemId);
  if (!at) return data;
  d.posts[at.pi].items.splice(at.ii, 1);
  return tidy(d);
}

export function addTextItem(data, postIndex) {
  const d = clone(data);
  d.posts[postIndex].items.push({ id: newId(), type: 'text', text: '' });
  return d;
}

export function parseThread(text) {
  try {
    const d = JSON.parse(text);
    return d && Array.isArray(d.posts) ? d : null;
  } catch {
    return null;
  }
}
