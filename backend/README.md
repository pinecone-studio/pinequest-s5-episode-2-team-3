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
| GET / PUT | `/api/settings` | `{ goal: 50–10000, mode: "goal" \| "limit" }` |
| GET | `/api/state` | `{ goal, mode, events }` — вэбийн `dusal-v1` бүтэцтэй ижил |
| GET | `/api/events?from=&to=` | ISO огноогоор шүүнэ, шинэ нь эхэндээ |
| POST | `/api/events` | `{ id?, amount: 1–5000, type: "drink" \| "spill" \| "pending", at }` |

Одоогоор нэвтрэлт (auth) байхгүй, нэг хэрэглэгчийнх.
