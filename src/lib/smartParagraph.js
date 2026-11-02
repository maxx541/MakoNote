// 智能分段：用「句尾符號」判斷一段話結束了沒。
// 沒有句號（或問號、驚嘆號…）就代表這段還沒講完，下一行應該接在同一個文字塊裡；有了才分段。
// 三個地方用它：按 Enter（沒句號先換行）、貼上多行文字（依句號重新分段）、整理已經被切碎的文字塊。

export const DEFAULT_SMART = {
  enter: true, // 按 Enter：句子還沒結束就先換行，留在同一個文字塊（連按兩次 Enter 才開新的）
  paste: true, // 貼上多行純文字：依句尾符號重新分段，不再一行一個文字塊
  ends: '。！？!?…⋯.', // 算「一句話結束」的符號，可以自訂
  join: 'auto', // 併段時怎麼接：auto＝直接接起來（英文單字間補空白）／break＝保留成同一段裡的換行
};

// 句尾符號後面還可以跟著的收尾符號：「……。」「好嗎？）」都還是算句子結束
const CLOSERS = '」』）)】》〉”’"\'］]';

export function mergeSmart(saved) {
  return { ...DEFAULT_SMART, ...(saved || {}) };
}

export function endsSentence(text, ends) {
  let t = (text || '').replace(/[\s　]+$/, '');
  while (t && CLOSERS.includes(t[t.length - 1])) t = t.slice(0, -1);
  return !!t && !!ends && ends.includes(t[t.length - 1]);
}

const isWordChar = (c) => /[A-Za-z0-9]/.test(c || '');

// 兩段文字接起來中間放什麼：中日文直接接、英文單字之間補空白、設成 break 就是同段換行
function joiner(a, b, mode) {
  if (mode === 'break') return '\n';
  const x = (a || '').replace(/\s+$/, '').slice(-1);
  const y = (b || '').replace(/^\s+/, '').slice(0, 1);
  return isWordChar(x) && isWordChar(y) ? ' ' : '';
}

// ---------- 純文字（貼上） ----------

// 一大段文字 → 依句尾符號分好的段落。空行一定是分段；整段文字連一個句尾符號都沒有時回傳 null（可能是清單，交給原本的貼上）
export function reflowText(text, opts) {
  const o = mergeSmart(opts);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (!lines.some((l) => endsSentence(l, o.ends))) return null;
  const out = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push(buf);
    buf = '';
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    buf = buf ? buf + joiner(buf, line, o.join) + line : line;
    if (endsSentence(line, o.ends)) flush();
  }
  flush();
  return out;
}

// ---------- 編輯器裡的文字塊 ----------

const inlineText = (content) =>
  (Array.isArray(content) ? content : [])
    .map((c) => (c.type === 'link' ? inlineText(c.content) : c.text || ''))
    .join('');

const mergeable = (b) => b.type === 'paragraph' && !(b.children && b.children.length);

// 把連續、還沒講完的段落併起來。回傳 { groups, from, to }；groups 每項是要併成一個的原始方塊陣列
export function planMerge(blocks, opts) {
  const o = mergeSmart(opts);
  const groups = [];
  let cur = [];
  const flush = () => {
    if (cur.length) groups.push(cur);
    cur = [];
  };
  for (const b of blocks) {
    if (!mergeable(b) || !inlineText(b.content).trim()) {
      flush();
      groups.push([b]);
      continue;
    }
    cur.push(b);
    if (endsSentence(inlineText(b.content), o.ends)) flush();
  }
  flush();
  return { groups, from: blocks.length, to: groups.length };
}

function mergedContent(group, mode) {
  const out = [];
  group.forEach((b, i) => {
    if (i > 0) {
      const j = joiner(inlineText(group[i - 1].content), inlineText(b.content), mode);
      if (j) out.push({ type: 'text', text: j, styles: {} });
    }
    out.push(...(Array.isArray(b.content) ? b.content : []));
  });
  return out;
}

// 套用到編輯器：一次交易，Ctrl+Z 一下就復原。回傳 { from, to }
export function applyMerge(editor, blocks, opts) {
  const o = mergeSmart(opts);
  const plan = planMerge(blocks, o);
  if (plan.to === plan.from) return plan;
  editor.transact(() => {
    for (const g of plan.groups) {
      if (g.length < 2) continue;
      editor.updateBlock(g[0].id, { content: mergedContent(g, o.join) });
      editor.removeBlocks(g.slice(1).map((b) => b.id));
    }
  });
  return plan;
}

// 目前選取的方塊（至少兩個才算有選取範圍）；沒有就是整篇文章最外層的方塊
export function scopeBlocks(editor) {
  const sel = editor.getSelection();
  if (sel && sel.blocks.length >= 2) return { blocks: sel.blocks, scope: 'selection' };
  return { blocks: editor.document, scope: 'document' };
}
