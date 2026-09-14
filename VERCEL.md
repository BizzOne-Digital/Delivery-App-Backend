# Deploy backend on Vercel

## Required project settings

| Setting | Value |
|---------|--------|
| Framework Preset | **Other** |
| Root Directory | `.` (repo root) |
| Build Command | `npm run build` |
| **Output Directory** | **leave empty** — do **not** set `dist` |

If **Output Directory** is `dist`, Vercel treats `app.js` as a serverless function and you get:

`Invalid export found in module "/var/task/app.js"`

## Environment variables

Set `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=production`, `CLIENT_URL`, `UPLOAD_BASE_URL`.

## After deploy

- `https://YOUR-PROJECT.vercel.app/`
- `https://YOUR-PROJECT.vercel.app/api/v1/health`
