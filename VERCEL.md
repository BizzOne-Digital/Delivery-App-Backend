# Deploy backend on Vercel

## Required project settings

| Setting | Value |
|---------|--------|
| Framework Preset | **Other** |
| Root Directory | `.` (repo root) |
| Build Command | `npm run build` |
| **Output Directory** | **Override OFF** (blank), or leave as **`public`** / **`A`** — `vercel-build` creates both folders so mis-typed `N/A` → `A` no longer breaks the build. |

API entry: **`api/index.js`** (serverless). Local dev: `npm run dev` or `npm run build && npm start` (`server.js`).

If **Output Directory** is `dist`, or an old `api/index` handler is deployed, you may see:

`Invalid export found in module "/var/task/app.js"`

## Environment variables

Set `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=production`, `CLIENT_URL`, `UPLOAD_BASE_URL`.

## After deploy

- `https://YOUR-PROJECT.vercel.app/` — static info page
- `https://YOUR-PROJECT.vercel.app/api/v1/health` — should return JSON (`db: connected` if Mongo works)

If health shows `db: disconnected` or login/API fails with 500/504, open **MongoDB Atlas → Network Access** and allow access from anywhere (`0.0.0.0/0`) or add Vercel’s IPs. Confirm `MONGODB_URI` in Vercel env matches Atlas (user + password URL-encoded).
