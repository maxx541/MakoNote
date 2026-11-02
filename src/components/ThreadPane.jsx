import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { api, assetUrl, toRelative, debounce, errMsg, nowStamp } from '../lib/util.js';
import {
  THREAD_PLATFORMS,
  toThread,
  parseThread,
  copyText,
  postLength,
  moveItem,
  shiftItem,
  splitBefore,
  mergeWithPrev,
  editText,
  removeItem,
  addTextItem,
} from '../lib/thread.js';

// 圖片複製到剪貼簿（貼到串文的圖片欄）
async function copyImage(url) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  canvas.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close();
  const png = await canvas.convertToBlob({ type: 'image/png' });
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

// 串文：把主稿拆成多則，方塊可以拖曳或用箭頭在各則之間搬動；一次複製一則。
// 跟其他格式一樣：點進來只是預覽，第一次修改才會存成獨立版本（variants/<檔名>.thread.json）
export default function ThreadPane({ rel, dir, title, getBlocks, masterUpdated, notify, onCreated }) {
  const [variant, setVariant] = useState(undefined); // undefined：讀取中；null：還沒建立
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState({}); // 已複製過的那幾則
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null); // { post, index }：目前拖到哪個位置
  const dataRef = useRef(null);

  const toOut = (u) => toRelative(dir, u);
  const resolve = (u) => assetUrl(dir, u);
  const generate = (platform, numbering) => toThread(getBlocks(), platform, numbering, toOut);

  useEffect(() => {
    setVariant(undefined);
    api.lib
      .readVariant(rel, 'thread')
      .then((v) => {
        const parsed = v ? parseThread(v.text) : null;
        const d = parsed || generate('threads', true);
        dataRef.current = d;
        setData(d);
        setVariant(parsed ? v : null);
      })
      .catch((e) => notify(errMsg(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rel]);

  const saveSoon = useMemo(() => debounce((d) => api.lib.writeVariant(rel, 'thread', JSON.stringify(d, null, 1), { updated: nowStamp() }).catch((e) => notify(errMsg(e))), 600), [rel, notify]);

  // 任何修改都走這裡：第一次修改才建立版本檔
  async function apply(next) {
    dataRef.current = next;
    setData(next);
    setCopied({});
    if (!variant) {
      const info = { generatedFrom: masterUpdated, created: nowStamp(), updated: nowStamp() };
      await api.lib.writeVariant(rel, 'thread', JSON.stringify(next, null, 1), info);
      setVariant({ text: '', info });
      onCreated();
      return;
    }
    saveSoon(next);
  }

  // 預覽狀態下改平台、編號：直接重新拆，不建立檔案；已經是獨立版本就只改設定、保留你排好的內容
  function setPlatform(pf) {
    if (variant) apply({ ...data, platform: pf });
    else {
      const d = generate(pf, data.numbering);
      dataRef.current = d;
      setData(d);
    }
  }
  function setNumbering(on) {
    if (variant) apply({ ...data, numbering: on });
    else {
      const d = generate(data.platform, on);
      dataRef.current = d;
      setData(d);
    }
  }

  async function regenerate() {
    const d = generate(data.platform, data.numbering);
    dataRef.current = d;
    setData(d);
    setCopied({});
    const info = { generatedFrom: masterUpdated, ack: '', updated: nowStamp() };
    if (variant) {
      await api.lib.writeVariant(rel, 'thread', JSON.stringify(d, null, 1), info);
      setVariant({ ...variant, info: { ...variant.info, ...info } });
      notify('已依主稿重新拆分');
    }
  }

  async function keepCurrent() {
    await api.lib.writeVariant(rel, 'thread', JSON.stringify(dataRef.current, null, 1), { ack: masterUpdated });
    setVariant((v) => ({ ...v, info: { ...v.info, ack: masterUpdated } }));
  }

  async function removeVariant() {
    if (!window.confirm('刪除串文的獨立版本？之後會回到從主稿即時拆分的預覽。')) return;
    await api.lib.deleteVariant(rel, 'thread');
    const d = generate(data.platform, data.numbering);
    dataRef.current = d;
    setData(d);
    setVariant(null);
    onCreated();
  }

  async function copyPost(i) {
    try {
      const text = copyText(data, i);
      await api.clip.write({ text });
      setCopied((c) => ({ ...c, [data.posts[i].id]: true }));
      notify(`已複製第 ${i + 1} 則（${postLength(data, i)} 字）${data.posts[i].items.some((x) => x.type === 'image') ? '，圖片請用方塊上的「複製圖片」' : ''}`);
    } catch (e) {
      notify('複製失敗：' + errMsg(e));
    }
  }

  async function copyOneImage(src) {
    try {
      await copyImage(resolve(src));
      notify('已複製圖片，到串文的圖片欄按 Ctrl+V');
    } catch (e) {
      notify('複製圖片失敗：' + errMsg(e));
    }
  }

  if (variant === undefined || !data) return <div className="variant-pane" />;

  const platform = THREAD_PLATFORMS[data.platform] || THREAD_PLATFORMS.threads;
  const masterChanged = variant && variant.info && masterUpdated && masterUpdated > (variant.info.generatedFrom || '') && variant.info.ack !== masterUpdated;

  // 拖曳：放在列的上半部＝插到它前面，下半部＝插到它後面
  const dragOverItem = (e, pi, ii) => {
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const index = e.clientY < r.top + r.height / 2 ? ii : ii + 1;
    if (!over || over.post !== pi || over.index !== index) setOver({ post: pi, index });
  };
  const dropHere = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragId && over) apply(moveItem(data, dragId, over.post, over.index));
    setDragId(null);
    setOver(null);
  };

  return (
    <div className="variant-pane thread-pane">
      <div className="variant-head">
        <div className="variant-status">
          {variant ? <span className="muted small">獨立版本 · 建立於 {variant.info.created || '—'}</span> : <span className="pill wip">預覽</span>}
        </div>
        <div className="row wrap">
          <select value={data.platform} onChange={(e) => setPlatform(e.target.value)} title="依平台的字數上限計算">
            {Object.entries(THREAD_PLATFORMS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <label className="check inline">
            <input type="checkbox" checked={data.numbering} onChange={(e) => setNumbering(e.target.checked)} />
            結尾加 1/N
          </label>
          <button className="btn small" onClick={variant ? () => window.confirm('依主稿重新拆分？你搬動與修改過的內容會被覆蓋。') && regenerate() : regenerate} title="依目前的字數上限重新拆分主稿">
            <Icon name="undo" size={14} />
            重新拆分
          </button>
          {variant && (
            <button className="btn small ghost" onClick={removeVariant}>
              <Icon name="trash" size={14} />
              刪除這個版本
            </button>
          )}
        </div>
      </div>

      {masterChanged && (
        <div className="variant-banner">
          主稿在 {masterUpdated} 有更新，這個版本是 {variant.info.generatedFrom || '匯入時'} 產生的。
          <button className="btn small primary" onClick={regenerate}>
            重新拆分（會覆蓋這個版本的修改）
          </button>
          <button className="btn small ghost" onClick={keepCurrent}>
            保留目前版本
          </button>
        </div>
      )}

      <div className="thread-list" onDragEnd={() => (setDragId(null), setOver(null))}>
        {data.posts.map((post, pi) => {
          const len = postLength(data, pi);
          const tooLong = len > platform.limit;
          return (
            <section key={post.id} className={'tpost' + (copied[post.id] ? ' copied' : '')} onDragOver={(e) => (e.preventDefault(), setOver({ post: pi, index: post.items.length }))} onDrop={dropHere}>
              <div className="tpost-rail">
                <div className="tpost-avatar">{pi + 1}</div>
                {pi < data.posts.length - 1 && <div className="tpost-line" />}
              </div>
              <div className="tpost-main">
                <div className="tpost-head">
                  <span className="muted small">第 {pi + 1} / {data.posts.length} 則</span>
                  <span className={'tcount' + (tooLong ? ' over' : '')} title={tooLong ? '超過這個平台的字數上限' : ''}>
                    {len} / {platform.limit}
                  </span>
                  <span className="spacer" />
                  {pi > 0 && (
                    <button className="btn small ghost" onClick={() => apply(mergeWithPrev(data, pi))} title="把這一則併進上一則">
                      併入上一則
                    </button>
                  )}
                  <button className="btn small ghost" onClick={() => apply(addTextItem(data, pi))} title="在這一則最後加一個文字方塊">
                    <Icon name="plus" size={13} />
                    文字
                  </button>
                  <button className={'btn small' + (copied[post.id] ? '' : ' primary')} onClick={() => copyPost(pi)}>
                    <Icon name={copied[post.id] ? 'check' : 'layers'} size={14} />
                    {copied[post.id] ? '已複製' : '複製這則'}
                  </button>
                </div>

                {post.items.map((it, ii) => (
                  <div key={it.id}>
                    {over && dragId && over.post === pi && over.index === ii && <div className="drop-line" />}
                    <div
                      className={'titem ' + it.type + (dragId === it.id ? ' dragging' : '')}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', it.id);
                        setDragId(it.id);
                      }}
                      onDragOver={(e) => dragOverItem(e, pi, ii)}
                      onDrop={dropHere}
                    >
                      <span className="grip" title="按住拖曳到別則">
                        ⋮⋮
                      </span>
                      {it.type === 'text' ? (
                        <textarea
                          className="ttext"
                          value={it.text}
                          rows={1}
                          placeholder="（空白方塊）"
                          draggable={false}
                          onDragStart={(e) => e.stopPropagation()}
                          onChange={(e) => apply(editText(data, it.id, e.target.value))}
                        />
                      ) : (
                        <div className="timg">
                          <img src={resolve(it.src)} alt="" draggable={false} />
                          <button className="btn small" onClick={() => copyOneImage(it.src)}>
                            複製圖片
                          </button>
                        </div>
                      )}
                      <div className="titem-tools">
                        <button className="icon-btn ghost small" title="上移（到頂會移到上一則）" onClick={() => apply(shiftItem(data, it.id, -1))} disabled={pi === 0 && ii === 0}>
                          ↑
                        </button>
                        <button className="icon-btn ghost small" title="下移（到底會移到下一則）" onClick={() => apply(shiftItem(data, it.id, 1))} disabled={pi === data.posts.length - 1 && ii === post.items.length - 1}>
                          ↓
                        </button>
                        {ii > 0 && (
                          <button className="icon-btn ghost small" title="從這個方塊開始拆成新的一則" onClick={() => apply(splitBefore(data, it.id))}>
                            ⤓
                          </button>
                        )}
                        <button className="icon-btn ghost small" title="刪除這個方塊" onClick={() => apply(removeItem(data, it.id))}>
                          <Icon name="x" size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {over && dragId && over.post === pi && over.index === post.items.length && <div className="drop-line" />}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
