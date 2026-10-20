# Дусал — backend (Cloudflare Workers + D1)

## Ажиллуулах

```sh
cd backend
npm install
npx wrangler login
npm run db:migrate:local
npm run dev                    # http://localhost:8787
```

Deploy хийх: `npm run db:migrate:remote && npm run deploy` (тохиргоо: `wrangler.jsonc`).

## API

| Method | Зам | Тайлбар |
| --- | --- | --- |
| GET | `/api/health` | `{ ok: true, ai, contractVersion: 1 }` |
| GET / PUT | `/api/settings` | `{ goal: 50–10000, mode: "goal" \| "limit" }` |
| GET | `/api/state` | `{ goal, mode, events }` — вэбийн `dusal-v1` бүтэцтэй ижил |
| GET | `/api/events?from=&to=` | ISO огноогоор шүүнэ, шинэ нь эхэндээ |
| POST | `/api/events` | `{ id?, amount: 1–5000, type: "drink" \| "spill" \| "pending", at, deviceId? }` |
| PATCH | `/api/events/:id` | `amount`, `type`, `at`-ын аль нэгийг өөрчилнө |
| DELETE | `/api/events/:id` | 204 буцаана |

Одоогоор нэвтрэлт (auth) байхгүй, нэг хэрэглэгчийнх.

## Нэгдсэн өгөгдлийн дүрэм

Апп болон backend нь `shared/contracts.ts`-ийн нэг validator ашиглана. Дэлгэрэнгүй: [төхөөрөмжийн өгөгдлийн дүрэм](../docs/device-contract.md).

`0003_event_identity.sql` migration-ийг шинэ Worker-оос өмнө ажиллуулна. Шинэ POST нь 201, ижил анхны payload-тай retry нь 200, өөр payload-тай ижил ID нь 409. Устгасан бүртгэлийн ижил retry 204 буцааж, дахин үүсгэхгүй. `deviceId`-тай хүсэлт тогтмол `id` заавал явуулна. `PATCH` нь `deviceId`-г өөрчлөхгүй.

Төхөөрөмжийн authentication, хэмжилт авах endpoint, аппын бүрэн синк дараагийн шатанд хийгдэнэ. Одоогийн API нэг хэрэглэгчийнх бөгөөд нэвтрэлтгүй хэвээр байна.
