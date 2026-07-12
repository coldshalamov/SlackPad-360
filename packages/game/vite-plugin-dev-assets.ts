/**
 * Dev + build asset bridge (M7). The hero GLBs, the Kloppenheim HDRI, and the
 * concrete ground textures live OUTSIDE the game package (under the repo's
 * `assets/` tree) and are deliberately NOT copied into `public/` — they are
 * staged / vendor art pending runtime promotion. This plugin mounts them at
 * stable URLs so the runtime loader is identical in dev and prod:
 *
 *   /staged-assets/*     → assets/generated/authored/staged/*     (hero GLBs)
 *   /env/*               → assets/source/vendor/ph-kloppenheim-05-puresky/*
 *   /textures/concrete/* → assets/generated/textures/concrete/*
 *
 * In dev it serves the files via connect middleware (like the shot sink). For
 * `vite build` there is no dev server, so a `closeBundle` hook copies an
 * explicit allowlist of the files the runtime actually references into
 * `dist/<prefix>` — hand-rolled so we take on NO new dependency
 * (vite-plugin-static-copy et al.).
 */
import type { Plugin, ResolvedConfig } from 'vite';
import { createReadStream, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface Mount {
  /** URL prefix (leading + trailing slash). */
  prefix: string;
  /** Absolute source directory. */
  dir: string;
  /** Files (relative to `dir`) copied into the build output. */
  copy: string[];
}

const MOUNTS: Mount[] = [
  {
    prefix: '/staged-assets/',
    dir: join(REPO_ROOT, 'assets', 'generated', 'authored', 'staged'),
    // M7 loads LOD0 only; LODs 1/2 ship later with the runtime-promotion pass.
    copy: ['hero-board.lod0.glb', 'shoes.lod0.glb'],
  },
  {
    prefix: '/env/',
    dir: join(REPO_ROOT, 'assets', 'source', 'vendor', 'ph-kloppenheim-05-puresky'),
    copy: ['kloppenheim_05_puresky_1k.hdr'],
  },
  {
    prefix: '/textures/concrete/',
    dir: join(REPO_ROOT, 'assets', 'generated', 'textures', 'concrete'),
    copy: ['Color.jpg', 'NormalGL.jpg', 'Roughness.jpg', 'AmbientOcclusion.jpg'],
  },
];

const CONTENT_TYPES: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.hdr': 'image/vnd.radiance',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

function contentType(file: string): string {
  const dot = file.lastIndexOf('.');
  const ext = dot >= 0 ? file.slice(dot).toLowerCase() : '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

export function devAssets(): Plugin {
  let resolved: ResolvedConfig | null = null;
  return {
    name: 'slackpad-dev-assets',
    configResolved(config) {
      resolved = config;
    },
    configureServer(server) {
      for (const mount of MOUNTS) {
        server.middlewares.use(mount.prefix, (req, res, next) => {
          // connect strips the mount prefix; req.url is the remainder.
          const rel = decodeURIComponent((req.url ?? '').split('?')[0] ?? '').replace(/^\/+/, '');
          const abs = normalize(join(mount.dir, rel));
          // Path-traversal guard: the resolved path must stay under the mount.
          if (!abs.startsWith(mount.dir) || !existsSync(abs) || !statSync(abs).isFile()) {
            next();
            return;
          }
          res.setHeader('content-type', contentType(abs));
          res.setHeader('cache-control', 'no-cache');
          createReadStream(abs).pipe(res);
        });
      }
    },
    closeBundle() {
      // Only meaningful for `vite build` (dev never reaches closeBundle with an
      // outDir to populate). Copy the allowlist into dist/<prefix>.
      const root = resolved?.root ?? join(REPO_ROOT, 'packages', 'game');
      const outDir = resolve(root, resolved?.build.outDir ?? 'dist');
      for (const mount of MOUNTS) {
        const destDir = join(outDir, mount.prefix.replace(/^\/+|\/+$/g, ''));
        for (const rel of mount.copy) {
          const src = join(mount.dir, rel);
          if (!existsSync(src)) {
            this.warn(`dev-assets: missing ${src} — not copied into build`);
            continue;
          }
          mkdirSync(dirname(join(destDir, rel)), { recursive: true });
          copyFileSync(src, join(destDir, rel));
        }
      }
    },
  };
}
