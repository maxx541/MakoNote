// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

import {DOWNLOAD_URL} from './src/constants.js';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'MakoNote',
  tagline: '專為 Galgame 與動畫愛好者設計的筆記軟體',
  favicon: 'img/favicon.png',

  future: {
    v4: true,
  },

  url: 'https://maxx541.github.io',
  baseUrl: '/MakoNote/',
  organizationName: 'maxx541',
  projectName: 'MakoNote',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'ignore', // 首頁的 #different、#features 是區塊的 id，不是標題，檢查器認不得

  i18n: {
    defaultLocale: 'zh-Hant',
    locales: ['zh-Hant'],
  },

  headTags: [
    {tagName: 'meta', attributes: {name: 'author', content: '資訊老師黃博胤'}},
    {tagName: 'link', attributes: {rel: 'preconnect', href: 'https://fonts.googleapis.com'}},
    {tagName: 'link', attributes: {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous'}},
    {
      tagName: 'link',
      attributes: {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@600;900&display=swap',
      },
    },
  ],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          routeBasePath: 'docs',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/shots/shelf.webp',
      metadata: [
        {name: 'description', content: 'MakoNote：專為 Galgame 與動畫愛好者設計的筆記軟體。以作品為中心管理與展示文章，截圖台詞一鍵成文，一篇文章直接輸出巴哈、FB、串文，內容永遠是你資料夾裡的 Markdown。'},
      ],
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: true,
        respectPrefersColorScheme: false,
      },
      navbar: {
        title: 'MakoNote',
        logo: {
          alt: 'MakoNote',
          src: 'img/logo.png',
        },
        items: [
          {to: '/#highlights', label: '軟體特色', position: 'left', activeBaseRegex: '^$'},
          {to: '/#features', label: '功能', position: 'left', activeBaseRegex: '^$'},
          {type: 'docSidebar', sidebarId: 'guide', position: 'left', label: '使用說明'},
          {href: DOWNLOAD_URL, label: '下載 exe', position: 'right', className: 'navbar-download'},
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: '使用說明',
            items: [
              {label: '快速開始', to: '/docs/'},
              {label: '寫作與編輯器', to: '/docs/writing'},
              {label: '遊戲台詞辨識', to: '/docs/ocr'},
            ],
          },
          {
            title: '更多',
            items: [
              {label: '發佈到各平台', to: '/docs/publish'},
              {label: '檔案格式', to: '/docs/files'},
              {label: '常見問題', to: '/docs/faq'},
            ],
          },
        ],
        copyright: `MakoNote · 專為 Galgame 與動畫愛好者設計的筆記軟體`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
