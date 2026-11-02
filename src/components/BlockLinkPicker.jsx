import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';

const TYPE_LABEL = {
  heading: '標題',
  paragraph: '段落',
  quote: '引用',
  toggleListItem: '摺疊',
  bulletListItem: '清單',
  numberedListItem: '編號',
  checkListItem: '待辦',
  image: '圖片',
  codeBlock: '程式碼',
};

function textOf(content) {
  if (!Array.isArray(content)) return '';
  return content.map((c) => (c.type === 'text' ? c.text : textOf(c.content))).join('');
}

function flatten(blocks, depth = 0, out = []) {
  for (const b of blocks) {
    const text = b.type === 'image' ? b.props.caption || b.props.name || '（圖片）' : textOf(b.content);
    if (text.trim()) out.push({ id: b.id, type: b.type, level: b.props && b.props.level, text, depth });
    if (b.children) flatten(b.children, depth + 1, out);
  }
  return out;
}

// 選一個段落當連結目標；標題排在最前面方便找
export default function BlockLinkPicker({ editor, onPick, onClose }) {
  const [q, setQ] = useState('');
  const all = useMemo(() => flatten(editor.document), [editor]);
  const list = all.filter((b) => !q || b.text.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="modal-wrap" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>連結到文中段落</h2>
          <button className="icon-btn ghost" onClick={onClose} title="關閉">
            <Icon name="x" />
          </button>
        </div>
        <input autoFocus value={q} placeholder="搜尋段落內容" onChange={(e) => setQ(e.target.value)} style={{ width: '100%' }} />
        <div className="pick-list">
          {list.length === 0 && <div className="muted">找不到符合的段落</div>}
          {list.map((b) => (
            <button key={b.id} className={'pick-item' + (b.type === 'heading' ? ' heading' : '')} style={{ paddingLeft: 10 + b.depth * 16 }} onClick={() => onPick(b.id)}>
              <span className="pick-type">{b.type === 'heading' ? `H${b.level}` : TYPE_LABEL[b.type] || '方塊'}</span>
              <span className="ellipsis">{b.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
