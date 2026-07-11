// Tiny static file server for the review viewer. Serves the REPO ROOT so the
// viewer html can import three from node_modules and fetch staged GLBs.
// Usage: node packages/asset-pipeline/tools/review-viewer/serve.mjs [port]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const PORT = Number(process.argv[2] || 8137);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css',
  '.wasm': 'application/wasm',
};

const SHOTS = path.join(HERE, 'shots');

http
  .createServer((req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      // POST /save?name=foo.png with a data-URL body → writes shots/foo.png
      if (req.method === 'POST' && url.pathname === '/save') {
        const name = (url.searchParams.get('name') || 'shot.png').replace(/[^a-z0-9._-]/gi, '');
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const b64 = body.replace(/^data:image\/png;base64,/, '');
          fs.mkdirSync(SHOTS, { recursive: true });
          fs.writeFileSync(path.join(SHOTS, name), Buffer.from(b64, 'base64'));
          res.writeHead(200).end('saved ' + name);
        });
        return;
      }
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/packages/asset-pipeline/tools/review-viewer/viewer.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  })
  .listen(PORT, () => console.log(`review viewer at http://localhost:${PORT}/`));
