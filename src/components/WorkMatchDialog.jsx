import { useRef, useState } from 'react';
import * as OpenCC from 'opencc-js/t2cn';
import Icon from './Icon.jsx';
import { api, errMsg } from '../lib/util.js';
import { createMatcher, extractKeyword, CONFIDENT } from '../lib/match.js';
import { workMode, MODE_LABEL } from '../lib/kind.js';

// Bangumi 的中文名多半是簡體；比對前兩邊都先統一成簡體
const toCn = OpenCC.Converter({ from: 'tw', to: 'cn' });
const M = createMatcher(toCn);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 批次配對作品：只處理目前模式（Galgame 或動畫）裡「還沒連結」或「連結的類型不對」的文章。
// Galgame 只配遊戲（VNDB 或 Bangumi 的遊戲）；動畫只配 Bangumi 的動畫。搜尋後由你確認，按套用才寫入。
export default function WorkMatchDialog({ mode, articles, games, onDone, onClose, notify }) {
  const isGal = mode === 'gal';
  const wantKind = isGal ? '遊戲' : '動畫';
  const [source, setSource] = useState(isGal ? 'vndb' : 'bangumi');
  const [rows, setRows] = useState(() =>
    articles
      .map((a) => {
        const cur = a.meta.works[0] ? games[a.meta.works[0]] : null;
        // 還沒連結，或連結到的類型不對（例如動畫文章連到遊戲）。
        // 只要有任何一個連結是這個模式的作品就不動（例如主題是旅遊、連到遊戲的聖地巡禮文章）
        if (a.meta.works.length && (!cur || a.meta.works.some((id) => !games[id] || workMode(games[id]) === mode))) return null;
        return {
          rel: a.rel,
          title: a.meta.title,
          keyword: extractKeyword(a.meta.title),
          old: cur ? `${cur.titleCn || cur.title}（${cur.kind || '類型不明'}）` : a.meta.works.length ? a.meta.works[0] : '',
          results: null,
          pick: '',
          checked: false,
          state: '',
        };
      })
      .filter(Boolean),
  );
  const [running, setRunning] = useState('');
  const stopRef = useRef(false);

  const setRow = (rel, patch) => setRows((list) => list.map((r) => (r.rel === rel ? { ...r, ...patch } : r)));

  async function searchOne(row, cache) {
    if (cache && cache.has(row.keyword)) return cache.get(row.keyword);
    const results = [];
    const good = () => M.rank(row.keyword, results, wantKind).some((x) => x.s >= CONFIDENT && x.kindOk);
    for (const term of M.searchTerms(row.keyword)) {
      const found = await api.game.search(source, term, isGal ? 'game' : 'anime', 8);
      await sleep(source === 'vndb' ? 380 : 260);
      for (const w of found) if (!results.some((x) => x.id === w.id)) results.push(w);
      if (good()) break;
    }
    if (cache) cache.set(row.keyword, results);
    return results;
  }

  // 依相似度排序；最像的名稱夠像、類型也對才預先打勾
  function applyResults(row, results) {
    const ranked = M.rank(row.keyword, results, wantKind);
    const top = ranked[0];
    setRow(row.rel, {
      results: ranked.map((x) => x.w),
      pick: top ? top.w.id : '',
      checked: !!top && top.s >= CONFIDENT && top.kindOk,
      state: '',
    });
  }

  async function searchAll() {
    stopRef.current = false;
    const cache = new Map();
    const todo = rows.filter((r) => r.keyword.trim());
    for (let i = 0; i < todo.length; i += 1) {
      if (stopRef.current) break;
      setRunning(`搜尋中 ${i + 1} / ${todo.length}`);
      setRow(todo[i].rel, { state: '搜尋中…' });
      try {
        applyResults(todo[i], await searchOne(todo[i], cache));
      } catch (e) {
        setRow(todo[i].rel, { state: '失敗：' + errMsg(e), results: [] });
      }
    }
    setRunning('');
  }

  async function searchRow(row) {
    setRow(row.rel, { state: '搜尋中…' });
    try {
      applyResults(row, await searchOne(row));
    } catch (e) {
      setRow(row.rel, { state: '失敗：' + errMsg(e), results: [] });
    }
  }

  async function apply() {
    const chosen = rows.filter((r) => r.checked && r.pick);
    if (!chosen.length) {
      notify('沒有勾選要配對的文章');
      return;
    }
    stopRef.current = false;
    const bound = new Set();
    let done = 0;
    for (const r of chosen) {
      if (stopRef.current) break;
      setRunning(`寫入中 ${done + 1} / ${chosen.length}`);
      try {
        if (!bound.has(r.pick)) {
          await api.game.bind(r.pick);
          bound.add(r.pick);
        }
        await api.lib.updateMeta(r.rel, { works: [r.pick] });
        setRow(r.rel, { state: '已配對', checked: false });
        done += 1;
      } catch (e) {
        setRow(r.rel, { state: '失敗：' + errMsg(e) });
      }
    }
    setRunning('');
    notify(`已配對 ${done} 篇，下載了 ${bound.size} 部作品的封面`);
    onDone();
  }

  const checkedCount = rows.filter((r) => r.checked && r.pick).length;

  return (
    <div className="modal-wrap" onMouseDown={() => !running && onClose()}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>批次配對作品（{MODE_LABEL[mode]}）</h2>
          <button className="icon-btn ghost" onClick={onClose} title="關閉" disabled={!!running}>
            <Icon name="x" />
          </button>
        </div>
        <div className="row wrap" style={{ marginBottom: 12 }}>
          {isGal ? (
            <div className="seg-group">
              {[
                ['vndb', 'VNDB'],
                ['bangumi', 'Bangumi（遊戲）'],
              ].map(([id, label]) => (
                <button key={id} className={'seg' + (source === id ? ' on' : '')} onClick={() => setSource(id)} disabled={!!running}>
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <span className="muted small">資料來源：Bangumi（動畫）</span>
          )}
          <button className="btn primary" onClick={searchAll} disabled={!!running || !rows.length}>
            <Icon name="search" size={16} />
            全部搜尋
          </button>
          {running && (
            <>
              <span className="muted small">{running}</span>
              <button className="btn small ghost" onClick={() => (stopRef.current = true)}>
                停止
              </button>
            </>
          )}
        </div>

        <div className="match-list">
          {rows.length === 0 && <div className="muted">目前清單裡的{MODE_LABEL[mode]}心得都已經連結作品了。</div>}
          {rows.map((r) => {
            const pick = (r.results || []).find((w) => w.id === r.pick);
            return (
              <div key={r.rel} className={'match-row' + (r.checked ? ' on' : '')}>
                <input type="checkbox" checked={r.checked} disabled={!r.pick} onChange={(e) => setRow(r.rel, { checked: e.target.checked })} />
                <div className="match-article">
                  <div className="ellipsis" title={r.title}>
                    {r.title}
                  </div>
                  <div className="row">
                    <input
                      className="match-kw"
                      value={r.keyword}
                      onChange={(e) => setRow(r.rel, { keyword: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && searchRow(r)}
                    />
                    <button className="icon-btn ghost small" onClick={() => searchRow(r)} title="用這個關鍵字重搜" disabled={!!running}>
                      <Icon name="search" size={14} />
                    </button>
                  </div>
                  {r.old && <div className="muted small ellipsis">目前連結：{r.old}（類型不符，套用後會換成新的）</div>}
                </div>
                <div className="match-pick">
                  {pick ? (
                    <>
                      {pick.thumbUrl || pick.imageUrl ? <img src={pick.thumbUrl || pick.imageUrl} alt="" className={pick.nsfw ? 'nsfw' : ''} /> : <div className="thumb-empty" />}
                      <div className="match-pick-text">
                        <div className="ellipsis">{pick.titleCn || pick.title}</div>
                        <div className="muted small ellipsis">{[pick.kind, pick.released && pick.released.slice(0, 4), pick.id].filter(Boolean).join(' · ')}</div>
                      </div>
                    </>
                  ) : (
                    <span className="muted small">{r.state || (r.results ? '找不到，改關鍵字再搜' : '尚未搜尋')}</span>
                  )}
                </div>
                {r.results && r.results.length > 1 && (
                  <select className="match-select" value={r.pick} onChange={(e) => setRow(r.rel, { pick: e.target.value, checked: !!e.target.value })}>
                    {r.results.map((w) => (
                      <option key={w.id} value={w.id}>
                        {[w.titleCn || w.title, w.kind, w.released && w.released.slice(0, 4)].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                    <option value="">不要配對</option>
                  </select>
                )}
                {pick && r.state && <span className="muted small">{r.state}</span>}
              </div>
            );
          })}
        </div>

        <div className="modal-foot">
          <span className="muted small">已勾選 {checkedCount} 篇</span>
          <button className="btn primary" onClick={apply} disabled={!!running || !checkedCount}>
            <Icon name="check" size={16} />
            套用勾選的配對
          </button>
        </div>
      </div>
    </div>
  );
}
