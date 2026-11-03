import { useEffect, useRef, useState } from 'react';
import { useImageInput } from '../lib/useImageInput.js';
import Icon from './Icon.jsx';
import { api, errMsg, libUrl, extUrl } from '../lib/util.js';
import { processImage } from '../lib/image.js';
import CloudTab from './CloudTab.jsx';
import { DEFAULT_THEME, FONTS } from '../lib/settings.js';
import { EDITOR_ACTIONS, DEFAULT_MENU, actionById, menuIds } from '../lib/editorActions.js';

export function Slider({ label, value, min, max, step, unit = '', format, onChange }) {
  return (
    <div className="slider">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="slider-v">{format ? format(value) : `${value}${unit}`}</span>
    </div>
  );
}

const pct = (v) => `${Math.round(v * 100)}%`;

const TABS = [
  { id: 'look', label: '外觀' },
  { id: 'text', label: '文字' },
  { id: 'stickers', label: '小貼圖' },
  { id: 'themes', label: '主題' },
  { id: 'images', label: '圖片' },
  { id: 'cloud', label: '雲端' },
  { id: 'writing', label: '撰寫' },
  { id: 'library', label: '文章庫' },
];

// 設定：分頁呈現；改了立刻套用，自動存到 <文章庫>/.app/settings.json
export default function SettingsDialog({ initialTab, root, settings, updateSettings, stickerFolders, notify, onChangeRoot, onClose }) {
  const [tab, setTab] = useState(TABS.some((x) => x.id === initialTab) ? initialTab : 'look');
  const t = settings.theme;
  const st = settings.stickers;

  const setTheme = (patch) => updateSettings((s) => ({ ...s, theme: { ...s.theme, ...patch } }));
  const setImage = (patch) => updateSettings((s) => ({ ...s, image: { ...s.image, ...patch } }));
  const setWriting = (patch) => updateSettings((s) => ({ ...s, writing: { ...s.writing, ...patch } }));
  const setStickers = (patch) => updateSettings((s) => ({ ...s, stickers: { ...s.stickers, ...patch } }));

  return (
    <div className="modal-wrap" onMouseDown={onClose}>
      <div className="modal settings-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>設定</h2>
          <button className="icon-btn ghost" onClick={onClose} title="關閉">
            <Icon name="x" />
          </button>
        </div>
        <div className="tabs">
          {TABS.map((x) => (
            <button key={x.id} className={'tab' + (tab === x.id ? ' on' : '')} onClick={() => setTab(x.id)}>
              {x.label}
            </button>
          ))}
        </div>

        <div className="settings-body">
          {tab === 'look' && <LookTab t={t} setTheme={setTheme} notify={notify} />}
          {tab === 'text' && <TextTab t={t} setTheme={setTheme} />}
          {tab === 'stickers' && <StickerTab st={st} setStickers={setStickers} folders={stickerFolders} />}
          {tab === 'themes' && <ThemeTab t={t} setTheme={setTheme} notify={notify} />}
          {tab === 'images' && (
            <ImageTab
              image={settings.image}
              setImage={setImage}
              sizes={settings.bahamut.sizes}
              setSizes={(patch) => updateSettings((s) => ({ ...s, bahamut: { ...s.bahamut, sizes: { ...s.bahamut.sizes, ...patch } } }))}
            />
          )}
          {tab === 'cloud' && <CloudTab cloud={settings.cloud} setCloud={(patch) => updateSettings((s) => ({ ...s, cloud: { ...s.cloud, ...patch } }))} notify={notify} />}
          {tab === 'writing' && <WritingTab writing={settings.writing} setWriting={setWriting} />}
          {tab === 'library' && <LibraryTab root={root} onChangeRoot={onChangeRoot} />}
        </div>
      </div>
    </div>
  );
}

