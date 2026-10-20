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
| `/` | Ус бүртгэх |
| `/overview.html` | Өдрийн тойм: савандаа үлдсэн ус, зорилт, 7 хоногийн график |
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

- [Ус бүртгэх хэсэг](docs/entry.md)
- [Тохиргоо ба нөөц](docs/settings.md)
- [Утсанд суулгах (PWA)](docs/pwa.md)
- [Backend API](backend/README.md)
