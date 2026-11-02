import { useState } from 'react';
import Icon from './Icon.jsx';
import { EMPTY_RULE, STATUSES, WORD_OPS, matchRule } from '../lib/query.js';

function toggle(list, v) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

// 篩選條件編輯：可以直接套用，也可以存成會自動更新的「動態收藏」
export default function RuleDialog({ mode, rule, collection, data, facets, onClose, onApply, onSaveCollection, onDeleteCollection }) {
  const [r, setR] = useState(() => {
    const base = { ...EMPTY_RULE, ...(collection ? collection.rule : rule || {}) };
    return { ...base, words: { ...EMPTY_RULE.words, ...(base.words || {}) } };
  });
  const [name, setName] = useState(collection ? collection.name : '');
  const [asCollection, setAsCollection] = useState(mode === 'collection');
  const [error, setError] = useState('');
  const n = data.articles.filter((a) => matchRule(a, r)).length;

  const set = (patch) => setR((x) => ({ ...x, ...patch }));
  const setWords = (patch) => setR((x) => ({ ...x, words: { ...x.words, ...patch } }));
  const num = (v) => Math.max(0, Math.floor(Number(v) || 0));

  function save() {
    if (!name.trim()) {
      setError('幫這個動態收藏取個名字');
      return;
    }
    onSaveCollection({ id: collection ? collection.id : 'c' + Date.now().toString(36), name: name.trim(), rule: r });
  }

  return (
    <div className="modal-wrap" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{collection ? '編輯動態收藏' : mode === 'collection' ? '新增動態收藏' : '篩選'}</h2>
          <button className="icon-btn ghost" onClick={onClose} title="關閉">
            <Icon name="x" />
          </button>
        </div>

        <div className="field">
          <label>狀態</label>
          <div className="chips">
            {STATUSES.map((s) => (
              <button key={s} className={'chip' + (r.status.includes(s) ? ' on' : '')} onClick={() => set({ status: toggle(r.status, s) })}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {facets.topics.length > 0 && (
          <div className="field">
            <label>主題</label>
            <div className="chips">
              {facets.topics.map(([t]) => (
                <button key={t} className={'chip' + (r.topics.includes(t) ? ' on' : '')} onClick={() => set({ topics: toggle(r.topics, t) })}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {facets.tags.length > 0 && (
          <div className="field">
            <label>
              標籤
              <select value={r.tagMode} onChange={(e) => set({ tagMode: e.target.value })} className="inline-select">
                <option value="any">符合任一個</option>
                <option value="all">全部都要有</option>
              </select>
            </label>
            <div className="chips">
              {facets.tags.map(([t]) => (
                <button key={t} className={'chip' + (r.tags.includes(t) ? ' on' : '')} onClick={() => set({ tags: toggle(r.tags, t) })}>
                  #{t}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field two">
          <div>
            <label>資料夾（含子資料夾）</label>
            <select value={r.folder} onChange={(e) => set({ folder: e.target.value })}>
              <option value="">不限</option>
              {data.folders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>作品</label>
            <select value={r.game} onChange={(e) => set({ game: e.target.value })}>
              <option value="">不限</option>
              <option value="bound">已連結作品</option>
              <option value="unbound">未連結作品</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label>字數</label>
          <div className="row">
            <select value={r.words.op} onChange={(e) => setWords({ op: e.target.value })}>
              {Object.entries(WORD_OPS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {r.words.op && <input type="number" min={0} step={100} value={r.words.a} onChange={(e) => setWords({ a: num(e.target.value) })} style={{ width: 110 }} />}
            {r.words.op === 'between' && (
              <>
                <span className="muted">到</span>
                <input type="number" min={0} step={100} value={r.words.b} onChange={(e) => setWords({ b: num(e.target.value) })} style={{ width: 110 }} />
              </>
            )}
            {r.words.op && <span className="muted small">字</span>}
          </div>
        </div>

        {asCollection && (
          <div className="field">
            <label>收藏名稱</label>
            <input
              value={name}
              autoFocus={mode === 'adhoc'}
              placeholder="例如：待完成的推坑文"
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
            {error && <div className="error">{error}</div>}
          </div>
        )}

        <div className="modal-foot">
          <span className="muted">目前符合 {n} 篇</span>
          <div className="row">
            {collection && (
              <button className="btn danger ghost" onClick={() => window.confirm(`刪除動態收藏「${collection.name}」？文章本身不受影響。`) && onDeleteCollection(collection.id)}>
                <Icon name="trash" size={16} />
                刪除
              </button>
            )}
            {mode === 'adhoc' && !asCollection && (
              <>
                <button className="btn" onClick={() => setR({ ...EMPTY_RULE })}>
                  清除
                </button>
                <button className="btn" onClick={() => setAsCollection(true)}>
                  <Icon name="star" size={16} />
                  存成動態收藏
                </button>
                <button className="btn primary" onClick={() => onApply(r)}>
                  套用
                </button>
              </>
            )}
            <div className="field">
          <label>字數</label>
          <div className="row">
            <select value={r.words.op} onChange={(e) => setWords({ op: e.target.value })}>
              {Object.entries(WORD_OPS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {r.words.op && <input type="number" min={0} step={100} value={r.words.a} onChange={(e) => setWords({ a: num(e.target.value) })} style={{ width: 110 }} />}
            {r.words.op === 'between' && (
              <>
                <span className="muted">到</span>
                <input type="number" min={0} step={100} value={r.words.b} onChange={(e) => setWords({ b: num(e.target.value) })} style={{ width: 110 }} />
              </>
            )}
            {r.words.op && <span className="muted small">字</span>}
          </div>
        </div>

        {asCollection && (
              <button className="btn primary" onClick={save}>
                <Icon name="check" size={16} />
                儲存收藏
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
