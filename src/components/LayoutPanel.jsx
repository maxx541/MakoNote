import Icon from './Icon.jsx';
import { LookTab, TextTab } from './SettingsDialog.jsx';

// 編輯頁右邊的版面面板：字型、行距、寬度、背景、遮罩都在這裡調，文章就在旁邊即時變化
export default function LayoutPanel({ theme, updateSettings, notify, onMoreSettings, onClose }) {
  const setTheme = (patch) => updateSettings((s) => ({ ...s, theme: { ...s.theme, ...patch } }));
  return (
    <aside className="layout-panel">
      <div className="layout-head">
        <h2>版面</h2>
        <button className="icon-btn ghost" onClick={onClose} title="收起版面面板">
          <Icon name="x" />
        </button>
      </div>
      <div className="layout-body">
        <h3>文字與寬度</h3>
        <TextTab t={theme} setTheme={setTheme} />
        <h3>背景與面板</h3>
        <LookTab t={theme} setTheme={setTheme} notify={notify} />
      </div>
      <div className="layout-foot">
        <button className="btn ghost small" onClick={onMoreSettings}>
          <Icon name="sliders" size={14} />
          全部設定…
        </button>
      </div>
    </aside>
  );
}
