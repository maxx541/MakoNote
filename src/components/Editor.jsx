import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import BlockEditor from './BlockEditor.jsx';
import GameDialog from './GameDialog.jsx';
import VariantPane, { FORMATS } from './VariantPane.jsx';
import ThreadPane from './ThreadPane.jsx';
import CloudUploadDialog from './CloudUploadDialog.jsx';
import LayoutPanel from './LayoutPanel.jsx';
import SmartParagraphMenu from './SmartParagraphMenu.jsx';
import ScrollBackdrop from './ScrollBackdrop.jsx';
import Backdrop from './Backdrop.jsx';
import { StatusPill } from './LibraryViews.jsx';
import { api, debounce, dirOf, errMsg, fmtClock, fmtDuration, gameCoverUrl, nowStamp, shortDate, assetUrl } from '../lib/util.js';
import { processImage } from '../lib/image.js';
import { useImageInput } from '../lib/useImageInput.js';
import { STATUSES } from '../lib/query.js';

const TICK_MS = 1000;
const TIME_SAVE_EVERY = 20; // 秒；撰寫時間至少這麼久寫回檔案一次

export default function Editor({ rel, isNew, ctx, facets, backdrop, onClose }) {
  const { settings, data, notify } = ctx;
  const [layoutOpen, setLayoutOpen] = useState(() => {
    try {
      return localStorage.getItem('makonote.layoutPanel') === '1';
    } catch {
      return false;
    }
  });
  const toggleLayout = () =>
    setLayoutOpen((v) => {
      try {
        localStorage.setItem('makonote.layoutPanel', v ? '0' : '1');
      } catch {
        // 讀寫不到就算了，只是少記住面板開關
      }
      return !v;
    });
  const [meta, setMeta] = useState(null);
  const [body, setBody] = useState(null);
  const [sourceHtml, setSourceHtml] = useState('');
  const [saveState, setSaveState] = useState('saved');
  const [seconds, setSeconds] = useState(0);
  const [active, setActive] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [tab, setTab] = useState('master');
  const [cloudStatus, setCloudStatus] = useState({ configured: false });
  const [cloudMan, setCloudMan] = useState(null); // 這篇的上傳清單；null＝還沒上傳過
  const [cloudDialog, setCloudDialog] = useState(null);
  const [variants, setVariants] = useState([]);
  const tabRef = useRef('master');
  const editorRef = useRef(null);

  const metaRef = useRef(null);
  const bodyRef = useRef('');
  const baselineRef = useRef(null);
  const secondsRef = useRef(0);
  const savedSecondsRef = useRef(0);
  const lastInputRef = useRef(0);
  const dirtyRef = useRef({ meta: false, body: false });
  // 完工後計時暫停；之後真的改了主稿內文才恢復（同時完工日會跟著更新）
  const resumedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  // 這次打開後真的改過內容才寫檔；只是打開來看，原檔一個字都不動
  const editedRef = useRef(false);
  const originalTitleRef = useRef('');
  const titleRef = useRef(null);
  const dir = dirOf(rel);

  // ---------- 讀檔 ----------
  useEffect(() => {
    api.lib
      .read(rel)
      .then(({ meta: m, body: b, html }) => {
        metaRef.current = m;
        originalTitleRef.current = m.title;
        secondsRef.current = savedSecondsRef.current = m.active_seconds;
        setSeconds(m.active_seconds);
        setMeta(m);
        setSourceHtml(html || '');
        setBody(b);
        if (isNew) setTimeout(() => titleRef.current && titleRef.current.select(), 50);
      })
      .catch((e) => notify('讀取失敗：' + errMsg(e)));
  }, [rel, isNew, notify]);

  // ---------- 存檔 ----------
  async function save() {
    const d = dirtyRef.current;
    if (!metaRef.current || baselineRef.current === null) return;
    if (d.meta || d.body) editedRef.current = true;
    if (!editedRef.current) return;
    const now = nowStamp();
    const next = { ...metaRef.current, active_seconds: secondsRef.current };
    if (d.meta || d.body) next.updated = now;
    // 已完工的文章再修改內文，完工日跟著更新
    if (d.body && next.status === '完成') next.completed = now;
    dirtyRef.current = { meta: false, body: false };
    metaRef.current = next;
    setMeta(next);
    setSaveState('saving');
    try {
      await api.lib.write(rel, next, bodyRef.current);
      savedSecondsRef.current = next.active_seconds;
      setSaveState(dirtyRef.current.meta || dirtyRef.current.body ? 'dirty' : 'saved');
    } catch (e) {
      setSaveState('error');
      notify('儲存失敗：' + errMsg(e));
    }
  }
  const saveRef = useRef(save);
  saveRef.current = save;
  const saveSoon = useMemo(() => debounce(() => saveRef.current(), 800), []);

  function patchMeta(patch, record = true) {
    if (patch.status === '完成') resumedRef.current = false;
    const before = metaRef.current;
    metaRef.current = { ...metaRef.current, ...patch };
    if (record) recordMeta(before, metaRef.current, Object.keys(patch));
    setMeta(metaRef.current);
    dirtyRef.current.meta = true;
    setSaveState('dirty');
    saveSoon();
  }

  // ---------- 復原／重做 ----------
  // 內文的復原紀錄在 BlockNote 裡；屬性（標題、狀態、主題、標籤、作品、封面）的修改記在這裡。
  // 兩者排在同一條時間線上：焦點不在文字框時按 Ctrl+Z，復原的是最近的那一步（不管是內文還是屬性）
  const histRef = useRef({ undo: [], redo: [] });
  const applyingRef = useRef(false);

  function pushUndo(entry, merge) {
    const h = histRef.current;
    const top = h.undo[h.undo.length - 1];
    if (top && merge(top)) Object.assign(top, entry, { before: top.before });
    else h.undo.push(entry);
    if (h.undo.length > 300) h.undo.shift();
    h.redo = [];
  }

  function recordMeta(before, after, keys) {
    if (applyingRef.current) return;
    const now = Date.now();
    const typing = keys.every((k) => typeof after[k] === 'string');
    // 同一個欄位連續打字（1 秒內）合成一步
    pushUndo({ kind: 'meta', before, after, keys, time: now }, (top) => typing && top.kind === 'meta' && now - top.time < 1000 && top.keys.join() === keys.join());
  }

  function recordBody() {
    if (applyingRef.current) return;
    const now = Date.now();
    // BlockNote 把 0.5 秒內連續的修改合成一步，這裡跟著合
    pushUndo({ kind: 'body', time: now }, (top) => top.kind === 'body' && now - top.time < 500);
  }

  const pick = (m, keys) => Object.fromEntries(keys.map((k) => [k, m[k]]));

  function step(dir) {
    const h = histRef.current;
    const from = dir === 'undo' ? h.undo : h.redo;
    const to = dir === 'undo' ? h.redo : h.undo;
    const ed = editorRef.current;
    applyingRef.current = true;
    try {
      while (from.length) {
        const e = from.pop();
        if (e.kind === 'meta') {
          patchMeta(pick(dir === 'undo' ? e.before : e.after, e.keys), false);
          to.push(e);
          notify(`已${dir === 'undo' ? '復原' : '重做'}屬性修改`);
          return;
        }
        // 內文：交給 BlockNote；它沒有可復原的步驟時，跳過這筆繼續找
        if (ed && (dir === 'undo' ? ed.undo() : ed.redo())) {
          to.push(e);
          return;
        }
      }
    } finally {
      applyingRef.current = false;
    }
  }

  // 焦點在編輯器裡時由 BlockNote 自己復原，這裡只把時間線上對應的那筆移過去
  function nativeStep(dir) {
    const h = histRef.current;
    const from = dir === 'undo' ? h.undo : h.redo;
    const to = dir === 'undo' ? h.redo : h.undo;
    for (let i = from.length - 1; i >= 0; i -= 1) {
      if (from[i].kind === 'body') {
        to.push(...from.splice(i, 1));
        break;
      }
    }
    applyingRef.current = true;
    setTimeout(() => {
      applyingRef.current = false;
    }, 0);
  }

  const stepRef = useRef({ step, nativeStep });
  stepRef.current = { step, nativeStep };

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const dir = k === 'z' ? (e.shiftKey ? 'redo' : 'undo') : k === 'y' && !e.shiftKey ? 'redo' : '';
      if (!dir || tabRef.current !== 'master' || document.querySelector('.modal-wrap')) return;
      const t = e.target;
      // 文字框（標題、主題、標籤、對話框）用瀏覽器自己的復原
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (t && t.closest && t.closest('.bn-editor')) {
        stepRef.current.nativeStep(dir);
        return;
      }
      e.preventDefault();
      stepRef.current.step(dir);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  function onMarkdown(md) {
    lastInputRef.current = Date.now();
    if (md === bodyRef.current) return;
    bodyRef.current = md;
    resumedRef.current = true;
    recordBody();
    dirtyRef.current.body = true;
    setSaveState('dirty');
    saveSoon();
  }

  // ---------- 撰寫時間：視窗在前景、而且最近有輸入才算 ----------
  useEffect(() => {
    const touch = () => {
      lastInputRef.current = Date.now();
    };
    const events = ['keydown', 'mousedown', 'wheel', 'paste'];
    events.forEach((ev) => window.addEventListener(ev, touch, true));
    const idleMs = (Number(settings.writing.idleSeconds) || 120) * 1000;
    const timer = setInterval(() => {
      // 已完工、之後還沒動過主稿：只是開著看或改屬性都不算時間
      const done = !!metaRef.current && metaRef.current.status === '完成' && !resumedRef.current;
      setPaused(done);
      const on = !done && document.hasFocus() && !document.hidden && Date.now() - lastInputRef.current < idleMs;
      setActive(on && tabRef.current === 'master');
      // 只算寫主稿的時間；編輯巴哈、FB 等格式版本不計
      if (!on || baselineRef.current === null || tabRef.current !== 'master') return;
      secondsRef.current += TICK_MS / 1000;
      setSeconds(secondsRef.current);
      if (editedRef.current && secondsRef.current - savedSecondsRef.current >= TIME_SAVE_EVERY) saveRef.current();
    }, TICK_MS);
    // 切到別的視窗時順手存檔
    const onHide = () => saveRef.current();
    window.addEventListener('blur', onHide);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, touch, true));
      window.removeEventListener('blur', onHide);
      clearInterval(timer);
    };
  }, [settings.writing.idleSeconds]);

  // ---------- 格式版本 ----------
  const refreshCloud = () => {
    api.cloud.status().then(setCloudStatus).catch(() => {});
    api.cloud.manifest(rel).then(setCloudMan).catch(() => setCloudMan(null));
  };
  useEffect(() => {
    refreshCloud();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rel]);

  const refreshVariants = () => api.lib.listVariants(rel).then(setVariants).catch(() => {});
  useEffect(() => {
    refreshVariants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rel]);

  // 切換前先把主稿存好，格式版本才會用到最新內容與更新時間
  async function switchTab(next) {
    if (next === tab) return;
    if (tab === 'master') {
      saveSoon.cancel();
      await save();
    }
    tabRef.current = next;
    setTab(next);
  }

  // ---------- 動作 ----------
  async function close() {
    if (closing) return;
    setClosing(true);
    saveSoon.cancel();
    await save();
    try {
      if (editedRef.current) await api.lib.renameToTitle(rel, metaRef.current.title, originalTitleRef.current);
    } catch (e) {
      notify('資料夾改名失敗：' + errMsg(e));
    }
    onClose();
  }

  function finish() {
    patchMeta({ status: '完成', completed: nowStamp() });
    notify(`完工！這篇共寫了 ${fmtDuration(secondsRef.current)}`);
    // 設定裡開了「完工時詢問」而且金鑰已經設好：問要不要上傳（不會自己上傳）
    if (cloudStatus.configured && settings.cloud.auto) openCloud('完工了。要把這篇的圖片和文章備份到 Cloudinary 嗎？');
  }

  // ---------- Cloudinary ----------
  async function openCloud(intro) {
    // 先把目前的內容存好，上傳的才是最新的
    saveSoon.cancel();
    await save();
    setCloudDialog({ intro });
  }

  // 上傳時沒有編號的匯入文章會被補上編號（寫在檔案裡）；編輯頁也要同步，否則下次存檔會另外產生一個不同的編號
  async function afterCloudUpload() {
    try {
      const fresh = await api.lib.read(rel);
      if (fresh.meta.id && metaRef.current && !metaRef.current.id) {
        metaRef.current = { ...metaRef.current, id: fresh.meta.id };
        setMeta(metaRef.current);
      }
    } catch (e) {
      notify(errMsg(e));
    }
    refreshCloud();
  }

  async function applyCover(blob, name) {
    try {
      const { data: buf, ext } = await processImage(blob, settings.image, name);
      patchMeta({ cover: await api.lib.saveAsset(rel, buf, ext) });
    } catch (e) {
      notify('封面設定失敗：' + errMsg(e));
    }
  }

  async function pickCover() {
    const f = await api.dialog.pickImage();
    if (f) applyCover(new Blob([f.data]), f.name);
  }

  // 封面那一列：圖片檔直接拖進來，或滑鼠停在上面按 Ctrl+V 貼上
  const coverRef = useRef(null);
  const coverOver = useImageInput(coverRef, (files) => applyCover(files[0], files[0].name || '貼上的圖片'), { multiple: false, watch: meta !== null });

  if (!meta || body === null) return <div className="editor-page" />;

  const games = meta.works.map((id) => data.games[id] || { id, title: id });
  const Pane = tab === 'thread' ? ThreadPane : VariantPane;
  const stateText = { saved: '已儲存', dirty: '編輯中', saving: '儲存中…', error: '儲存失敗' }[saveState];

  return (
    <div className="editor-page">
      <div className="editor-bar">
        <button className="btn ghost" onClick={close} disabled={closing}>
          <Icon name="back" size={16} />
          返回
        </button>
        <div className="seg-group format-tabs">
          <button className={'seg' + (tab === 'master' ? ' on' : '')} onClick={() => switchTab('master')}>
            主稿
          </button>
          {FORMATS.map((f) => (
            <button key={f.id} className={'seg' + (tab === f.id ? ' on' : '')} onClick={() => switchTab(f.id)} title={variants.includes(f.id) ? '已建立獨立版本' : '點了只預覽，修改後才會建立版本'}>
              {f.label}
              {variants.includes(f.id) && <span className="dot" />}
            </button>
          ))}
        </div>
        <span className="crumb muted ellipsis">{rel}</span>
        <span className={'save-state ' + saveState}>{stateText}</span>
        <span className={'timer' + (active ? ' on' : '')} title={paused ? '已完工，計時暫停；再修改內文才會繼續計時' : '只計算視窗在前景、而且最近有輸入的時間'}>
          <Icon name="clock" size={15} />
          {fmtClock(seconds)}
        </span>
        {tab === 'master' && (
          <SmartParagraphMenu
            getEditor={() => editorRef.current}
            smart={settings.writing.smart}
            onChange={(patch) => ctx.updateSettings((s) => ({ ...s, writing: { ...s.writing, smart: { ...s.writing.smart, ...patch } } }))}
            notify={notify}
          />
        )}
        <button className={'btn' + (layoutOpen ? ' primary' : '')} onClick={toggleLayout} title="字型、行距、寬度、背景：邊寫邊調">
          <Icon name="sliders" size={16} />
          版面
        </button>
        <button className="icon-btn" onClick={() => api.lib.reveal(rel)} title="在檔案總管開啟這篇的資料夾">
          <Icon name="open" size={17} />
        </button>
        {meta.status === '完成' ? (
          <button className="btn" onClick={() => patchMeta({ status: '撰寫中' })} title="改回撰寫中">
            <Icon name="undo" size={16} />
            改回撰寫中
          </button>
        ) : (
          <button className="btn primary" onClick={finish}>
            <Icon name="check" size={16} />
            完工
          </button>
        )}
      </div>

      <div className="editor-cols">
      <div className="editor-col">
      {tab !== 'master' && (
        <div className="editor-static-bg">
          <Backdrop image={backdrop} />
        </div>
      )}
      {tab !== 'master' && (
        <Pane
          kind={tab}
          rel={rel}
          dir={dir}
          title={meta.title}
          getBlocks={() => (editorRef.current ? editorRef.current.document : [])}
          editor={editorRef.current}
          masterUpdated={meta.updated}
          cloudFiles={cloudMan ? cloudMan.files : null}
          cloudAsJpg={settings.cloud.bahamutFormat === 'jpg'}
          bahamutSizes={settings.bahamut && settings.bahamut.sizes}
          notify={notify}
          onCreated={refreshVariants}
        />
      )}

      {/* 主稿編輯器切到其他格式時只隱藏不卸載，復原紀錄和游標都會保留 */}
      <div className="editor-scroll" style={tab === 'master' ? undefined : { display: 'none' }}>
        <div className="editor-flow">
        <ScrollBackdrop image={backdrop} />
        <div className="paper">
          {/* 長標題自動換行；按 Enter 不換行，直接跳到內文 */}
          <textarea
            ref={titleRef}
            className="title-input"
            rows={1}
            value={meta.title}
            placeholder="標題"
            onChange={(e) => patchMeta({ title: e.target.value.replace(/\n/g, ' ') })}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          />

          <div className="props">
            <div className="prop">
              <span className="prop-k">狀態</span>
              <div className="prop-v">
                {STATUSES.map((s) => (
                  <button key={s} className={'pill-btn' + (meta.status === s ? ' on' : '')} onClick={() => patchMeta({ status: s, ...(s === '完成' && !meta.completed ? { completed: nowStamp() } : {}) })}>
                    <StatusPill status={s} />
                  </button>
                ))}
              </div>
            </div>
            <div className="prop">
              <span className="prop-k">主題</span>
              <div className="prop-v">
                <input className="plain" list="topic-list" value={meta.topic} placeholder="例如 Galgame、動畫、雜談" onChange={(e) => patchMeta({ topic: e.target.value })} />
                <datalist id="topic-list">
                  {facets.topics.map(([t]) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="prop">
              <span className="prop-k">標籤</span>
              <div className="prop-v">
                <TagInput tags={meta.tags} suggestions={facets.tags.map(([t]) => t)} onChange={(tags) => patchMeta({ tags })} />
              </div>
            </div>
            <div className="prop">
              <span className="prop-k">作品</span>
              <div className="prop-v wrap">
                {games.map((g) => (
                  <span key={g.id} className="game-chip">
                    {gameCoverUrl(g) && <img src={gameCoverUrl(g)} alt="" />}
                    {g.title}
                    <button className="chip-x" onClick={() => patchMeta({ works: meta.works.filter((x) => x !== g.id) })} title="解除連結">
                      <Icon name="x" size={12} />
                    </button>
                  </span>
                ))}
                <button className="btn small ghost" onClick={() => setGameOpen(true)}>
                  <Icon name="link" size={14} />
                  連結作品
                </button>
              </div>
            </div>
            <div className="prop">
              <span className="prop-k">封面</span>
              <div ref={coverRef} className={'prop-v wrap' + (coverOver ? ' drop-over' : '')}>
                {meta.cover ? (
                  <>
                    <img className="cover-mini" src={assetUrl(dir, meta.cover)} alt="" />
                    <button className="btn small ghost" onClick={() => patchMeta({ cover: '' })}>
                      清除
                    </button>
                  </>
                ) : (
                  <span className="muted small">未設定</span>
                )}
                <button className="btn small ghost" onClick={pickCover}>
                  <Icon name="image" size={14} />
                  選擇圖片
                </button>
              </div>
            </div>
            <div className="prop">
              <span className="prop-k">雲端</span>
              <div className="prop-v wrap">
                {cloudMan ? (
                  <span className="muted small">
                    已備份 {Object.keys(cloudMan.files).length} 個檔案
                    {cloudMan.uploadedAt ? ` · ${cloudMan.uploadedAt.slice(0, 16).replace('T', ' ')}` : '（從雲端還原）'} · {cloudMan.cloud}
                  </span>
                ) : (
                  <span className="muted small">還沒上傳到 Cloudinary</span>
                )}
                {cloudStatus.configured ? (
                  <button className="btn small ghost" onClick={() => openCloud('')}>
                    <Icon name="external" size={14} />
                    {cloudMan ? '再上傳（只傳有變的）' : '上傳到 Cloudinary'}
                  </button>
                ) : (
                  <span className="muted small">尚未設定金鑰</span>
                )}
              </div>
            </div>
            <div className="prop">
              <span className="prop-k">時間</span>
              <div className="prop-v muted small">
                建立 {meta.created || '—'}
                {meta.completed && ` · ${meta.status === '完成' ? '完工' : '上次完工'} ${meta.completed}`}
                {` · 撰寫 ${fmtDuration(seconds)}`}
                {meta.updated && ` · 最後修改 ${shortDate(meta.updated)}`}
              </div>
            </div>
          </div>

          <div className="editor-body">
            <BlockEditor
              articleRel={rel}
              baseDir={dir}
              body={body}
              sourceHtml={sourceHtml}
              imageSettings={settings.image}
              ocrSettings={settings.ocr}
              onOcrSettings={(ocr) => ctx.updateSettings((s) => ({ ...s, ocr }))}
              menuSettings={settings.writing.menu}
              smartSettings={settings.writing.smart}
              onCustomizeMenu={() => ctx.openSettings('writing')}
              notify={notify}
              onMarkdown={onMarkdown}
              onReady={(md) => {
                bodyRef.current = md;
                baselineRef.current = md;
              }}
              onEditor={(ed) => {
                editorRef.current = ed;
                window.__makonoteEditor = ed; // 除錯、自動測試用
              }}
            />
          </div>
        </div>
        </div>
      </div>
      </div>
      {layoutOpen && (
        <LayoutPanel
          theme={settings.theme}
          updateSettings={ctx.updateSettings}
          notify={notify}
          onMoreSettings={() => ctx.openSettings('look')}
          onClose={toggleLayout}
        />
      )}
      </div>

      {cloudDialog &&<CloudUploadDialog rel={rel} intro={cloudDialog.intro} onClose={() => setCloudDialog(null)} onUploaded={afterCloudUpload} />}

      {gameOpen && (
        <GameDialog
          initial={meta.works.length ? '' : meta.title.replace(/\s*(心得|文章)$/, '')}
          onClose={() => setGameOpen(false)}
          onPick={async (game) => {
            setGameOpen(false);
            await ctx.reload();
            if (!meta.works.includes(game.id)) patchMeta({ works: [...meta.works, game.id] });
            notify(`已連結「${game.title}」，封面已存到 _works/${game.id}/`);
          }}
        />
      )}
    </div>
  );
}

function TagInput({ tags, suggestions, onChange }) {
  const [text, setText] = useState('');
  const add = (raw) => {
    const t = raw.trim().replace(/^#/, '');
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setText('');
  };
  return (
    <div className="tag-input">
      {tags.map((t) => (
        <span key={t} className="chip on">
          #{t}
          <button className="chip-x" onClick={() => onChange(tags.filter((x) => x !== t))} title="移除">
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}
      <input
        className="plain"
        list="tag-list"
        value={text}
        placeholder={tags.length ? '' : '輸入後按 Enter'}
        onChange={(e) => {
          const v = e.target.value;
          if (/[,，]$/.test(v)) add(v.slice(0, -1));
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={() => text && add(text)}
      />
      <datalist id="tag-list">
        {suggestions.filter((s) => !tags.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
