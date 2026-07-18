# マンガ棚

漫画シリーズごとに「次に読む巻」「所持巻」「完結までの残り巻数」を確認する、スマホ中心の個人用PWAです。

## 開発

```bash
npm install
npm run dev
npm test
npm run build
```

保存先はブラウザの `localStorage`（キー: `yuki-manga-shelf-data`）です。初期データや添付画像は個人情報としてリポジトリに含めません。

GitHub Pages の公開先は `https://kirokubox.github.io/manga-shelf/`、Vite の base は `/manga-shelf/` です。

