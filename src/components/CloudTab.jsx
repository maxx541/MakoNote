import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { api, errMsg } from '../lib/util.js';

const mb = (b) => (b / 1048576).toFixed(1) + ' MB';

// 設定 → 雲端：Cloudinary 金鑰、選項、從雲端還原。
// 金鑰只存在這台電腦（Windows 加密），不會進文章庫，儲存後也不會再顯示出來。
export default function CloudTab({ cloud, setCloud, notify }) {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ cloudName: '', apiKey: '', apiSecret: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [list, setList] = useState(null); // 雲端上的文章清單；null＝還沒讀
  const [picked, setPicked] = useState({});
  const [prog, setProg] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.cloud.status().then(setStatus).catch(() => {});
  }, []);
  useEffect(() => api.on('cloud:progress', (p) => p.phase === 'restore' && setProg(p)), []);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setError('');
  };

  async function save() {
    setBusy('save');
    setError('');
    try {
      setStatus(await api.cloud.save(form.cloudName, form.apiKey, form.apiSecret));
      setForm({ cloudName: '', apiKey: '', apiSecret: '' }); // secret 不留在畫面上
      notify('金鑰驗證成功，已儲存（加密存在這台電腦）');
    } catch (e) {
      setError(errMsg(e));
    }
    setBusy('');
  }

  async function clear() {
    if (!window.confirm('移除這台電腦上儲存的 Cloudinary 金鑰？雲端上的檔案不會被刪除。')) return;
    setStatus(await api.cloud.clear());
    setList(null);
  }

  async function loadList() {
    setBusy('list');
    setError('');
    setResult(null);
    try {
      const l = await api.cloud.listArticles();
      setList(l);
      setPicked(Object.fromEntries(l.map((a) => [a.id, true])));
    } catch (e) {
      setError(errMsg(e));
    }
    setBusy('');
  }

  async function restore() {
    const ids = Object.keys(picked).filter((k) => picked[k]);
    if (!ids.length) {
      setError('先勾選要還原的文章');
      return;
    }
    const folder = await api.cloud.pickFolder();
    if (!folder) return;
    setBusy('restore');
    setError('');
    setProg(null);
    try {
      setResult(await api.cloud.restore(ids, folder));
    } catch (e) {
      setError(errMsg(e));
    }
    setBusy('');
  }

  const allPicked = list && list.length > 0 && list.every((a) => picked[a.id]);

  return (
    <>

      {status && status.configured ? (
        <div className="cloud-status ok">
          <Icon name="check" size={16} />
          <span>
            已設定：<b>{status.cloudName}</b>（API key 開頭 {status.apiKey.slice(0, 4)}…）
          </span>
          <button className="btn small ghost" onClick={clear}>
            移除金鑰
          </button>
        </div>
      ) : (
        <div className="cloud-status">尚未設定金鑰{status && !status.canEncrypt ? '（這台電腦無法加密儲存，所以不能儲存金鑰）' : ''}</div>
      )}

      <div className="field two">
        <div>
          <label>Cloud name</label>
          <input value={form.cloudName} onChange={set('cloudName')} placeholder="例如 demo-cloud" autoComplete="off" />
        </div>
        <div>
          <label>API key</label>
          <input value={form.apiKey} onChange={set('apiKey')} placeholder="一串數字" autoComplete="off" />
        </div>
      </div>
      <div className="field">
        <label>API secret</label>
        <input type="password" value={form.apiSecret} onChange={set('apiSecret')} placeholder="貼上後按「儲存並測試」" autoComplete="new-password" />
      </div>
      <div className="row">
        <button className="btn primary" onClick={save} disabled={busy === 'save' || !form.cloudName || !form.apiKey || !form.apiSecret}>
          {busy === 'save' ? '驗證中…' : '儲存並測試'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}

      <h3>選項</h3>
      <label className="check">
        <input type="checkbox" checked={cloud.auto} onChange={(e) => setCloud({ auto: e.target.checked })} />
        按「完工」時詢問要不要上傳（不會自動上傳，每次都要你按確定）
      </label>
      <div className="field">
        <label>巴哈版本的圖片網址</label>
        <select value={cloud.bahamutFormat} onChange={(e) => setCloud({ bahamutFormat: e.target.value })}>
          <option value="original">維持原本格式（webp 也直接用）</option>
          <option value="jpg">webp 等格式轉成 jpg 輸出（巴哈教學文只列了 jpg、png、gif）</option>
        </select>
      </div>

      <h3>從 Cloudinary 還原</h3>
      <div className="row">
        <button className="btn" onClick={loadList} disabled={!status || !status.configured || !!busy}>
          {busy === 'list' ? '讀取中…' : '讀取雲端上的文章清單'}
        </button>
        {list && <span className="muted small">雲端上有 {list.length} 篇</span>}
      </div>
      {list && list.length > 0 && (
        <>
          <div className="cloud-list">
            {list.map((a) => (
              <label key={a.id} className="cloud-item">
                <input type="checkbox" checked={!!picked[a.id]} onChange={(e) => setPicked((p) => ({ ...p, [a.id]: e.target.checked }))} />
                <span className="ellipsis" title={a.dir}>
                  {a.title || a.id}
                </span>
                <span className="muted small">
                  {a.images} 張圖 · {mb(a.bytes)}
                </span>
              </label>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={restore} disabled={!!busy}>
              {busy === 'restore' ? '還原中…' : '選擇資料夾並還原勾選的文章'}
            </button>
            <button className="btn small ghost" onClick={() => setPicked(Object.fromEntries(list.map((a) => [a.id, !allPicked])))}>
              {allPicked ? '全不選' : '全選'}
            </button>
          </div>
        </>
      )}
      {busy === 'restore' && prog && (
        <div className="cloud-progress">
          <div className="bar">
            <div style={{ width: Math.round((prog.done / Math.max(prog.total, 1)) * 100) + '%' }} />
          </div>
          <div className="muted small ellipsis">
            {prog.done} / {prog.total}　{prog.path}
          </div>
        </div>
      )}
      {result && (
        <div className="cloud-plan">
          <div>
            還原完成：{result.articles} 篇、新放回 <b>{result.restored}</b> 個檔案，已經存在而略過 {result.existing} 個
            {result.mismatched > 0 && <span className="error">，{result.mismatched} 個內容和上傳時不一致</span>}。
          </div>
          {result.failed.length > 0 && (
            <div className="error">
              失敗 {result.failed.length} 個：{result.failed.slice(0, 3).map((f) => `${f.path}（${f.error}）`).join('；')}
            </div>
          )}
        </div>
      )}
    </>
  );
}
