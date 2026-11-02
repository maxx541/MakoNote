import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { api, errMsg } from '../lib/util.js';

const mb = (b) => (b / 1048576).toFixed(1) + ' MB';

// 上傳這篇文章到 Cloudinary：先列出會傳什麼（哪些已經在雲端、哪些略過），按了才上傳
export default function CloudUploadDialog({ rel, intro, onClose, onUploaded }) {
  const [plan, setPlan] = useState(null);
  const [phase, setPhase] = useState('plan'); // plan → uploading → done
  const [prog, setProg] = useState({ done: 0, total: 0, path: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.cloud.plan(rel).then(setPlan).catch((e) => setError(errMsg(e)));
  }, [rel]);
  useEffect(() => api.on('cloud:progress', (p) => p.phase === 'upload' && setProg(p)), []);

  async function start() {
    setPhase('uploading');
    setError('');
    try {
      const r = await api.cloud.upload(rel);
      setResult(r);
      setPhase('done');
      onUploaded(r);
    } catch (e) {
      setError(errMsg(e));
      setPhase('plan');
    }
  }

  const busy = phase === 'uploading';
  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;

  return (
    <div className="modal-wrap" onMouseDown={() => !busy && onClose()}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>上傳到 Cloudinary</h2>
          <button className="icon-btn ghost" onClick={onClose} title="關閉" disabled={busy}>
            <Icon name="x" />
          </button>
        </div>
        {intro && <p>{intro}</p>}
        {error && <div className="error">{error}</div>}

        {phase !== 'done' && plan && (
          <div className="cloud-plan">
            <div>
              這篇有 <b>{plan.images}</b> 張圖片、<b>{plan.texts}</b> 個文字檔（文章本體、原始排版、各格式版本）。
            </div>
            <div>
              需要上傳 <b>{plan.toUpload}</b> 個（約 {mb(plan.bytes)}）
              {plan.unchanged > 0 && <>，已經在雲端而且沒變的 {plan.unchanged} 個會略過</>}。
            </div>
            {plan.lastUpload && <div className="muted small">上次上傳：{plan.lastUpload.slice(0, 16).replace('T', ' ')}（{plan.cloudName}）</div>}
            {plan.skipped.length > 0 && (
              <div className="muted small">
                不會上傳：{plan.skipped.slice(0, 4).map((s) => `${s.path}（${s.reason}）`).join('、')}
                {plan.skipped.length > 4 && ` 等 ${plan.skipped.length} 個`}
              </div>
            )}
          </div>
        )}
        {phase === 'plan' && !plan && !error && <div className="muted">計算中…</div>}

        {busy && (
          <div className="cloud-progress">
            <div className="bar">
              <div style={{ width: pct + '%' }} />
            </div>
            <div className="muted small ellipsis">
              {prog.done} / {prog.total}　{prog.path}
            </div>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="cloud-plan">
            <div>
              完成：上傳 <b>{result.uploaded}</b> 個（{mb(result.bytes)}）
              {result.updated > 0 && <>，更新名稱 {result.updated} 個</>}
              {result.unchanged > 0 && <>，略過 {result.unchanged} 個沒變的</>}。
            </div>
            {result.failed.length > 0 && (
              <div className="error">
                有 {result.failed.length} 個失敗，再按一次上傳會只重傳這些：
                {result.failed.slice(0, 4).map((f) => (
                  <div key={f.path} className="small">
                    {f.path}：{f.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="modal-foot">
          <span className="muted small">只上傳這一篇用到的檔案</span>
          <div className="row">
            {phase === 'done' ? (
              <button className="btn primary" onClick={onClose}>
                完成
              </button>
            ) : (
              <>
                <button className="btn ghost" onClick={onClose} disabled={busy}>
                  先不要
                </button>
                <button className="btn primary" onClick={start} disabled={busy || !plan || plan.toUpload + plan.unchanged === 0}>
                  <Icon name="external" size={16} />
                  {busy ? '上傳中…' : `上傳${plan ? ` ${plan.toUpload} 個檔案` : ''}`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
