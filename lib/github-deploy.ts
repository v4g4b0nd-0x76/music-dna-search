export interface ParsedGitHubRemote {
  isValid: boolean;
  rawInput: string;
  owner: string;
  repo: string;
  protocol: 'https' | 'ssh' | 'shorthand' | 'invalid';
  httpsRemoteUrl: string;
  sshRemoteUrl: string;
  repoWebUrl: string;
  actionsWebUrl: string;
  pagesSettingsUrl: string;
  livePagesUrl: string;
  basePath: string;
  isUserOrOrgSite: boolean;
  errorMessage?: string;
}

export interface GitHubDeployConfig {
  remoteUrl: string;
  branch: string;
  nodeVersion: '20' | '22';
  packageManager: 'npm' | 'pnpm' | 'yarn';
  exportStaticConfig: boolean;
  commitMessage: string;
  includeTasteProfileJson: boolean;
  customDomain?: string;
}

export interface DeploymentPipelineStep {
  id: string;
  label: string;
  detail: string;
  status: 'pending' | 'running' | 'completed' | 'error';
}

/**
 * Parses a GitHub remote URL (HTTPS, SSH, or owner/repo shorthand) into structured repository and GitHub Pages metadata.
 */
export function parseGitHubRemoteUrl(remoteInput: string): ParsedGitHubRemote {
  const trimmed = remoteInput.trim();
  if (!trimmed) {
    return {
      isValid: false,
      rawInput: '',
      owner: '',
      repo: '',
      protocol: 'invalid',
      httpsRemoteUrl: '',
      sshRemoteUrl: '',
      repoWebUrl: '',
      actionsWebUrl: '',
      pagesSettingsUrl: '',
      livePagesUrl: '',
      basePath: '',
      isUserOrOrgSite: false,
      errorMessage: 'Please enter a GitHub remote URL (e.g. https://github.com/username/music-crate.git or git@github.com:username/music-crate.git).',
    };
  }

  let owner = '';
  let repo = '';
  let protocol: ParsedGitHubRemote['protocol'] = 'invalid';

  // 1. Match SSH format: git@github.com:owner/repo.git or ssh://git@github.com/owner/repo.git
  const sshMatch =
    trimmed.match(/^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i) ||
    trimmed.match(/^ssh:\/\/git@github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i);

  if (sshMatch) {
    owner = sshMatch[1];
    repo = sshMatch[2];
    protocol = 'ssh';
  }

  // 2. Match HTTPS format: https://github.com/owner/repo.git or https://github.com/owner/repo
  if (!owner) {
    const httpsMatch = trimmed.match(
      /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/i
    );
    if (httpsMatch) {
      owner = httpsMatch[1];
      repo = httpsMatch[2];
      protocol = 'https';
    }
  }

  // 3. Match shorthand format: owner/repo
  if (!owner) {
    const shorthandMatch = trimmed.match(
      /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/
    );
    if (shorthandMatch && !trimmed.includes(':') && !trimmed.startsWith('/')) {
      owner = shorthandMatch[1];
      repo = shorthandMatch[2];
      protocol = 'shorthand';
    }
  }

  if (!owner || !repo) {
    return {
      isValid: false,
      rawInput: trimmed,
      owner: '',
      repo: '',
      protocol: 'invalid',
      httpsRemoteUrl: '',
      sshRemoteUrl: '',
      repoWebUrl: '',
      actionsWebUrl: '',
      pagesSettingsUrl: '',
      livePagesUrl: '',
      basePath: '',
      isUserOrOrgSite: false,
      errorMessage:
        'Invalid GitHub remote URL. Use https://github.com/<owner>/<repo>.git, git@github.com:<owner>/<repo>.git, or <owner>/<repo>.',
    };
  }

  const cleanRepo = repo.replace(/\.git$/i, '');
  const isUserOrOrgSite = cleanRepo.toLowerCase() === `${owner.toLowerCase()}.github.io`;
  const basePath = isUserOrOrgSite ? '' : `/${cleanRepo}`;
  const livePagesUrl = isUserOrOrgSite
    ? `https://${owner.toLowerCase()}.github.io/`
    : `https://${owner.toLowerCase()}.github.io/${cleanRepo}/`;

  return {
    isValid: true,
    rawInput: trimmed,
    owner,
    repo: cleanRepo,
    protocol,
    httpsRemoteUrl: `https://github.com/${owner}/${cleanRepo}.git`,
    sshRemoteUrl: `git@github.com:${owner}/${cleanRepo}.git`,
    repoWebUrl: `https://github.com/${owner}/${cleanRepo}`,
    actionsWebUrl: `https://github.com/${owner}/${cleanRepo}/actions`,
    pagesSettingsUrl: `https://github.com/${owner}/${cleanRepo}/settings/pages`,
    livePagesUrl,
    basePath,
    isUserOrOrgSite,
  };
}

/**
 * Generates a complete `.github/workflows/deploy-pages.yml` workflow for automatic GitHub Pages CI/CD deployment.
 */
