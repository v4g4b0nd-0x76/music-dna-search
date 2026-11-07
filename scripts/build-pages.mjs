#!/usr/bin/env node
/**
 * Builds the static Next.js bundle (`./out`) for GitHub Pages CI/CD.
 *
 * Why this script is needed:
 * 1. Next.js 15 App Router throws a build error when `output: 'export'` is enabled
 *    alongside server-only `app/api/.../route.ts` POST handlers.
 * 2. Enforces `NODE_ENV=production` and `GITHUB_PAGES=true` so Next.js generates
 *    a clean `./out` static bundle (including `index.html`, `404.html`, and `.nojekyll`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const apiDir = path.join(rootDir, 'app', 'api');
const backupApiDir = path.join(rootDir, '.api-pages-build-backup');
const outDir = path.join(rootDir, 'out');

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

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    GITHUB_PAGES: 'true',
  };

  console.log(
    `[build-pages] Running next build with NODE_ENV=production GITHUB_PAGES=true (NEXT_PUBLIC_BASE_PATH="${
      env.NEXT_PUBLIC_BASE_PATH || ''
    }")...`
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
    console.log('[build-pages] Static export complete in ./out (with .nojekyll).');
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
