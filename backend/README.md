# Дусал — backend (Cloudflare Workers + D1)

## Ажиллуулах

```sh
cd backend
npm install
npx wrangler login
npm run db:migrate:local
npm run dev                    # http://localhost:8787
```

Deploy хийх: `npm run db:migrate:remote && npm run deploy`.

## API

| Method | Зам | Тайлбар |
| --- | --- | --- |
| GET | `/api/health` | `{ ok: true }` |

Одоогоор нэвтрэлт (auth) байхгүй, нэг хэрэглэгчийнх.
