import {useEffect, useRef, useState} from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import {DOWNLOAD_URL, RELEASES_URL, VERSION, SIZE_TEXT} from '../constants';
import styles from './index.module.css';

// 開場的對話框輪流說的台詞（像視覺小說一樣一個字一個字出來，點一下直接顯示整句）
const LINES = [
  '玩過的每一部作品，都該有屬於它的文章。',
  '截圖裡的那句台詞，丟進來就變成文字。',
  '一篇文章，隨處分享。',
  '而你的文字，永遠是資料夾裡的 Markdown。',
];

// 軟體特色：只寫 MakoNote 真的做得到的事
const FEATURES = [
  {
    topic: '作品是文章、也是展示牆',
    body: '以作品為中心。連結 VNDB、Bangumi，封面、品牌、發售日自動帶入，一部作品的所有文章集中在作品頁。',
  },
  {
    topic: '作品語錄隨時引用',
    body: '丟進截圖，本機 OCR 辨識，依順序合併；遊戲介面字（SAVE、AUTO、SKIP…）自動拿掉。',
  },
  {
    topic: '一篇文章，隨處分享',
    body: '同一篇主稿直接轉成巴哈 BBCode、FB、串文、Google 文件、Markdown，邊看預覽邊微調。',
  },
  {
    topic: '智能分段，掌握你的寫作習慣',
    body: '用句號判斷一段話說完沒。沒說完只換行；切碎的文字塊一鍵併回去。',
  },
  {
    topic: '記錄下你的每份努力',
    body: '只算視窗在前景、而且真的在打字的時間；作品頁看得到總撰寫時間。',
  },
  {
    topic: '文章資料，通用、直覺、方便轉移',
    body: '一篇一個資料夾、內文是 Markdown、圖片在旁邊。不開 MakoNote，記事本也打得開。',
  },
];

// 功能章節（文字放在圖片外面，圖片完整顯示不裁切）
const CHAPTERS = [
  {
    no: '01',
    kicker: '作品',
    title: '以作品為中心',
    body: 'Galgame、動畫、部落格三種檢視，文章依作品自動歸類。點進作品頁，這部作品所有的文章、完成數、總共花了多少時間，一眼看完。',
    points: ['VNDB／Bangumi 自動帶入封面與資料', '批次配對作品，配錯可以重新配對', 'Ctrl + K 模糊搜尋整個文章庫'],
    shot: 'shelf',
    alt: 'MakoNote 的作品牆：用封面展示每一部作品',
    link: '/docs/works',
  },
  {
    no: '02',
    kicker: '寫作',
    title: '專心寫，不被格式打斷',
    body: '方塊編輯器，輸入 / 就能插入標題、摺疊清單、提示框、時數統計表。背景是這部作品的封面，跟著文章一起捲動；版面面板邊寫邊調。',
    points: ['智能分段：沒有句號就不切段', '圖片自動併排、圖文並排、拖曳調整大小', 'YouTube、bilibili 直接內嵌'],
    shot: 'editor',
    alt: 'MakoNote 的編輯器',
    link: '/docs/writing',
  },
  {
    no: '03',
    kicker: '台詞',
    title: '截圖裡的台詞，丟進來就是文字',
    body: '一次丟多張截圖，用 Windows 內建 OCR 在本機辨識，依順序接起來，以引用插入。內建的排除表來自 26 款 galgame 的截圖，會把遊戲介面的字自動拿掉。',
    points: ['截圖不上傳，全部在本機完成', '日文、繁體中文、英文', '可加自己的忽略字詞（例如角色名牌）'],
    shot: 'ocr',
    alt: '插入遊戲台詞的辨識視窗',
    link: '/docs/ocr',
  },
  {
    no: '04',
    kicker: '發佈',
    title: '寫一次，五個平台一起發',
    body: '巴哈 BBCode 左邊原始碼、右邊預覽，圖片可以設大中小、相鄰兩張併排。FB 依〔圖1〕〔圖2〕排好順序，串文依字數自動拆則。只在你修改時才另存版本，主稿不會被動到。',
    points: ['巴哈、FB、串文、Google 文件、Markdown', '圖片一鍵換成 Cloudinary 雲端網址', '主稿更新時提醒你同步'],
    shot: 'baha',
    alt: '巴哈格式預覽',
    link: '/docs/publish',
  },
];

// 更多畫面：說明寫在圖片下面，不蓋在圖上
const GALLERY = [
  {shot: 'game', title: '作品頁', body: '一部作品的所有文章、完成數與總撰寫時間；拖一張圖到橫幅上就換封面。'},
  {shot: 'slash', title: '斜線選單', body: '輸入 / 叫出方塊，最上面就是插入遊戲台詞與時數統計表。'},
  {shot: 'smart', title: '智能分段與版面面板', body: '句尾符號自訂、一鍵整理；字型、行距、背景在右邊即時調整。'},
  {shot: 'editor-top', title: '作品封面當背景', body: '編輯頁的背景是這部作品的封面，跟著文章一起捲動。'},
];