export function LookTab({ t, setTheme, notify }) {
  const bgRef = useRef(null);
  const bgOver = useImageInput(bgRef, (files) => setBackgroundFrom(files[0], files[0].name || '貼上的圖片'), { multiple: false });
  async function pickBackground() {
    const f = await api.dialog.pickImage();
    if (f) setBackgroundFrom(new Blob([f.data]), f.name);
  }
  async function setBackgroundFrom(blob, name) {
    try {
      // 背景圖只是裝飾，壓到 2560 就夠清楚
      const { data, ext } = await processImage(blob, { maxEdge: 2560, format: 'webp', quality: 0.9 }, name);
      setTheme({ background: await api.lib.saveBackground(data, ext) });
    } catch (e) {
      notify('背景設定失敗：' + errMsg(e));
    }
  }
  return (
    <>
      <div ref={bgRef} className={'bg-pick' + (bgOver ? ' drop-over' : '')}>
        <div className="bg-preview" style={t.background ? { backgroundImage: `url("${libUrl(t.background)}")` } : {}}>
          <div className="bg-preview-mask" />
          <div className="bg-preview-panel">文字範例 Aa</div>
        </div>
        <div className="col">
          <button className="btn" onClick={pickBackground}>
            <Icon name="image" size={16} />
            選擇背景圖片
          </button>
          {t.background && (
            <button className="btn ghost" onClick={() => setTheme({ background: '' })}>
              移除背景
            </button>
          )}
        </div>
      </div>
      <div className="field two">
        <div>
          <label>遮罩顏色</label>
          <input type="color" value={t.overlayColor} onChange={(e) => setTheme({ overlayColor: e.target.value })} />
        </div>
        <div>
          <label>主色</label>
          <input type="color" value={t.accent} onChange={(e) => setTheme({ accent: e.target.value })} />
        </div>
      </div>
      <Slider label="遮罩濃度" value={t.overlayOpacity} min={0} max={1} step={0.01} format={pct} onChange={(v) => setTheme({ overlayOpacity: v })} />
      <Slider label="背景模糊" value={t.blur} min={0} max={30} step={1} unit="px" onChange={(v) => setTheme({ blur: v })} />
      <Slider label="面板不透明度" value={t.panelOpacity} min={0.3} max={1} step={0.01} format={pct} onChange={(v) => setTheme({ panelOpacity: v })} />
      <Slider label="圓角" value={t.radius} min={0} max={20} step={1} unit="px" onChange={(v) => setTheme({ radius: v })} />
      <div className="field">
        <label>編輯頁背景</label>
        <select value={t.editorBackground} onChange={(e) => setTheme({ editorBackground: e.target.value })}>
          <option value="cover">這篇的作品封面（沒有就用全域背景）</option>
          <option value="global">一律用全域背景</option>
          <option value="none">不用背景圖</option>
        </select>
      </div>
    </>
  );
}

const WIDTHS = [0, 760, 900, 1100, 1300, 1600];

