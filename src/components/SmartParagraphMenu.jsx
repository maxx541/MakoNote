import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { DEFAULT_SMART, mergeSmart, planMerge, applyMerge, scopeBlocks } from '../lib/smartParagraph.js';

// 編輯列上的「智能分段」按鈕：用句尾符號判斷一段話結束了沒。
// 三件事放在同一個面板：開關（按 Enter、貼上）、句尾符號自訂、一鍵整理已經被切碎的文字塊
export default function SmartParagraphMenu({ getEditor, smart, onChange, notify }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const box = useRef(null);
  const s = mergeSmart(smart);

  // 面板開著時，選取範圍或符號改了就重算「會併成幾段」
  useEffect(() => {
    if (!open) return undefined;
    const calc = () => {
      const ed = getEditor();
      if (!ed) return setPreview(null);
      const { blocks, scope } = scopeBlocks(ed);
      const plan = planMerge(blocks, s);
      setPreview({ scope, from: plan.from, to: plan.to });
    };
    calc();
    const timer = setInterval(calc, 700);
    return () => clearInterval(timer);
  }, [open, s.ends, s.join]);

  // 點面板外面就收起來
  useEffect(() => {
    if (!open) return undefined;
    const out = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', out, true);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', out, true);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  function tidy() {
    const ed = getEditor();
    if (!ed) return;
    const { blocks, scope } = scopeBlocks(ed);
    const plan = applyMerge(ed, blocks, s);
    if (plan.to === plan.from) notify('沒有需要併的地方：每個文字塊都已經用句尾符號結束了');
    else notify(`${scope === 'selection' ? '選取範圍' : '整篇'}的 ${plan.from} 個文字塊併成 ${plan.to} 個；不滿意按 Ctrl+Z 復原`);
    setOpen(false);
  }

  const will = preview && preview.to < preview.from;
  return (
    <div className="smart-wrap" ref={box}>
      <button className={'btn' + (open ? ' primary' : '')} onClick={() => setOpen((v) => !v)} title="用句號判斷一段話結束了沒：Enter 換行、貼上分段、整理被切碎的文字塊">
        <Icon name="paragraph" size={16} />
        智能分段
      </button>
      {open && (
        <div className="smart-pop">

          <label className="check">
            <input type="checkbox" checked={s.enter} onChange={(e) => onChange({ enter: e.target.checked })} />
            按 Enter：句子還沒結束就只換行
          </label>

          <label className="check">
            <input type="checkbox" checked={s.paste} onChange={(e) => onChange({ paste: e.target.checked })} />
            貼上多行文字：依句尾符號重新分段
          </label>

          <div className="field">
            <label>算「一句話結束」的符號</label>
            <div className="row">
              <input value={s.ends} onChange={(e) => onChange({ ends: e.target.value })} spellCheck={false} />
              <button className="btn small ghost" onClick={() => onChange({ ends: DEFAULT_SMART.ends })} title="還原預設">
                <Icon name="undo" size={14} />
              </button>
            </div>
          </div>

          <div className="field">
            <label>併段時怎麼接</label>
            <select value={s.join} onChange={(e) => onChange({ join: e.target.value })}>
              <option value="auto">直接接起來（英文單字之間補空白）</option>
              <option value="break">保留成同一段裡的換行</option>
            </select>
          </div>

          <div className="smart-do">
            <div className="small">
              {preview ? (
                <>
                  {preview.scope === 'selection' ? '選取的範圍' : '整篇文章（想只整理一部分就先選好幾個文字塊）'}：{preview.from} 個方塊
                  {will ? <b className="smart-count">　→ 併成 {preview.to} 個</b> : <span className="muted">　沒有需要併的</span>}
                </>
              ) : (
                <span className="muted">打開文章後可用</span>
              )}
            </div>
            <button className="btn primary" disabled={!will} onClick={tidy}>
              <Icon name="check" size={16} />
              {preview && preview.scope === 'selection' ? '整理選取的文字塊' : '整理整篇'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
