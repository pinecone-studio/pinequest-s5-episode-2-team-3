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
| GET | `/api/devices` | Сав бүрийн сүүлчийн хэмжилт; нууц түлхүүр буцаахгүй |
| POST | `/api/devices/:id/events` | Bearer түлхүүртэй, суурийн тоолсон уулт; давхардалгүй — [заавар](../docs/device-ingestion.md) |
| POST | `/api/devices/:id/readings` | Bearer түлхүүртэй суурийн төлөв (уулт үүсгэхгүй), 4096 byte хүртэл |
| GET / POST | `/api/sync` | Хувилбар шалгасан, давхардалгүй аппын синк — [дүрэм](../docs/app-sync.md) |
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

Аппын синк `0004_app_sync.sql` migration шаардана. `0005_device_readings.sql` нь төхөөрөмжийн төлөв, хэмжилтийн receipt нэмнэ. `DEVICE_TOKENS` secret-ээр суурийн илгээх эрхийг шалгана. Firmware: [`firmware/`](../firmware/README.md). Аппын API нэг хэрэглэгчийнх бөгөөд нэвтрэлтгүй хэвээр байна.

3-р ажлын холболт, түлхүүр, локал ажиллуулах ба rollback: [device ingestion](../docs/device-ingestion.md).