export function generateGitHubActionsPagesWorkflow(config: GitHubDeployConfig): string {
  const parsed = parseGitHubRemoteUrl(config.remoteUrl);
  const branch = (config.branch || 'main').trim() || 'main';
  const nodeVer = config.nodeVersion || '20';
  const basePath = parsed.isValid ? parsed.basePath : '';

  const installCmd =
    config.packageManager === 'pnpm'
      ? 'pnpm install --frozen-lockfile'
      : config.packageManager === 'yarn'
      ? 'yarn install --frozen-lockfile'
      : 'npm ci || npm install';

  const buildCmd =
    config.packageManager === 'pnpm'
      ? 'pnpm run build'
      : config.packageManager === 'yarn'
      ? 'yarn build'
      : 'npm run build';

  return `name: Deploy CrateDig YT to GitHub Pages

on:
  push:
    branches:
      - "${branch}"
  workflow_dispatch:

# Sets permissions of the GITHUB_TOKEN to allow deployment to GitHub Pages
permissions:
  contents: read
  pages: write
  id-token: write

# Allow one concurrent deployment
concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js ${nodeVer}
        uses: actions/setup-node@v4
        with:
          node-version: "${nodeVer}"
          cache: "npm"

      - name: Configure GitHub Pages
        uses: actions/configure-pages@v5
        with:
          static_site_generator: next

      - name: Install dependencies
        run: ${installCmd}

      - name: Build static Next.js bundle for GitHub Pages
        env:
          NEXT_PUBLIC_BASE_PATH: "${basePath}"
          GITHUB_PAGES: "true"
        run: ${buildCmd}

      - name: Ensure .nojekyll exists in static output
        run: touch ./out/.nojekyll

      - name: Upload GitHub Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./out

  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;
}

/**
 * Generates the static-export ready `next.config.ts` snippet that automatically adapts `output: 'export'` and `basePath` when `GITHUB_PAGES=true`.
 */
export function generateNextConfigForPages(config: GitHubDeployConfig): string {
  const parsed = parseGitHubRemoteUrl(config.remoteUrl);
  const defaultBasePath = parsed.isValid ? parsed.basePath : '/music-crate';

  return `import type { NextConfig } from 'next';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? (isGitHubPages ? '${defaultBasePath}' : '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: isGitHubPages ? 'export' : 'standalone',
  basePath: basePath || undefined,
  assetPrefix: basePath ? \`\${basePath}/\` : undefined,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
`;
}

/**
 * Generates an all-in-one executable shell script (`auto-deploy-github-pages.sh`) that:
 * 1. Writes `.github/workflows/deploy-pages.yml`
 * 2. Configures the target GitHub remote (`origin`)
 * 3. Commits and pushes to trigger the GitHub Pages CI/CD pipeline automatically
 */
export function generateOneClickAutoDeployScript(config: GitHubDeployConfig): string {
  const parsed = parseGitHubRemoteUrl(config.remoteUrl);
  const remoteTarget = parsed.isValid
    ? parsed.protocol === 'ssh'
      ? parsed.sshRemoteUrl
      : parsed.httpsRemoteUrl
    : config.remoteUrl.trim() || 'https://github.com/YOUR_USERNAME/cratedig-yt.git';
  const branch = (config.branch || 'main').trim() || 'main';
  const commitMsg =
    (config.commitMessage || 'Configure GitHub Pages CI/CD auto-deploy').replace(/"/g, '\\"');
  const workflowYaml = generateGitHubActionsPagesWorkflow(config);

  const customCnameStep =
    config.customDomain && config.customDomain.trim()
      ? `\n# Configure custom domain CNAME\nmkdir -p public\necho "${config.customDomain.trim()}" > public/CNAME`
      : '';

  return `#!/usr/bin/env bash
# ==============================================================================
# CrateDig YT — 1-Command GitHub Remote & Pages CI/CD Auto-Deploy Script
# Target Remote: ${remoteTarget}
# Target Branch: ${branch}
# Live Pages URL: ${parsed.isValid ? parsed.livePagesUrl : 'https://<owner>.github.io/<repo>/'}
# ==============================================================================
set -e

echo "1/4 Generating .github/workflows/deploy-pages.yml..."
mkdir -p .github/workflows
cat << 'EOF_WORKFLOW' > .github/workflows/deploy-pages.yml
${workflowYaml.trim()}
EOF_WORKFLOW
${customCnameStep}

echo "2/4 Configuring Git repository and remote (${remoteTarget})..."
if [ ! -d .git ]; then
  git init
fi
git branch -M ${branch}
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "${remoteTarget}"
else
  git remote add origin "${remoteTarget}"
fi

echo "3/4 Staging and committing project & CI/CD workflow..."
git add -A
git commit -m "${commitMsg}" || echo "Working tree clean, proceeding to push..."

echo "4/4 Pushing to ${remoteTarget} (${branch})..."
git push -u origin ${branch}

# Optional: If GitHub CLI (gh) is installed and authenticated, enable GitHub Pages workflow mode automatically
if command -v gh >/dev/null 2>&1; then
  echo "Enabling GitHub Actions as Pages source via gh CLI..."
  gh api -X POST "repos/${parsed.isValid ? `${parsed.owner}/${parsed.repo}` : ':owner/:repo'}/pages" -f build_type=workflow 2>/dev/null || \\
  gh api -X PUT "repos/${parsed.isValid ? `${parsed.owner}/${parsed.repo}` : ':owner/:repo'}/pages" -f build_type=workflow 2>/dev/null || true
fi

echo "✅ Push complete! GitHub Actions CI/CD is building your site:"
echo "   Actions Status: ${parsed.isValid ? parsed.actionsWebUrl : 'https://github.com/<owner>/<repo>/actions'}"
echo "   Live Pages URL: ${parsed.isValid ? parsed.livePagesUrl : 'https://<owner>.github.io/<repo>/'}"
`;
}
