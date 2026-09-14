# Deploy backend on Vercel

## Required project settings

| Setting | Value |
|---------|--------|
| Framework Preset | **Other** |
| Root Directory | `.` (repo root) |
| Build Command | `npm run build` |
| **Output Directory** | **leave empty** — do **not** set `dist` |

Entry file: **`server.js`** at repo root (calls `server.listen()`). Do **not** use an `api/` folder or Output Directory `dist`.

If **Output Directory** is `dist`, or an old `api/index` handler is deployed, you may see:

`Invalid export found in module "/var/task/app.js"`

## Environment variables

Set `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=production`, `CLIENT_URL`, `UPLOAD_BASE_URL`.

## After deploy

- `https://YOUR-PROJECT.vercel.app/`
- `https://YOUR-PROJECT.vercel.app/api/v1/health`
