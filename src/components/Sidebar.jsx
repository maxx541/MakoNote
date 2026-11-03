import { useState } from 'react';
import Icon from './Icon.jsx';
import { STATUSES, matchRule } from '../lib/query.js';

const DRAG_TYPE = 'application/x-makonote-article';

export function startArticleDrag(e, rel) {
  e.dataTransfer.setData(DRAG_TYPE, rel);
  e.dataTransfer.effectAllowed = 'move';
}

// 可以接住拖曳文章的項目
function DropItem({ folder, onDrop, children, ...rest }) {
  const [over, setOver] = useState(false);
  return (
    <div
      {...rest}
      className={(rest.className || '') + (over ? ' drop-over' : '')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const rel = e.dataTransfer.getData(DRAG_TYPE);
        if (rel) onDrop(rel, folder);
      }}
    >
      {children}
    </div>
  );
}

function buildTree(folders) {
  const nodes = {};
  const top = [];
  for (const f of [...folders].sort((a, b) => a.localeCompare(b, 'zh-Hant'))) {
    nodes[f] = { path: f, name: f.split('/').pop(), children: [] };
    const parent = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '';
    if (parent && nodes[parent]) nodes[parent].children.push(nodes[f]);
    else top.push(nodes[f]);
  }
  return top;
}

export default function Sidebar({
  data,
  folderData = data,
  facets,
  collections,
  sel,
  setSel,
  onDropArticle,
  onCreateFolder,
  onNewCollection,
  onEditCollection,
  onOpenRoot,
  rootPath = '',
  collapsed = {},
  hidden = false,
  onToggle = () => {},
}) {
  const is = (kind, value) => sel.kind === kind && (value === undefined || sel.value === value);
  const count = (pred) => data.articles.filter(pred).length;
  // 資料夾樹與資料夾的篇數永遠看全部文章，不受 Galgame／動畫／部落格模式影響
  const folderCount = (pred) => folderData.articles.filter(pred).length;
  const tree = buildTree(folderData.folders);

  const Item = ({ kind, value, icon, label, n, onDoubleClick }) => (
    <button className={'side-item' + (is(kind, value) ? ' on' : '')} onClick={() => setSel({ kind, value })} onDoubleClick={onDoubleClick}>
      {icon && <Icon name={icon} size={16} />}
      <span className="side-label">{label}</span>
      {n !== undefined && <span className="side-n">{n}</span>}
    </button>
  );

  const folded = (key) => !!collapsed[key];

  // 區塊標題：點標題或箭頭就收合／展開
  const Title = ({ id, label, children }) => (
    <div className="side-title">
      <button className="side-fold" onClick={() => onToggle(id)} title={folded(id) ? '展開' : '收合'} aria-expanded={!folded(id)}>
        <Icon name="chevron" size={12} className={folded(id) ? '' : 'open'} />
        {label}
      </button>
      {children}
    </div>
  );

  // 資料夾：有子資料夾的才有箭頭；收合後子資料夾藏起來，但這個資料夾本身仍然可以選、可以接住拖來的文章
  const renderFolder = (node, depth) => {
    const key = 'dir:' + node.path;
    const hasKids = node.children.length > 0;
    return (
      <div key={node.path}>
        <DropItem folder={node.path} onDrop={onDropArticle} style={{ paddingLeft: depth * 14 }}>
          <div className="side-folder">
            {hasKids ? (
              <button className="fold-btn" onClick={() => onToggle(key)} title={folded(key) ? '展開子資料夾' : '收合子資料夾'} aria-expanded={!folded(key)}>
                <Icon name="chevron" size={12} className={folded(key) ? '' : 'open'} />
              </button>
            ) : (
              <span className="fold-spacer" />
            )}
            <Item
              kind="folder"
              value={node.path}
              icon="folder"
              label={node.name}
              n={folderCount((a) => a.folder === node.path || a.folder.startsWith(node.path + '/'))}
            />
          </div>
        </DropItem>
        {hasKids && !folded(key) && node.children.map((c) => renderFolder(c, depth + 1))}
      </div>
    );
  };

  return (
    <aside className={"sidebar" + (hidden ? " hidden" : "")} aria-hidden={hidden}>
      <section>
        <Item kind="all" icon="layers" label="全部文章" n={data.articles.length} />
        {STATUSES.map((s) => (
          <Item key={s} kind="status" value={s} icon={s === '完成' ? 'check' : 'pen'} label={s} n={count((a) => a.meta.status === s)} />
        ))}
      </section>

      <section>
        <Title id="sec:collections" label="動態收藏">
          <button className="icon-btn ghost small" onClick={onNewCollection} title="新增動態收藏">
            <Icon name="plus" size={14} />
          </button>
        </Title>
        {!folded('sec:collections') && (
          <>
            {collections.map((c) => (
              <div key={c.id} className="side-row">
                <Item kind="collection" value={c.id} icon="star" label={c.name} n={count((a) => matchRule(a, c.rule))} />
                <button className="icon-btn ghost small row-tool" onClick={() => onEditCollection(c)} title="編輯條件">
                  <Icon name="sliders" size={13} />
                </button>
              </div>
            ))}
          </>
        )}
      </section>

      <section>
        <Title id="sec:folders" label="資料夾">
          <button className="icon-btn ghost small" onClick={() => onCreateFolder(sel.kind === 'folder' ? sel.value : '')} title="新增資料夾">
            <Icon name="folderPlus" size={14} />
          </button>
        </Title>
        {!folded('sec:folders') && (
          <>
            <DropItem folder="" onDrop={onDropArticle}>
              <button className="side-item root-drop" onClick={onOpenRoot} title={'在檔案總管開啟文章庫' + (rootPath ? '：' + rootPath : '')}>
                <Icon name="open" size={16} />
                <span className="side-label">文章庫根目錄</span>
              </button>
            </DropItem>
            {rootPath && <div className="side-hint root-path" title={rootPath}>{rootPath.split(/[\\/]/).slice(-2).join(' / ')}</div>}
            {tree.map((n) => renderFolder(n, 0))}
          </>
        )}
      </section>

      {facets.topics.length > 0 && (
        <section>
          <Title id="sec:topics" label="主題" />
          {!folded('sec:topics') && facets.topics.map(([t, n]) => <Item key={t} kind="topic" value={t} label={t} n={n} />)}
        </section>
      )}

      {facets.tags.length > 0 && (
        <section>
          <Title id="sec:tags" label="標籤" />
          {!folded('sec:tags') && (
            <div className="tag-cloud">
              {facets.tags.slice(0, 40).map(([t, n]) => (
                <button key={t} className={'chip' + (is('tag', t) ? ' on' : '')} onClick={() => setSel({ kind: 'tag', value: t })}>
                  <span className="chip-t" title={'#' + t}>
                    #{t}
                  </span>
                  <span className="chip-n">{n}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </aside>
  );
}
