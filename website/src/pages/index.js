import {useEffect, useRef, useState} from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import {DOWNLOAD_URL} from '../constants';
import styles from './index.module.css';

// 開場的對話框輪流說的台詞（像視覺小說一樣一個字一個字出來，點一下直接顯示整句）
const LINES = [
  '玩過的每一部作品，都該有自己的書架。',
  '截圖裡的那句台詞，丟進來就變成文字。',
  '寫一次心得，巴哈、FB、串文一起發。',
  '而你的文字，永遠是資料夾裡的 Markdown。',
];

// 和一般筆記軟體的差別：只寫 MakoNote 真的做得到的事
const COMPARE = [
  {
    topic: '整理方式',
    usual: '作品只是一個標籤，封面要自己找、自己貼。',
    mako: '作品就是書架。連結 VNDB、Bangumi，封面、品牌、發售日自動帶入，一部作品的所有心得放在一起。',
  },
  {
    topic: '引用台詞',
    usual: '對著截圖一個字一個字打。',
    mako: '丟進截圖，本機 OCR 辨識，依順序合併；遊戲介面字（SAVE、AUTO、SKIP…）自動拿掉。',
  },
  {
    topic: '發佈',
    usual: '每個平台各排一次版，圖片一張張重傳。',
    mako: '同一篇主稿直接轉成巴哈 BBCode、FB、串文、Google 文件、Markdown，邊看預覽邊微調。',
  },
  {
    topic: '分段',
    usual: '按 Enter 就切段，貼上一段文字被切成碎片。',
    mako: '用句號判斷一段話說完沒。沒說完只換行；切碎的文字塊一鍵併回去。',
  },
  {
    topic: '寫了多久',
    usual: '不知道。',
    mako: '只算視窗在前景、而且真的在打字的時間；作品頁看得到總撰寫時間。',
  },
  {
    topic: '資料在哪',
    usual: '鎖在 App 的資料庫或雲端帳號裡。',
    mako: '一篇一個資料夾、內文是 Markdown、圖片在旁邊。不開 MakoNote，記事本也打得開。',
  },
];

// 功能章節（文字放在圖片外面，圖片完整顯示不裁切）
const CHAPTERS = [
  {
    no: '01',
    kicker: '書架',
    title: '作品就是書架',
    body: 'Galgame、動畫、部落格三種書架，依主題與作品自動歸類。點進作品頁，這部作品寫過的每一篇心得、總共花了多少時間，一眼看完。',
    points: ['VNDB／Bangumi 自動帶入封面與資料', '批次配對作品，配錯可以重新配對', 'Ctrl + K 模糊搜尋整個文章庫'],
    shot: 'shelf',
    alt: 'MakoNote 的 Galgame 書架',
    link: '/docs/shelf',
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
  {shot: 'game', title: '作品頁', body: '一部作品的所有心得、完成數與總撰寫時間；拖一張圖到橫幅上就換封面。'},
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
          Galgame・動畫・心得
        </p>
        <h1 className={styles.heroTitle}>
          為每一部作品，
          <br />
          留一座書架。
        </h1>
        <p className={styles.heroLead}>MakoNote 是專為 Galgame 與動畫愛好者設計的筆記軟體。</p>
        <Dialogue />
        <div className={styles.ctas}>
          <Link className={styles.primary} href={DOWNLOAD_URL}>
            下載 Windows 版
          </Link>
          <Link className={styles.secondary} to="/docs/">
            閱讀使用說明
          </Link>
        </div>
        <p className={styles.meta}>Windows 10／11・免安裝單一 exe・不需要帳號</p>
      </div>
      <div className={styles.heroShot} data-reveal>
        <Shot name="shelf" alt="MakoNote 的 Galgame 書架：作品封面排成書架" priority />
      </div>
    </header>
  );
}

function Compare() {
  return (
    <section id="different" className={styles.section}>
      <div className={styles.sectionHead} data-reveal>
        <p className={styles.kicker}>有什麼不同</p>
        <h2 className={styles.h2}>
          <Phrase text="不是又一個筆記軟體。" />
        </h2>
        <p className={styles.lead}>一般筆記軟體把心得當成一份文件；MakoNote 把它當成你和一部作品之間的紀錄。</p>
      </div>
      <div className={styles.compare} role="table" aria-label="一般筆記軟體與 MakoNote 的比較" data-reveal>
        <div className={`${styles.compareRow} ${styles.compareHead}`} role="row">
          <span role="columnheader" />
          <span role="columnheader">一般筆記軟體</span>
          <span role="columnheader">MakoNote</span>
        </div>
        {COMPARE.map((c) => (
          <div key={c.topic} className={styles.compareRow} role="row">
            <span className={styles.compareTopic} role="rowheader">
              {c.topic}
            </span>
            <span className={styles.usual} role="cell">
              {c.usual}
            </span>
            <span className={styles.mako} role="cell">
              {c.mako}
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
          <Phrase text="每個畫面，都是為了寫心得。" />
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
            沒有私有格式、沒有帳號。一篇心得一個資料夾，內文是 Markdown，圖片放在旁邊。只是打開來看的文章，一個字都不會被改寫；換電腦，把資料夾複製過去就好。
          </p>
          <Link className={styles.more} to="/docs/files">
            看檔案格式
          </Link>
        </div>
        <pre className={styles.tree} data-reveal aria-label="文章庫的資料夾結構">
          <span className={styles.dim}>我的心得/</span>
          {'\n'}├─ galgame心得/
          {'\n'}│  └─ 純白交響曲/
          {'\n'}│     ├─ <b>ai-li.md</b>
          <span className={styles.dim}>        內文與屬性</span>
          {'\n'}│     └─ assets/<span className={styles.dim}>          圖片</span>
          {'\n'}├─ 動畫推薦與心得/
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
          <Phrase text="為了寫心得，想到的那些小事。" />
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
      <h2 className={styles.h2}>開始整理你的書架。</h2>
      <p className={styles.lead}>免安裝，下載後直接執行。選一個資料夾，就能開始寫。</p>
      <div className={styles.ctas}>
        <Link className={styles.primary} href={DOWNLOAD_URL}>
          下載 Windows 版
        </Link>
        <Link className={styles.secondary} to="/docs/">
          快速開始
        </Link>
      </div>
    </section>
  );
}

export default function Home() {
  useReveal();
  return (
    <Layout title="專為 Galgame 與動畫愛好者設計的筆記軟體" description="作品就是書架、截圖台詞一鍵成文、一篇心得直接輸出巴哈、FB、串文，文章永遠是你資料夾裡的 Markdown。">
      <main className={styles.page}>
        <Hero />
        <Compare />
        <Chapters />
        <Gallery />
        <Files />
        <Details />
        <Download />
      </main>
    </Layout>
  );
}
