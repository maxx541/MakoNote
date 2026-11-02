---
title: 檔案格式
sidebar_position: 8
---

# 檔案格式

MakoNote 不用資料庫。資料夾就是資料庫，每篇心得都是普通的 Markdown。

```text
我的心得/
├─ galgame心得/
│  └─ 純白交響曲/
│     ├─ ai-li.md          ← 內文與屬性
│     └─ assets/           ← 圖片
├─ _works/                 ← 作品資料與封面（VNDB、Bangumi）
└─ .app/                   ← 設定、背景圖、主題
```

文章開頭是一般的 front matter：

```markdown
---
title: 愛理
status: 撰寫中
topic: galgame心得
tags: [心得, 純白交響曲]
works: [v1552]
created: 2026-10-28 21:04
active_seconds: 780
---
```

MakoNote 自己的方塊也盡量用其他軟體看得懂的寫法：

| 方塊 | 存成 |
|---|---|
| 併排圖片 | 同一行連續的圖片：`![](a.webp) ![](b.webp)` |
| 圖文並排 | `文字… ![](a.webp "side=right;w=0.4")` |
| 內嵌影片 | 連結加註解：`[YouTube 影片](https://…) <!-- makonote:video {} -->` |
| 提示框 | GitHub／Obsidian 的 `> [!NOTE]` |
| 摺疊清單 | `<details><summary>…</summary>…</details>` |

只是打開來看的文章，一個字都不會被改寫；真的在 MakoNote 裡修改才會存檔。刪掉 `.app/` 和 `_works/` 也不會影響任何文章。