const DETAILS = [
  {title: '撰寫時間', body: '只算真的在寫的時間，完工後自動暫停。'},
  {title: '智能分段', body: '句尾符號可以自訂，Enter、貼上、整理都適用。'},
  {title: '圖文並排', body: '拖到段落旁邊就並排，分隔線吸附對齊。'},
  {title: '段落連結', body: '連結到文中的某一段，點了直接捲過去。'},
  {title: '動態收藏', body: '把篩選條件存起來，新文章自動加入。'},
  {title: '巴哈備份', body: '直接讀巴哈小屋爬蟲備份，還原原文排版。'},
  {title: '小貼圖', body: '角落隨機一張貼圖，蓋到內容就自己躲開。'},
  {title: '整體縮放', body: 'Ctrl + 滾輪，版面與字體一起等比例縮放。'},
];

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add(styles.shown));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add(styles.shown);
            io.unobserve(e.target);
          }
        }
      },
      {rootMargin: '0px 0px -8% 0px'},
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// 中文標題只在逗號後面換行，不會把「不被格式打斷」拆成兩半
function Phrase({text}) {
  const parts = text.split('，');
  return parts.map((p, i) => (
    <span key={i} className={styles.nowrap}>
      {p}
      {i < parts.length - 1 ? '，' : ''}
    </span>
  ));
}

// 視覺小說式的對話框：逐字顯示，點一下顯示整句，再點換下一句
function Dialogue() {
  const [line, setLine] = useState(0);
  const [shown, setShown] = useState(0);
  const timer = useRef(null);
  const text = LINES[line];
  const done = shown >= text.length;

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(text.length);
      return undefined;
    }
    if (done) {
      timer.current = setTimeout(() => next(), 2600);
      return () => clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setShown((n) => n + 1), 70);
    return () => clearTimeout(timer.current);
  });

  function next() {
    setLine((l) => (l + 1) % LINES.length);
    setShown(0);
  }

  return (
    <button type="button" className={styles.dialogue} onClick={() => (done ? next() : setShown(text.length))} aria-label="下一句">
      <span className={styles.nameplate}>MakoNote</span>
      <span className={styles.dialogueText} aria-live="polite">
        「{text.slice(0, shown)}
        {done ? '」' : <span className={styles.ghost}>{text.slice(shown)}」</span>}
      </span>
      <span className={styles.vnButtons} aria-hidden="true">
        <i>AUTO</i>
        <i>SKIP</i>
        <i>LOG</i>
      </span>
      <span className={`${styles.cursor} ${done ? styles.cursorOn : ''}`} aria-hidden="true">
        ▼
      </span>
    </button>
  );
}

function Shot({name, alt, priority}) {
  const src = useBaseUrl(`/img/shots/${name}.webp`);
  return (
    <figure className={styles.frame}>
      <div className={styles.frameBar} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <img src={src} alt={alt} width="2160" height="1353" loading={priority ? 'eager' : 'lazy'} decoding="async" />
    </figure>
  );
}

function Hero() {
  const logo = useBaseUrl('/img/logo.png');
  return (
    <header className={styles.hero}>
      <div className={styles.heroGlow} aria-hidden="true" />
      <div className={styles.heroInner}>
        <p className={styles.eyebrow}>
          <img src={logo} alt="" width="22" height="22" />
          Galgame・動畫・作品
        </p>
        <h1 className={styles.heroTitle}>
          以作品為中心，
          <br />
          整理你寫過的每一篇文章。
        </h1>
        <p className={styles.heroLead}>
          專為 Galgame 與動畫愛好者設計的筆記軟體。
          <br />
          以作品為中心的文章管理與展示系統。
        </p>
        <Dialogue />
        <div className={styles.ctas}>
          <Link className={styles.primary} href={DOWNLOAD_URL}>
            下載 exe（Windows）
          </Link>
          <Link className={styles.secondary} to="/docs/">
            閱讀使用說明
          </Link>
        </div>
        <p className={styles.meta}>
          版本 {VERSION}・{SIZE_TEXT}・Windows 10／11・免安裝單一 exe
        </p>
      </div>
      <div className={styles.heroShot} data-reveal>
        <Shot name="shelf" alt="MakoNote 的作品牆：用封面展示每一部作品" priority />
      </div>
    </header>
  );
}

