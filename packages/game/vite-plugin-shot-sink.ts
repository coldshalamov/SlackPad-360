/**
 * Dev-only Vite middleware: accepts POST /__shot with a JSON body
 * { name: string, dataUrl: 'data:image/...;base64,...' } and writes the
 * decoded image under preproduction/evidence/impl/<dir>/<name>. Used by the
 * asset-review page and visual checks to persist screenshots without routing
 * image data through the driver. Never part of production builds.
 */
import type { Plugin } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function shotSink(): Plugin {
  return {
    name: 'slackpad-shot-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        let body = '';
        req.on('data', (c: Buffer) => {
          body += c.toString('utf8');
        });
        req.on('end', () => {
          try {
            const { name, dir, dataUrl } = JSON.parse(body) as {
              name: string;
              dir?: string;
              dataUrl: string;
            };
            if (!/^[\w.-]+$/.test(name) || (dir && !/^[\w-]+$/.test(dir))) {
              throw new Error('bad name/dir');
            }
            const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl);
            if (!m) throw new Error('bad dataUrl');
            const outDir = join(REPO_ROOT, 'preproduction', 'evidence', 'impl', dir ?? 'shots');
            mkdirSync(outDir, { recursive: true });
            const file = join(outDir, name.endsWith(`.${m[1] === 'jpeg' ? 'jpg' : 'png'}`) ? name : `${name}.${m[1] === 'jpeg' ? 'jpg' : 'png'}`);
            writeFileSync(file, Buffer.from(m[2]!, 'base64'));
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, file }));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
      });
    },
  };
}
