import { useState } from 'react';
import Icon from './Icon.jsx';
import { api, errMsg } from '../lib/util.js';

const SOURCES = [
  { id: 'vndb', label: 'VNDB', hint: '視覺小說名稱（日文、英文、羅馬拼音）或 v12345' },
  { id: 'bangumi', label: 'Bangumi', hint: '遊戲、動畫、書籍名稱（中文、日文都可以）或 Bangumi 編號' },
  { id: 'custom', label: '自己建立', hint: '資料庫裡沒有的作品，輸入名稱建立' },
];

// 連結作品：從 VNDB 或 Bangumi 搜尋，或自己建立一筆。封面會下載到文章庫的 _works/
export default function GameDialog({ initial, onPick, onClose }) {
  const [source, setSource] = useState('bangumi');
  const [types, setTypes] = useState('work');
  const [text, setText] = useState(initial || '');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const current = SOURCES.find((s) => s.id === source);

  async function submit() {
    if (!text.trim()) {
      setError(source === 'custom' ? '輸入作品名稱' : '輸入要搜尋的作品名稱');
      return;
    }
    setError('');
    if (source === 'custom') {
      setBusy('create');
      try {
        onPick(await api.game.createCustom(text));
      } catch (e) {
        setError('建立失敗：' + errMsg(e));
        setBusy('');
      }
      return;
    }
    setBusy('search');
    try {
      setResults(await api.game.search(source, text, types));
    } catch (e) {
      setError('搜尋失敗：' + errMsg(e));
    }
    setBusy('');
  }

  async function pick(v) {
    setBusy(v.id);
    setError('');
    try {
      onPick(await api.game.bind(v.id));
    } catch (e) {
      setError('下載資料失敗：' + errMsg(e));
      setBusy('');
    }
  }

  return (
    <div className="modal-wrap" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>連結作品</h2>
          <button className="icon-btn ghost" onClick={onClose} title="關閉">
            <Icon name="x" />
          </button>
        </div>
        <div className="tabs">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              className={'tab' + (source === s.id ? ' on' : '')}
              onClick={() => {
                setSource(s.id);
                setResults(null);
                setError('');
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        {source === 'bangumi' && (
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="muted small">搜尋範圍</span>
            <select value={types} onChange={(e) => setTypes(e.target.value)}>
              <option value="work">遊戲＋動畫</option>
              <option value="game">只有遊戲</option>
              <option value="anime">只有動畫</option>
              <option value="book">書籍</option>
            </select>
          </div>
        )}
        <div className="row">
          <input
            autoFocus
            value={text}
            placeholder={current.hint}
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <button className="btn primary" onClick={submit} disabled={!!busy}>
            <Icon name={source === 'custom' ? 'plus' : 'search'} size={16} />
            {source === 'custom' ? '建立' : busy === 'search' ? '搜尋中…' : '搜尋'}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        {source !== 'custom' && (
          <div className="gd-results">
            {results && results.length === 0 && <div className="muted">找不到符合的作品，換個寫法或換一個資料來源試試。</div>}
            {results &&
              results.map((v) => (
                <button key={v.id} className="gd-item" onClick={() => pick(v)} disabled={!!busy}>
                  {v.thumbUrl || v.imageUrl ? (
                    <img src={v.thumbUrl || v.imageUrl} alt="" className={v.nsfw ? 'nsfw' : ''} />
                  ) : (
                    <div className="thumb-empty" />
                  )}
                  <div className="gd-text">
                    <div className="ellipsis">{v.title}</div>
                    <div className="muted small ellipsis">{v.titleCn || v.romaji}</div>
                    <div className="muted small">{[v.kind, v.developers.join('、'), v.released, v.id].filter(Boolean).join(' · ')}</div>
                  </div>
                  {busy === v.id && <span className="muted small">下載中…</span>}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
