import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { startArticleDrag } from './Sidebar.jsx';
import { articleThumb, gameCover, gameCoverUrl, gameName, shortDate, fmtDuration } from '../lib/util.js';

export function StatusPill({ status }) {
  return <span className={'pill ' + (status === '完成' ? 'done' : 'wip')}>{status}</span>;
}

// 標題裡直接出現的關鍵字標亮（模糊比對到的就不標，避免亂標）
export function Highlight({ text, query }) {
  const q = (query || '').trim();
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function Thumb({ src, title, className }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={className + ' thumb-empty'}>
        {/* 沒有封面：用標題的第一個字當底圖，跳過【《「 這類括號 */}
        <span>{(title || '').replace(/^[\s【[《「『（(〈"'#]+/, '').slice(0, 1) || '?'}</span>
      </div>
    );
  }
  return <img className={className} src={src} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />;
}

function articleProps(a, ctx) {
  return {
    draggable: true,
    onDragStart: (e) => startArticleDrag(e, a.rel),
    onClick: () => ctx.openArticle(a.rel),
    onContextMenu: (e) => ctx.articleMenu(e, a),
  };
}

function GameLine({ a, games }) {
  if (!a.meta.works.length) return a.meta.topic ? <span>{a.meta.topic}</span> : null;
  return <span>{a.meta.works.map((id) => gameName(id, games)).join('、')}</span>;
}

// ---------- 部落格模式 ----------

export function BlogView({ list, ctx, query }) {
  const { games } = ctx.data;
  return (
    <div className="blog">
      {list.map((a) => (
        <article key={a.rel} className="blog-row" {...articleProps(a, ctx)}>
          <Thumb className="blog-img" src={articleThumb(a, games)} title={a.meta.title} />
          <div className="blog-body">
            <h3>
              <Highlight text={a.meta.title} query={query} />
            </h3>
            <div className="meta-line muted small">
              <StatusPill status={a.meta.status} />
              <GameLine a={a} games={games} />
              <span>{shortDate(a.meta.created)}</span>
              {a.meta.completed && <span>完工 {shortDate(a.meta.completed)}</span>}
              {a.meta.active_seconds > 0 && <span>{fmtDuration(a.meta.active_seconds)}</span>}
              {a.words > 0 && <span>{a.words.toLocaleString()} 字</span>}
            </div>
            <p className="excerpt clamp2">{a.excerpt || '（還沒有內文）'}</p>
            {a.meta.tags.length > 0 && (
              <div className="tags">
                {a.meta.tags.map((t) => (
                  <span key={t} className="tag">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

// ---------- Galgame 模式：作品當書架，心得在右側展開；沒連結作品的文章獨立上架 ----------

// 依清單順序（已排好序）組出書架上的項目：一部作品一格、一篇獨立文章一格
export function shelfItems(list) {
  const items = [];
  const byGame = new Map();
  for (const a of list) {
    if (!a.meta.works.length) {
      items.push({ key: 'a:' + a.rel, kind: 'article', article: a });
      continue;
    }
    for (const id of a.meta.works) {
      if (!byGame.has(id)) {
        const item = { key: 'g:' + id, kind: 'game', id, articles: [] };
        byGame.set(id, item);
        items.push(item);
      }
      byGame.get(id).articles.push(a);
    }
  }
  return items;
}

function StatusBar({ articles }) {
  const done = articles.filter((a) => a.meta.status === '完成').length;
  const wip = articles.length - done;
  // 篇數多時改成比例條，不會擠成一團
  if (articles.length > 10) {
    return (
      <div className="statusbar">
        <div className="seg-done" style={{ flex: done }} />
        <div className="seg-wip" style={{ flex: wip }} />
      </div>
    );
  }
  return (
    <div className="statusbar">
      {Array.from({ length: done }, (_, i) => (
        <div key={'d' + i} className="seg-done" />
      ))}
      {Array.from({ length: wip }, (_, i) => (
        <div key={'w' + i} className="seg-wip" />
      ))}
    </div>
  );
}

export function GalView({ list, ctx, query, onOpenGame }) {
  const { games } = ctx.data;
  const items = useMemo(() => shelfItems(list), [list]);
  const [picked, setPicked] = useState(null);
  const selected = items.find((it) => it.key === picked) || items[0];

  const writing = query
    ? []
    : list
        .filter((a) => a.meta.status !== '完成')
        .sort((x, y) => (y.meta.updated || '').localeCompare(x.meta.updated || ''))
        .slice(0, 4);

  return (
    <div className="gal">
      {writing.length > 0 && (
        <section className="shelf">
          <div className="shelf-title">
            <Icon name="pen" size={15} />
            繼續撰寫
          </div>
          <div className="shelf-row">
            {writing.map((a) => (
              <button key={a.rel} className="shelf-item" onClick={() => ctx.openArticle(a.rel)} onContextMenu={(e) => ctx.articleMenu(e, a)}>
                <Thumb className="shelf-img" src={gameCover(a, games) || articleThumb(a, games)} title={a.meta.title} />
                <div className="shelf-text">
                  <div className="ellipsis">{a.meta.title}</div>
                  <div className="muted small ellipsis">
                    {a.meta.works.length ? gameName(a.meta.works[0], games) : a.meta.topic || '獨立文章'} · {shortDate(a.meta.updated)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="gal-layout">
        <div className="gal-grid">
          {items.map((it) => {
            const sel = selected && selected.key === it.key ? ' sel' : '';
            if (it.kind === 'article') {
              const a = it.article;
              return (
                <div
                  key={it.key}
                  className={'gcard' + sel}
                  draggable
                  onDragStart={(e) => startArticleDrag(e, a.rel)}
                  onClick={() => setPicked(it.key)}
                  onDoubleClick={() => ctx.openArticle(a.rel)}
                  onContextMenu={(e) => ctx.articleMenu(e, a)}
                  title="雙擊開啟編輯"
                >
                  <Thumb className="gcover" src={articleThumb(a, games)} title={a.meta.title} />
                  <div className="gcard-body">
                    <div className="gtitle ellipsis">
                      <Highlight text={a.meta.title} query={query} />
                    </div>
                    <div className="meta-line small">
                      <StatusPill status={a.meta.status} />
                      <span className="muted ellipsis">{a.meta.topic || '獨立文章'}</span>
                    </div>
                  </div>
                </div>
              );
            }
            const g = games[it.id];
            const wip = it.articles.filter((a) => a.meta.status !== '完成').length;
            return (
              <div
                key={it.key}
                className={'gcard' + sel}
                onClick={() => setPicked(it.key)}
                onDoubleClick={() => onOpenGame(it.id)}
                onContextMenu={(e) => ctx.gameMenu(e, it.id)}
                title="雙擊開啟詳細頁"
              >
                <Thumb className="gcover" src={gameCoverUrl(g)} title={g ? g.title : it.id} />
                <div className="gcard-body">
                  <div className="gtitle ellipsis">
                    <Highlight text={g ? g.title : it.id} query={query} />
                  </div>
                  <StatusBar articles={it.articles} />
                  <div className="muted small">
                    {it.articles.length} 篇{wip ? ` · ${wip} 篇撰寫中` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {selected &&
          (selected.kind === 'game' ? (
            <GamePanel id={selected.id} articles={selected.articles} ctx={ctx} query={query} onOpenGame={onOpenGame} />
          ) : (
            <ArticlePanel a={selected.article} ctx={ctx} />
          ))}
      </div>
    </div>
  );
}

function GamePanel({ id, articles, ctx, query, onOpenGame }) {
  const g = ctx.data.games[id];
  return (
    <aside className="gpanel">
      <div className="gpanel-head">
        <Thumb className="gpanel-cover" src={gameCoverUrl(g)} title={g ? g.title : id} />
        <div>
          <div className="gpanel-title">{g ? g.title : id}</div>
          <div className="muted small">
            {[g && g.developers && g.developers.join('、'), g && g.released && g.released.slice(0, 4), `${articles.length} 篇心得`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      </div>
      <div className="gpanel-list">
        {articles.map((a) => (
          <div key={a.rel} className="arow" {...articleProps(a, ctx)}>
            <div className="arow-main">
              <div className="ellipsis">
                <Highlight text={a.meta.title} query={query} />
              </div>
              <div className="muted small ellipsis">
                {shortDate(a.meta.updated || a.meta.created)}
                {a.meta.active_seconds > 0 && ` · ${fmtDuration(a.meta.active_seconds)}`}
                {a.meta.tags.length > 0 && ' · #' + a.meta.tags.join(' #')}
              </div>
            </div>
            <StatusPill status={a.meta.status} />
          </div>
        ))}
      </div>
      <div className="gpanel-actions">
        <button className="btn" onClick={() => ctx.createArticle({ works: [id], title: `${g ? g.title : id} 心得` })}>
          <Icon name="plus" size={16} />
          新增心得
        </button>
        <button className="btn ghost" onClick={() => onOpenGame(id)}>
          詳細頁
          <Icon name="external" size={14} />
        </button>
      </div>
    </aside>
  );
}

// 獨立文章（沒連結作品）的右側面板：摘要與基本資料
function ArticlePanel({ a, ctx }) {
  const thumb = articleThumb(a, ctx.data.games);
  return (
    <aside className="gpanel">
      {thumb && <img className="apanel-img" src={thumb} alt="" />}
      <div className="apanel-body">
        <div className="gpanel-title">{a.meta.title}</div>
        <div className="meta-line muted small">
          <StatusPill status={a.meta.status} />
          {a.meta.topic && <span>{a.meta.topic}</span>}
          <span>建立 {shortDate(a.meta.created)}</span>
          {a.meta.completed && <span>完工 {shortDate(a.meta.completed)}</span>}
          {a.meta.active_seconds > 0 && <span>{fmtDuration(a.meta.active_seconds)}</span>}
          {a.words > 0 && <span>{a.words.toLocaleString()} 字</span>}
        </div>
        <p className="apanel-excerpt">{a.excerpt || '（還沒有內文）'}</p>
        {a.meta.tags.length > 0 && (
          <div className="tags">
            {a.meta.tags.map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="gpanel-actions">
        <button className="btn primary" onClick={() => ctx.openArticle(a.rel)}>
          <Icon name="pen" size={16} />
          開啟編輯
        </button>
      </div>
    </aside>
  );
}