export function TextTab({ t, setTheme }) {
  return (
    <>
      <div className="field">
        <label>字型</label>
        <select value={t.font} onChange={(e) => setTheme({ font: e.target.value })}>
          {Object.entries(FONTS).map(([k, f]) => (
            <option key={k} value={k}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <Slider label="內文字級" value={t.fontSize} min={13} max={22} step={1} unit="px" onChange={(v) => setTheme({ fontSize: v })} />
      <Slider label="行距" value={t.lineHeight} min={1.3} max={2.4} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => setTheme({ lineHeight: v })} />
      <div className="field">
        <label>編輯區寬度</label>
        <select value={t.editorWidth} onChange={(e) => setTheme({ editorWidth: Number(e.target.value) })}>
          {(WIDTHS.includes(t.editorWidth) ? WIDTHS : [...WIDTHS, t.editorWidth].sort((a, b) => a - b)).map((v) => (
            <option key={v} value={v}>
              {v ? `最寬 ${v} px` : '滿版（貼近視窗寬度）'}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

function StickerTab({ st, setStickers, folders }) {
  async function addFolder() {
    const dir = await api.stickers.pickFolder();
    if (dir && !st.folders.some((f) => f.path === dir)) setStickers({ folders: [...st.folders, { path: dir, enabled: true }], enabled: true });
  }
  const countOf = (p) => (folders.find((f) => f.path === p) || { files: [] }).files.length;
  return (
    <>
      <label className="check">
        <input type="checkbox" checked={st.enabled} onChange={(e) => setStickers({ enabled: e.target.checked })} />
        顯示小貼圖（一次一張，放在視窗左下或右下角，換頁時隨機換）
      </label>
      <h3>貼圖資料夾</h3>
      <div className="theme-list">
        {st.folders.length === 0 && <div className="muted small">還沒有貼圖資料夾</div>}
        {st.folders.map((f) => (
          <div key={f.path} className="theme-item">
            <input
              type="checkbox"
              checked={f.enabled}
              onChange={(e) => setStickers({ folders: st.folders.map((x) => (x.path === f.path ? { ...x, enabled: e.target.checked } : x)) })}
              title="啟用這個資料夾"
            />
            <span className="ellipsis" title={f.path}>
              {f.path}
            </span>
            <span className="muted small">{countOf(f.path)} 張</span>
            <button className="icon-btn ghost small" title="移除（不會刪除檔案）" onClick={() => setStickers({ folders: st.folders.filter((x) => x.path !== f.path) })}>
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
      <button className="btn" onClick={addFolder} style={{ marginTop: 10 }}>
        <Icon name="folderPlus" size={16} />
        加入貼圖資料夾
      </button>
      <div className="field">
        <label>位置</label>
        <select value={st.corner} onChange={(e) => setStickers({ corner: e.target.value })}>
          <option value="random">左下或右下（每次換頁隨機）</option>
          <option value="right">固定右下角</option>
          <option value="left">固定左下角</option>
        </select>
      </div>
      <Slider label="大小" value={st.size} min={60} max={260} step={10} unit="px" onChange={(v) => setStickers({ size: v })} />
      <Slider label="不透明度" value={st.opacity} min={0.2} max={1} step={0.05} format={pct} onChange={(v) => setStickers({ opacity: v })} />
      <h3>什麼時候不顯示</h3>
      <label className="check">
        <input type="checkbox" checked={st.hideWhenCovered} onChange={(e) => setStickers({ hideWhenCovered: e.target.checked })} />
        貼圖的位置底下有卡片或文字時先藏起來（只在空白處出現）
      </label>
      <div className="field">
        <label>目前列出的文章超過幾篇就不顯示</label>
        <select value={st.maxArticles} onChange={(e) => setStickers({ maxArticles: Number(e.target.value) })}>
          {[0, 6, 12, 20, 30, 50].map((v) => (
            <option key={v} value={v}>
              {v ? `${v} 篇` : '不限（只看有沒有蓋到內容）'}
            </option>
          ))}
        </select>
      </div>
      <SamplePreview folders={folders} st={st} />
    </>
  );
}

function SamplePreview({ folders, st }) {
  const files = folders.filter((f) => (st.folders.find((x) => x.path === f.path) || {}).enabled).flatMap((f) => f.files);
  if (!files.length) return null;
  return (
    <div className="sticker-sample">
      {files.slice(0, 8).map((f) => (
        <img key={f} src={extUrl(f)} alt="" style={{ opacity: st.opacity }} />
      ))}
    </div>
  );
}

function ThemeTab({ t, setTheme, notify }) {
  const [themes, setThemes] = useState([]);
  const [name, setName] = useState('');
  const load = () => api.lib.listThemes().then(setThemes).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  async function save() {
    const n = name.trim();
    if (!n) {
      notify('先幫主題取個名字');
      return;
    }
    await api.lib.saveTheme(n, t);
    setName('');
    load();
    notify(`主題「${n}」已儲存`);
  }

  return (
    <>
      <div className="row">
        <input value={name} placeholder="主題名稱" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <button className="btn" onClick={save}>
          儲存目前外觀
        </button>
      </div>
      <div className="theme-list">
        <div className="theme-item">
          <span>預設</span>
          <button className="btn small ghost" onClick={() => setTheme({ ...DEFAULT_THEME, background: t.background })}>
            套用
          </button>
        </div>
        {themes.map((th) => (
          <div key={th.name} className="theme-item">
            <span className="ellipsis">{th.name}</span>
            <button className="btn small ghost" onClick={() => setTheme({ ...DEFAULT_THEME, ...th.theme })}>
              套用
            </button>
            <button
              className="icon-btn ghost small"
              title="刪除主題"
              onClick={async () => {
                await api.lib.deleteTheme(th.name);
                load();
              }}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function ImageTab({ image, setImage, sizes, setSizes }) {
  return (
    <>
      <div className="field two">
        <div>
          <label>轉存格式</label>
          <select value={image.format} onChange={(e) => setImage({ format: e.target.value })}>
            <option value="webp">WebP（檔案最小）</option>
            <option value="jpeg">JPEG</option>
            <option value="png">PNG（不失真）</option>
            <option value="original">保留原格式</option>
          </select>
        </div>
        <div>
          <label>最長邊上限</label>
          <select value={image.maxEdge} onChange={(e) => setImage({ maxEdge: Number(e.target.value) })}>
            {[1280, 1600, 1920, 2560, 3840, 0].map((v) => (
              <option key={v} value={v}>
                {v ? `${v} px` : '不縮小'}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Slider label="壓縮品質" value={image.quality} min={0.5} max={1} step={0.01} format={pct} onChange={(v) => setImage({ quality: v })} />
      <label className="check">
        <input type="checkbox" checked={image.fetchRemote} onChange={(e) => setImage({ fetchRemote: e.target.checked })} />
        從網頁複製貼上的圖片，自動下載到本地
      </label>

      <h3>巴哈版本的圖片大小</h3>
      <Slider label="大" value={sizes.large} min={300} max={900} step={10} unit="px" onChange={(v) => setSizes({ large: v })} />
      <Slider label="中" value={sizes.medium} min={200} max={600} step={10} unit="px" onChange={(v) => setSizes({ medium: v })} />
      <Slider label="小" value={sizes.small} min={100} max={400} step={10} unit="px" onChange={(v) => setSizes({ small: v })} />
    </>
  );
}

function WritingTab({ writing, setWriting }) {
  return (
    <>
      <h3>撰寫時間</h3>
      <div className="field">
        <label>閒置多久暫停計時</label>
        <select value={writing.idleSeconds} onChange={(e) => setWriting({ idleSeconds: Number(e.target.value) })}>
          {[30, 60, 120, 180, 300, 600].map((v) => (
            <option key={v} value={v}>
              {v < 60 ? `${v} 秒` : `${v / 60} 分鐘`}
            </option>
          ))}
        </select>
      </div>
      <MenuEditor ids={menuIds(writing.menu)} onChange={(menu) => setWriting({ menu })} />
    </>
  );
}

// 編輯器右鍵選單：從所有動作裡勾選常用的、排順序
function MenuEditor({ ids, onChange }) {
  const move = (i, d) => {
    const next = [...ids];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  const rest = EDITOR_ACTIONS.filter((a) => !ids.includes(a.id));
  return (
    <>
      <h3>右鍵選單</h3>
      <div className="menu-editor">
        {ids.length === 0 && <div className="muted small">選單是空的，從下面勾選要放進去的動作</div>}
        {ids.map((id, i) => {
          const a = actionById(id);
          return (
            <div key={id} className="theme-item">
              <input type="checkbox" checked onChange={() => onChange(ids.filter((x) => x !== id))} title="從選單拿掉" />
              <Icon name={a.icon} size={15} />
              <span className="ellipsis">{a.label}</span>
              <button className="icon-btn ghost small" disabled={i === 0} onClick={() => move(i, -1)} title="往上移">
                <Icon name="chevron" size={14} className="rot-up" />
              </button>
              <button className="icon-btn ghost small" disabled={i === ids.length - 1} onClick={() => move(i, 1)} title="往下移">
                <Icon name="chevron" size={14} className="rot-down" />
              </button>
            </div>
          );
        })}
      </div>
      <details className="menu-more">
        <summary>其他可以加進去的動作（{rest.length}）</summary>
        <div className="menu-editor">
          {rest.map((a) => (
            <label key={a.id} className="theme-item">
              <input type="checkbox" checked={false} onChange={() => onChange([...ids, a.id])} />
              <Icon name={a.icon} size={15} />
              <span className="ellipsis">{a.label}</span>
              {a.group && <span className="muted small">{a.group}</span>}
            </label>
          ))}
        </div>
      </details>
      <button className="btn ghost small" onClick={() => onChange([...DEFAULT_MENU])} style={{ marginTop: 8 }}>
        <Icon name="undo" size={14} />
        還原預設選單
      </button>
    </>
  );
}

function LibraryTab({ root, onChangeRoot }) {
  return (
    <>
      <div className="root-path">{root}</div>
      <div className="row">
        <button className="btn" onClick={() => api.lib.reveal('')}>
          <Icon name="open" size={16} />
          開啟資料夾
        </button>
        <button className="btn" onClick={onChangeRoot}>
          切換文章庫
        </button>
      </div>
    </>
  );
}
