import { useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { useImageInput } from '../lib/useImageInput.js';
import RematchDialog from './RematchDialog.jsx';
import { StatusPill } from './LibraryViews.jsx';
import { startArticleDrag } from './Sidebar.jsx';
import { shortDate, fmtDuration, articleThumb, gameCoverUrl, SOURCE_LABEL } from '../lib/util.js';

// 單一作品的詳細頁：上方橫幅、作品資訊，下面列出所有文章
export default function GamePage({ id, ctx, onBack }) {
  const [rematch, setRematch] = useState(false);
  const { games, articles } = ctx.data;
  const g = games[id] || { id, title: id };
  const list = articles
    .filter((a) => a.meta.works.includes(id))
    .sort((x, y) => (y.meta.updated || '').localeCompare(x.meta.updated || ''));
  const done = list.filter((a) => a.meta.status === '完成').length;
  const total = list.reduce((s, a) => s + a.meta.active_seconds, 0);
  const cover = gameCoverUrl(g);
  // 把圖片拖到橫幅上、或滑鼠停在橫幅上按 Ctrl+V，直接換成這部作品的封面
  const heroRef = useRef(null);
  const heroOver = useImageInput(heroRef, (files) => ctx.changeGameCover(id, files[0]), { multiple: false });

  return (
    <div className="game-page">
      <button className="btn ghost back" onClick={onBack}>
        <Icon name="back" size={16} />
        返回
      </button>

      <section ref={heroRef} className={'hero' + (heroOver ? ' drop-over' : '')}>
        {cover && <div className="hero-bg" style={{ backgroundImage: `url("${cover}")` }} />}
        <div className="hero-inner">
          {cover ? <img className="hero-cover" src={cover} alt="" /> : <div className="hero-cover thumb-empty" />}
          <div className="hero-info">
            <h1>{g.title}</h1>
            {(g.titleCn || g.romaji) && (g.titleCn || g.romaji) !== g.title && <div className="muted">{g.titleCn || g.romaji}</div>}
            <div className="hero-meta">
              {g.developers && g.developers.length > 0 && <span>{g.developers.join('、')}</span>}
              {g.released && <span>{g.released}</span>}
              {g.url && (
                <a href={g.url} target="_blank" rel="noreferrer">
                  {SOURCE_LABEL[g.source] || '來源'} {id}
                  <Icon name="external" size={13} />
                </a>
              )}
              {g.source === 'custom' && <span>自建作品</span>}
            </div>
            <div className="stats">
              <div>
                <b>{list.length}</b>
                <span>篇文章</span>
              </div>
              <div>
                <b>{done}</b>
                <span>已完成</span>
              </div>
              <div>
                <b>{fmtDuration(total)}</b>
                <span>總撰寫時間</span>
              </div>
            </div>
            <div className="row">
              <button className="btn primary" onClick={() => ctx.createArticle({ works: [id], title: g.title })}>
                <Icon name="plus" size={16} />
                為這部作品新增文章
              </button>
              <button className="btn" onClick={() => setRematch(true)} title="這部作品配錯時，重新搜尋並改連到正確的作品">
                <Icon name="link" size={16} />
                重新配對
              </button>
              <button className="btn" onClick={() => ctx.changeGameCover(id)}>
                <Icon name="image" size={16} />
                更換封面
              </button>
              {g.customCover && (
                <button className="btn ghost" onClick={() => ctx.resetGameCover(id)} title={g.cover ? '改回從資料庫抓下來的封面' : '移除自訂封面'}>
                  <Icon name="undo" size={16} />
                  還原封面
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="game-articles">
        {list.map((a) => (
          <div
            key={a.rel}
            className="game-row"
            draggable
            onDragStart={(e) => startArticleDrag(e, a.rel)}
            onClick={() => ctx.openArticle(a.rel)}
            onContextMenu={(e) => ctx.articleMenu(e, a)}
          >
            {/* 只有文章自己有圖才顯示縮圖；作品封面在上方已經有了 */}
            {articleThumb(a, {}) && <img className="game-row-img" src={articleThumb(a, {})} alt="" />}
            <div className="arow-main">
              <h3 className="ellipsis">{a.meta.title}</h3>
              <p className="muted small clamp2">{a.excerpt || '（還沒有內文）'}</p>
              <div className="muted small">
                建立 {shortDate(a.meta.created)}
                {a.meta.completed && ` · 完工 ${shortDate(a.meta.completed)}`}
                {a.meta.active_seconds > 0 && ` · ${fmtDuration(a.meta.active_seconds)}`}
                {a.meta.tags.length > 0 && ' · #' + a.meta.tags.join(' #')}
              </div>
            </div>
            <StatusPill status={a.meta.status} />
          </div>
        ))}
      </section>

      {rematch && (
        <RematchDialog
          game={g}
          articles={list}
          notify={ctx.notify}
          onClose={() => setRematch(false)}
          onDone={async (newId) => {
            setRematch(false);
            await ctx.reload();
            ctx.openGame(newId);
          }}
        />
      )}
    </div>
  );
}
