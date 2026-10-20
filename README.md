# Дусал — ухаалаг усны сав

Хэдий хэр ус уусныг тань тоолж, цагт нь сануулдаг ухаалаг савны вэб апп.

**Сайт:** https://dusal.bbek3201.workers.dev

## Ажиллуулах

[Node.js](https://nodejs.org) 20 эсвэл түүнээс шинэ хувилбар хэрэгтэй.

```sh
npm install
npm run dev
```

Дараа нь браузераар http://127.0.0.1:5173 хаягийг нээнэ.

Хэрэв `bun` суусан бол `bun install`, `bun run dev` гэж ажиллуулж болно.

## Хуудсууд

| Хаяг | Юу хийх вэ |
| --- | --- |
| `/` | Нүүр: суурин дээрх сав, ус нэмэх, өдрийн хэмжээ (тооцоолох, эмчийн заавар, AI), 7 хоногийн график |
| `/entries.html` | Бүх бүртгэл |
| `/history.html` | Түүх: шүүх, CSV татах |
| `/settings.html` | Өдрийн зорилт, нөөц хадгалах/сэргээх |

Өгөгдөл браузерын `localStorage`-д хадгалагдана. Сервер, бүртгэл шаардахгүй.

## Deploy хийх

```sh
npx wrangler login     # зөвхөн анх удаа
npm run deploy         # вэб
```

API-г deploy хийх: [`backend/README.md`](backend/README.md).

## Дэлгэрэнгүй

Шинэ хуудас нэмбэл `public/sw.js`-ийн `PAGES` жагсаалтад нэмж, entry файлдаа `import './pwa';` бичнэ.

## Native app (Capacitor)

`android/`, `ios/` нь ижил вэб кодыг (`dist`) ачаалдаг native төслүүд. Вэб код өөрчлөгдөхөд энэ хоёрыг гараар засах шаардлагагүй — `bun run cap:sync` хангалттай.

```sh
bun run android   # build → sync → Android Studio нээнэ
bun run ios       # build → sync → Xcode нээнэ (зөвхөн Mac)
```

Шаардлага: Android — Android Studio (JDK дотроо), iOS — Xcode 16+. iOS нь CocoaPods биш Swift Package Manager ашигладаг тул `pod install` хэрэггүй.

- `capacitor.config.ts` — app ID `mn.pinecone.dusal`, нэр «Дусал»
- `assets/` — icon, splash-ийн эх зураг. Солих бол `npx @capacitor/assets generate` ажиллуулна
- Service worker native app дотор бүртгэгдэхгүй (`src/pwa.ts`), файлууд app дотор багтсан
- Шинэ HTML хуудас нэмбэл `vite.config.js`-д нэмэхэд л app-д орно
- [Ус бүртгэх хэсэг](docs/entry.md)
- [Тохиргоо ба нөөц](docs/settings.md)
- [AI зөвлөгөө ба түлхүүр](docs/ai.md)
- [Утсанд суулгах (PWA)](docs/pwa.md)
- [Backend API](backend/README.md)
