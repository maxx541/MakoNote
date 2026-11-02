import { useEffect, useState } from 'react';
import * as OpenCC from 'opencc-js/t2cn';
import Icon from './Icon.jsx';
import { api, errMsg } from '../lib/util.js';
import { createMatcher, CONFIDENT } from '../lib/match.js';
import { workMode } from '../lib/kind.js';

const toCn = OpenCC.Converter({ from: 'tw', to: 'cn' });
const M = createMatcher(toCn);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SOURCES = [
  { id: 'vndb', label: 'VNDB', types: 'game', kind: '遊戲' },
  { id: 'bgm-game', label: 'Bangumi（遊戲）', source: 'bangumi', types: 'game', kind: '遊戲' },
  { id: 'bgm-anime', label: 'Bangumi（動畫）', source: 'bangumi', types: 'anime', kind: '動畫' },
];

// 作品詳細頁的「重新配對」：這部作品配錯時，搜尋正確的作品，把這部作品底下勾選的心得改連到新的作品。
// 只改心得開頭屬性裡的作品編號，正文不動；其他作品連結保留。
export default function RematchDialog({ game, articles, onDone, onClose, notify }) {
  const guess = workMode(game) === 'anime' ? 'bgm-anime' : game.source === 'bangumi' ? 'bgm-game' : 'vndb';
  const [src, setSrc] = useState(guess);
  const [keyword, setKeyword] = useState(game.titleCn || game.title || '');
  const [results, setResults] = useState(null);
  const [pick, setPick] = useState('');
  const [checked, setChecked] = useState(() => new Set(articles.map((a) => a.rel)));
  const [busy, setBusy] = useState('');

  const cfg = SOURCES.find((s) => s.id === src);

  async function search() {
    const kw = keyword.trim();
    if (!kw) return;
    setBusy('搜尋中…');
    setResults(null);
    try {
      const found = [];
      const good = () => M.rank(kw, found, cfg.kind).some((x) => x.s >= CONFIDENT && x.kindOk);
      for (const term of M.searchTerms(kw)) {
        const part = await api.game.search(cfg.source || 'vndb', term, cfg.types, 10);
        await sleep(cfg.id === 'vndb' ? 380 : 260);
        for (const w of part) if (!found.some((x) => x.id === w.id)) found.push(w);
        if (good()) break;
      }
      const ranked = M.rank(kw, found, cfg.kind).map((x) => x.w);
      setResults(ranked);
      setPick(ranked.length ? ranked[0].id : '');
    } catch (e) {
      notify('搜尋失敗：' + errMsg(e));
      setResults([]);
    }
    setBusy('');
  }

  // 一打開就先用目前作品的名稱搜一次
  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (rel) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(rel)) n.delete(rel);
      else n.add(rel);
      return n;
    });

  async function apply() {
    const target = (results || []).find((w) => w.id === pick);
    const list = articles.filter((a) => checked.has(a.rel));
    if (!target || !list.length) return;
    setBusy('寫入中…');
    try {
      if (target.id !== game.id) {
        await api.game.bind(target.id);
        for (const a of list) {
          const works = [...new Set(a.meta.works.map((id) => (id === game.id ? target.id : id)))];
          await api.lib.updateMeta(a.rel, { works });
        }
      }
      notify(`已把 ${list.length} 篇心得改連到「${target.titleCn || target.title}」`);
      onDone(target.id);
    } catch (e) {
      notify('寫入失敗：' + errMsg(e));
      setBusy('');
    }
  }

  const sameAsNow = pick === game.id;

  return (
    <div className="modal-wrap" onMouseDown={() => !busy && onClose()}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>重新配對：{game.titleCn || game.title}</h2>
          <button className="icon-btn ghost" onClick={onClose} title="關閉" disabled={!!busy}>
            <Icon name="x" />
          </button>
        </div>

        <div className="row wrap" style={{ marginBottom: 12 }}>
          <div className="seg-group">
            {SOURCES.map((s) => (
              <button key={s.id} className={'seg' + (src === s.id ? ' on' : '')} onClick={() => setSrc(s.id)} disabled={!!busy}>
                {s.label}
              </button>
            ))}
          </div>
          <input
            className="match-kw"
            style={{ flex: 1, minWidth: 180 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="作品名稱"
          />
          <button className="btn primary" onClick={search} disabled={!!busy || !keyword.trim()}>
            <Icon name="search" size={16} />
            搜尋
          </button>
        </div>

        <div className="rematch-results">
          {busy && !results && <div className="muted">{busy}</div>}
          {results && results.length === 0 && <div className="muted">找不到。換個名稱，或換一個資料來源再搜。</div>}
          {(results || []).map((w) => (
            <button key={w.id} className={'rematch-item' + (pick === w.id ? ' on' : '')} onClick={() => setPick(w.id)}>
              {w.thumbUrl || w.imageUrl ? <img src={w.thumbUrl || w.imageUrl} alt="" className={w.nsfw ? 'nsfw' : ''} /> : <div className="thumb-empty" />}
              <div className="match-pick-text">
                <div className="ellipsis">{w.titleCn || w.title}</div>
                <div className="muted small ellipsis">{[w.kind, w.released && w.released.slice(0, 4), w.id, w.id === game.id && '目前連結'].filter(Boolean).join(' · ')}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="rematch-articles">
          <div className="muted small">要改連結的心得（{checked.size} / {articles.length}）</div>
          {articles.map((a) => (
            <label key={a.rel} className="rematch-art">
              <input type="checkbox" checked={checked.has(a.rel)} onChange={() => toggle(a.rel)} />
              <span className="ellipsis" title={a.meta.title}>
                {a.meta.title}
              </span>
            </label>
          ))}
        </div>

        <div className="modal-foot">
          <span className="muted small">{sameAsNow ? '選到的就是目前連結的作品，不需要改' : busy}</span>
          <button className="btn primary" onClick={apply} disabled={!!busy || !pick || sameAsNow || !checked.size}>
            <Icon name="check" size={16} />
            改連到選取的作品
          </button>
        </div>
      </div>
    </div>
  );
}
