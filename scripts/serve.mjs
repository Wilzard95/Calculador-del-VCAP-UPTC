import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const allowed = new Set(['index.html', 'styles.css', 'branding.css', 'app.mjs', 'engine.mjs', 'favicon.svg', 'data/modelo.json', 'assets/uptc.svg', 'assets/posgrados-banner.png', 'assets/planeacion.svg', 'assets/vafi.svg', 'assets/campus-tunja.jpg', 'assets/campus-central.jpg']);
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!allowed.has(file)) { response.writeHead(404); response.end('No encontrado'); return; }
    const content = await readFile(path.join(root, file));
    const contentType = mime[path.extname(file)] || 'text/plain';
    response.writeHead(200, { 'Content-Type': contentType.startsWith('image/') ? contentType : `${contentType}; charset=utf-8`, 'Cache-Control': 'no-store' });
    response.end(content);
  } catch { response.writeHead(500); response.end('Error al servir el archivo'); }
});
server.listen(4173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4173'));
