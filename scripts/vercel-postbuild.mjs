import fs from "node:fs";
import path from "node:path";

const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Delivery API</title></head>
<body>
  <p>Delivery App API — try <a href="/api/v1/health">/api/v1/health</a></p>
</body>
</html>
`;

// Vercel UI sometimes sets Output Directory to "A" (from "N/A"). Ensure both exist after `tsc`.
for (const dir of ["public", "A"]) {
  fs.mkdirSync(path.join(process.cwd(), dir), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), dir, "index.html"), html);
}
