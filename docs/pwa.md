# Утсанд суулгах (PWA)

Deploy хийсэн хаягийг утсаараа нээгээд суулгана: Android Chrome — «Апп суулгах», iPhone Safari — Хуваалцах → «Нүүр дэлгэцэнд нэмэх». Нэг удаа нээсний дараа интернэтгүй ч гурван хуудас бүгд ажиллана.

- `public/manifest.webmanifest` — нэр, өнгө, icon, товчлолууд
- `public/sw.js` — офлайн cache: хуудас нь эхлээд сүлжээнээс, `assets/` нь cache-аас
- `src/pwa.ts` — service worker-ийг зөвхөн `bun run build`-ийн хувилбарт бүртгэнэ (`bun run dev`-д идэвхгүй)
- Icon-ууд `public/drop.svg`-ээс үүссэн (`icon-192/512`, `icon-maskable-512`, `apple-touch-icon`)

Шинэ хуудас нэмбэл `public/sw.js`-ийн `PAGES` жагсаалтад нэмж, entry файлдаа `import './pwa';` бичнэ.
