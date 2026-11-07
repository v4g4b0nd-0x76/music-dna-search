#!/usr/bin/env node
/**
 * Builds the static Next.js bundle (`./out`) for GitHub Pages CI/CD.
 *
 * Why this script is needed:
 * 1. Next.js 15 App Router throws a build error when `output: 'export'` is enabled
 *    alongside server-only `app/api/.../route.ts` POST handlers.
 * 2. Auto-detects the exact GitHub Pages subpath (`/<repo>`, defaulting to `/music-dna-search`)
 *    from `PAGES_BASE_PATH`, `GITHUB_REPOSITORY`, or `NEXT_PUBLIC_BASE_PATH`.
 * 3. Post-processes all generated HTML, CSS, and RSC payload files in `./out` to ensure every
 *    `<link>`, `<script>`, and `url(...)` asset reference uses the configured `basePath` prefix.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const apiDir = path.join(rootDir, 'app', 'api');
const backupApiDir = path.join(rootDir, '.api-pages-build-backup');
const outDir = path.join(rootDir, 'out');
const DEFAULT_PAGES_BASE_PATH = '/music-dna-search';

function resolveBasePath() {
  const pagesOutputBase = (process.env.PAGES_BASE_PATH || '').trim();
  if (pagesOutputBase) {
    return pagesOutputBase === '/'
      ? ''
      : `/${pagesOutputBase.replace(/^\/+|\/+$/g, '')}`;
  }

  const ghRepo = (process.env.GITHUB_REPOSITORY || '').trim();
  if (ghRepo.includes('/')) {
    const [owner, repo] = ghRepo.split('/');
    if (owner && repo) {
      if (repo.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
        return '';
      }
      return `/${repo}`;
    }
  }

  const rawNextBase = (process.env.NEXT_PUBLIC_BASE_PATH || DEFAULT_PAGES_BASE_PATH).trim();
  if (!rawNextBase || rawNextBase === '/') return '';
  return `/${rawNextBase.replace(/^\/+|\/+$/g, '')}`;
}

/**
 * Recursively walks `./out` and rewrites any unprefixed `/_next/` or stale `/cratedig-yt/_next/`
 * asset references in `.html`, `.css`, `.js`, and `.txt` files so they always use `basePath`.
 */
function rewriteExportedBundleAssetPaths(dirPath, basePath) {
  if (!basePath || basePath === '/' || !fs.existsSync(dirPath)) {
    return { filesScanned: 0, filesUpdated: 0 };
  }

  const cleanBase = `/${basePath.replace(/^\/+|\/+$/g, '')}`;
  let filesScanned = 0;
  let filesUpdated = 0;

  const walk = (currentDir) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!/\.(html|css|js|txt|json)$/i.test(entry.name)) {
        continue;
      }

      filesScanned += 1;
      const original = fs.readFileSync(fullPath, 'utf8');
      let updated = original;

      // 1. Replace any legacy /cratedig-yt/_next/ prefix with cleanBase/_next/
      updated = updated.replace(/\/cratedig-yt\/_next\//g, `${cleanBase}/_next/`);

      // 2. Prefix any unprefixed href="/_next/, src="/_next/, url(/_next/, or "/_next/
      updated = updated.replace(
        /(href=|src=|content=|url\()(["']?)\/_next\//g,
        `$1$2${cleanBase}/_next/`
      );
      updated = updated.replace(
        new RegExp(`(["'\\\\])\\/_next\\/(?!static\\/NONE)`, 'g'),
        `$1${cleanBase}/_next/`
      );

      // Deduplicate any accidental double prefixing (e.g. /music-dna-search/music-dna-search/_next/)
      const doublePrefixRegex = new RegExp(
        `${cleanBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${cleanBase.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        )}\\/_next\\/`,
        'g'
      );
      updated = updated.replace(doublePrefixRegex, `${cleanBase}/_next/`);

      if (updated !== original) {
        fs.writeFileSync(fullPath, updated, 'utf8');
        filesUpdated += 1;
      }
    }
  };

  walk(dirPath);
  return { filesScanned, filesUpdated };
}

let movedApi = false;

try {
  if (fs.existsSync(apiDir)) {
    if (fs.existsSync(backupApiDir)) {
      fs.rmSync(backupApiDir, { recursive: true, force: true });
    }
    fs.renameSync(apiDir, backupApiDir);
    movedApi = true;
    console.log('[build-pages] Temporarily moved app/api aside for static export.');
  }

  const resolvedBasePath = resolveBasePath();
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    GITHUB_PAGES: 'true',
    NEXT_PUBLIC_BASE_PATH: resolvedBasePath,
  };

  console.log(
    `[build-pages] Running next build with NODE_ENV=production GITHUB_PAGES=true (GITHUB_REPOSITORY="${
      process.env.GITHUB_REPOSITORY || ''
    }", resolved basePath="${resolvedBasePath}")...`
  );

  const result = spawnSync('npx', ['next', 'build'], {
    cwd: rootDir,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exitCode = result.status || 1;
  } else {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
    const rewriteStats = rewriteExportedBundleAssetPaths(outDir, resolvedBasePath);
    console.log(
      `[build-pages] Static export complete in ./out (with .nojekyll). Verified basePath="${resolvedBasePath}" across ${rewriteStats.filesScanned} exported files (${rewriteStats.filesUpdated} updated).`
    );
  }
} finally {
  if (movedApi && fs.existsSync(backupApiDir)) {
    if (fs.existsSync(apiDir)) {
      fs.rmSync(apiDir, { recursive: true, force: true });
    }
    fs.renameSync(backupApiDir, apiDir);
    console.log('[build-pages] Restored app/api directory.');
  }
}