function Features() {
  return (
    <section id="highlights" className={styles.section}>
      <div className={styles.sectionHead} data-reveal>
        <p className={styles.kicker}>軟體特色</p>
        <h2 className={styles.h2}>
          <Phrase text="以作品為中心，管理與展示你的文章。" />
        </h2>
      </div>
      <div className={styles.compare} role="table" aria-label="MakoNote 的軟體特色" data-reveal>
        <div className={`${styles.compareRow} ${styles.compareHead}`} role="row">
          <span role="columnheader">項目</span>
          <span role="columnheader">說明</span>
        </div>
        {FEATURES.map((c) => (
          <div key={c.topic} className={styles.compareRow} role="row">
            <span className={styles.compareTopic} role="rowheader">
              {c.topic}
            </span>
            <span className={styles.mako} role="cell">
              {c.body}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Chapters() {
  return (
    <section id="features" className={styles.chapters}>
      {CHAPTERS.map((c, i) => (
        <article key={c.no} className={`${styles.chapter} ${i % 2 ? styles.flip : ''}`}>
          <div className={styles.chapterText} data-reveal>
            <p className={styles.route}>
              <span>Route {c.no}</span>
              {c.kicker}
            </p>
            <h2 className={styles.h2}>
              <Phrase text={c.title} />
            </h2>
            <p className={styles.lead}>{c.body}</p>
            <ul className={styles.points}>
              {c.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <Link className={styles.more} to={c.link}>
              了解更多
            </Link>
          </div>
          <div className={styles.chapterShot} data-reveal>
            <Shot name={c.shot} alt={c.alt} />
          </div>
        </article>
      ))}
    </section>
  );
}

function Gallery() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead} data-reveal>
        <p className={styles.kicker}>更多畫面</p>
        <h2 className={styles.h2}>
          <Phrase text="每個畫面，都圍繞著作品。" />
        </h2>
      </div>
      <div className={styles.gallery}>
        {GALLERY.map((g) => (
          <figure key={g.shot} className={styles.galleryItem} data-reveal>
            <Shot name={g.shot} alt={g.title} />
            <figcaption>
              <b>{g.title}</b>
              {g.body}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function Files() {
  return (
    <section className={styles.section}>
      <div className={styles.filesGrid}>
        <div data-reveal>
          <p className={styles.kicker}>你的資料</p>
          <h2 className={styles.h2}>資料夾就是資料庫。</h2>
          <p className={styles.lead}>
            沒有私有格式。一篇文章一個資料夾，內文是 Markdown，圖片放在旁邊。只是打開來看的文章，一個字都不會被改寫；換電腦，把資料夾複製過去就好。
          </p>
          <Link className={styles.more} to="/docs/files">
            看檔案格式
          </Link>
        </div>
        <pre className={styles.tree} data-reveal aria-label="文章庫的資料夾結構">
          <span className={styles.dim}>我的文章/</span>
          {'\n'}├─ galgame文章/
          {'\n'}│  └─ 純白交響曲/
          {'\n'}│     ├─ <b>ai-li.md</b>
          <span className={styles.dim}>        內文與屬性</span>
          {'\n'}│     └─ assets/<span className={styles.dim}>          圖片</span>
          {'\n'}├─ 動畫推薦與文章/
          {'\n'}├─ _works/<span className={styles.dim}>               作品資料與封面</span>
          {'\n'}└─ .app/<span className={styles.dim}>                 設定與主題</span>
        </pre>
      </div>
    </section>
  );
}

function Details() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead} data-reveal>
        <p className={styles.kicker}>小地方</p>
        <h2 className={styles.h2}>
          <Phrase text="為了寫文章，想到的那些小事。" />
        </h2>
      </div>
      <ul className={styles.details}>
        {DETAILS.map((d) => (
          <li key={d.title} data-reveal>
            <h3>{d.title}</h3>
            <p>{d.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Download() {
  const logo = useBaseUrl('/img/logo.png');
  return (
    <section className={styles.download} data-reveal>
      <img src={logo} alt="" width="72" height="72" />
      <h2 className={styles.h2}>開始整理你的作品。</h2>
      <p className={styles.lead}>免安裝，下載後直接執行。選一個資料夾，就能開始寫。</p>
      <div className={styles.ctas}>
        <Link className={styles.primary} href={DOWNLOAD_URL}>
          下載 exe（Windows）
        </Link>
        <Link className={styles.secondary} to="/docs/">
          快速開始
        </Link>
      </div>
      <p className={styles.meta}>
        版本 {VERSION}・{SIZE_TEXT}・<Link href={RELEASES_URL}>所有版本與更新紀錄</Link>
      </p>
    </section>
  );
}

export default function Home() {
  useReveal();
  return (
    <Layout title="專為 Galgame 與動畫愛好者設計的筆記軟體" description="以作品為中心管理與展示文章，截圖台詞一鍵成文，一篇文章直接輸出巴哈、FB、串文，內容永遠是你資料夾裡的 Markdown。">
      <main className={styles.page}>
        <Hero />
        <Features />
        <Chapters />
        <Gallery />
        <Files />
        <Details />
        <Download />
      </main>
    </Layout>
  );
}
