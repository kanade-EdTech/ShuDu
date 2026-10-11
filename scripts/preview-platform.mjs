import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.m4a': 'audio/mp4' };
http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    let name = decodeURIComponent(url.pathname);
    name = name.replace(/^\/toy\/demo\//, '/toy/');
    if (name.endsWith('/')) { name += 'index.html'; }
    const file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403); return response.end(); }
    const data = await readFile(file);
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self'" + (name.startsWith('/xhs/') ? '' : ' blob:'));
    response.end(data);
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('Toy: http://127.0.0.1:4173/toy/demo/ ; XHS: http://127.0.0.1:4173/xhs/'));
