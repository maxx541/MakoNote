// 篩選、排序、模糊搜尋
import Fuse from 'fuse.js';

export const STATUSES = ['撰寫中', '完成'];

// words：字數條件 { op: 'gt'（大於）| 'lt'（小於）| 'between'（介於）| ''（不限）, a, b }
export const EMPTY_RULE = { status: [], topics: [], tags: [], tagMode: 'any', folder: '', game: '', words: { op: '', a: 0, b: 0 } };

export const WORD_OPS = { '': '不限', gt: '大於', lt: '小於', between: '介於' };

function matchWords(n, w) {
  if (!w || !w.op) return true;
  const a = Number(w.a) || 0;
  const b = Number(w.b) || 0;
  if (w.op === 'gt') return n > a;
  if (w.op === 'lt') return n < a;
  if (w.op === 'between') return n >= Math.min(a, b) && n <= Math.max(a, b);
  return true;
}

// 動態收藏的規則：所有條件 AND，同一類條件內是 OR（標籤可切成全部符合）
export function matchRule(a, rule) {
  if (!rule) return true;
  const m = a.meta;
  if (rule.status && rule.status.length && !rule.status.includes(m.status)) return false;
  if (rule.topics && rule.topics.length && !rule.topics.includes(m.topic)) return false;
  if (rule.tags && rule.tags.length) {
    const has = (t) => m.tags.includes(t);
    if (rule.tagMode === 'all' ? !rule.tags.every(has) : !rule.tags.some(has)) return false;
  }
  if (rule.folder && a.folder !== rule.folder && !a.folder.startsWith(rule.folder + '/')) return false;
  if (rule.game === 'bound' && !m.works.length) return false;
  if (rule.game === 'unbound' && m.works.length) return false;
  if (!matchWords(a.words || 0, rule.words)) return false;
  return true;
}

export function ruleIsEmpty(rule) {
  return !rule || (!rule.status.length && !rule.topics.length && !rule.tags.length && !rule.folder && !rule.game && !(rule.words && rule.words.op));
}

// 左側欄目前選的項目 → 規則
export function selectionRule(sel, collections) {
  switch (sel.kind) {
    case 'status':
      return { ...EMPTY_RULE, status: [sel.value] };
    case 'folder':
      return { ...EMPTY_RULE, folder: sel.value };
    case 'topic':
      return { ...EMPTY_RULE, topics: [sel.value] };
    case 'tag':
      return { ...EMPTY_RULE, tags: [sel.value] };
    case 'collection': {
      const c = collections.find((x) => x.id === sel.value);
      return c ? c.rule : EMPTY_RULE;
    }
    default:
      return EMPTY_RULE;
  }
}

const lastTouched = (a) => a.meta.updated || a.meta.created || '';

export const SORTS = {
  recent: { label: '最近寫作', fn: (a, b) => lastTouched(b).localeCompare(lastTouched(a)) || b.mtime - a.mtime },
  created: { label: '建立日期', fn: (a, b) => b.meta.created.localeCompare(a.meta.created) },
  completed: { label: '完工日期', fn: (a, b) => b.meta.completed.localeCompare(a.meta.completed) },
  title: { label: '標題', fn: (a, b) => a.meta.title.localeCompare(b.meta.title, 'zh-Hant') },
  time: { label: '撰寫時數', fn: (a, b) => b.meta.active_seconds - a.meta.active_seconds },
  words: { label: '字數（多到少）', fn: (a, b) => (b.words || 0) - (a.words || 0) },
  wordsAsc: { label: '字數（少到多）', fn: (a, b) => (a.words || 0) - (b.words || 0) },
};

export function buildSearch(articles, games) {
  const docs = articles.map((a) => {
    const g = a.meta.works.map((id) => games[id]).filter(Boolean);
    return {
      rel: a.rel,
      title: a.meta.title,
      tags: a.meta.tags.join(' '),
      topic: a.meta.topic,
      games: g.map((x) => [x.title, x.romaji, ...(x.aliases || []), ...(x.developers || [])].join(' ')).join(' '),
      text: a.text,
    };
  });
  return new Fuse(docs, {
    keys: [
      { name: 'title', weight: 4 },
      { name: 'games', weight: 3 },
      { name: 'tags', weight: 2 },
      { name: 'topic', weight: 2 },
      { name: 'text', weight: 1 },
    ],
    ignoreLocation: true,
    ignoreDiacritics: true,
    threshold: 0.38,
    includeScore: true,
  });
}

// 搜尋結果只保留 rel 與分數，交給上層和目前的篩選疊加
export function runSearch(fuse, q) {
  const text = q.trim();
  if (!text) return null;
  const scores = new Map();
  for (const r of fuse.search(text)) scores.set(r.item.rel, r.score);
  return scores;
}

export function collectFacets(articles) {
  const topics = new Map();
  const tags = new Map();
  for (const a of articles) {
    if (a.meta.topic) topics.set(a.meta.topic, (topics.get(a.meta.topic) || 0) + 1);
    for (const t of a.meta.tags) tags.set(t, (tags.get(t) || 0) + 1);
  }
  const sorted = (m) => [...m.entries()].sort((x, y) => y[1] - x[1]);
  return { topics: sorted(topics), tags: sorted(tags) };
}
