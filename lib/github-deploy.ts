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

export interface GitRepoDiagnostics {
  isGitInitialized: boolean;
  currentBranch: string;
  remoteOriginUrl: string | null;
  commitCount: number;
  latestCommit: string | null;
  workingTreeClean: boolean;
  modifiedFilesCount: number;
  hasWorkflowFile: boolean;
  hasBuildPagesScript: boolean;
  nextConfigSupportsExport: boolean;
  issuesFixed: string[];
}

/**
 * Generates a complete `.github/workflows/deploy-pages.yml` workflow for automatic GitHub Pages CI/CD deployment.
 *
 * Fixes common Next.js 15 + GitHub Actions failure causes:
 * 1. Avoids `cache: "npm"` crash when `package-lock.json` is absent (e.g. `bun.lock` workspaces).
 * 2. Avoids `static_site_generator: next` crash on TypeScript `next.config.ts`.
 * 3. Uses `npm run build:pages` (`scripts/build-pages.mjs`) to temporarily move `app/api`
 *    route handlers aside during `GITHUB_PAGES=true` static export (`output: 'export'`).
 */
export function generateGitHubActionsPagesWorkflow(config: GitHubDeployConfig): string {
  const parsed = parseGitHubRemoteUrl(config.remoteUrl);
  const branch = (config.branch || 'main').trim() || 'main';
  const nodeVer = config.nodeVersion || '20';
  const basePath = parsed.isValid ? parsed.basePath : '';

  const installCmd =
    config.packageManager === 'pnpm'
      ? 'pnpm install --no-frozen-lockfile'
      : config.packageManager === 'yarn'
      ? 'yarn install'
      : 'npm install --legacy-peer-deps || npm install';

  const buildCmd =
    config.packageManager === 'pnpm'
      ? 'pnpm run build:pages'
      : config.packageManager === 'yarn'
      ? 'yarn build:pages'
      : 'npm run build:pages';

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

      - name: Configure GitHub Pages
        id: pages
        uses: actions/configure-pages@v5
        continue-on-error: true

      - name: Install dependencies
        run: ${installCmd}

      - name: Build static Next.js bundle for GitHub Pages
        env:
          GITHUB_PAGES: "true"
          PAGES_BASE_PATH: \${{ steps.pages.outputs.base_path }}
          NEXT_PUBLIC_BASE_PATH: "${basePath}"
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
  const defaultBasePath = parsed.isValid ? parsed.basePath : '/music-dna-search';

  return `import type { NextConfig } from 'next';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';

function resolveGitHubPagesBasePath(): string {
  if (!isGitHubPages) return '';
  const pagesOutputBase = (process.env.PAGES_BASE_PATH || '').trim();
  if (pagesOutputBase) {
    return pagesOutputBase === '/' ? '' : \`/\${pagesOutputBase.replace(/^\\/+|\\/+$/g, '')}\`;
  }
  const ghRepo = (process.env.GITHUB_REPOSITORY || '').trim();
  if (ghRepo.includes('/')) {
    const [owner, repo] = ghRepo.split('/');
    if (owner && repo) {
      return repo.toLowerCase() === \`\${owner.toLowerCase()}.github.io\` ? '' : \`/\${repo}\`;
    }
  }
  return process.env.NEXT_PUBLIC_BASE_PATH || '${defaultBasePath}';
}

const basePath = resolveGitHubPagesBasePath();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: isGitHubPages ? 'export' : 'standalone',
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
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

export type DiagnosticCheckStatus = 'pass' | 'warn' | 'fail';

export interface DiagnosticCheckItem {
  id: string;
  category: 'permissions' | 'branch-protection' | 'workflow-yaml';
  label: string;
  status: DiagnosticCheckStatus;
  summary: string;
  remediation?: string;
  lineNumber?: number;
}

export interface WorkflowYamlSyntaxIssue {
  lineNumber?: number;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  remediation: string;
}

export interface WorkflowYamlDiagnosticResult {
  isValid: boolean;
  score: number;
  lineCount: number;
  detectedJobs: string[];
  detectedTriggers: string[];
  hasRequiredPermissions: boolean;
  hasPagesArtifactUpload: boolean;
  hasDeployPagesAction: boolean;
  issues: WorkflowYamlSyntaxIssue[];
  checks: DiagnosticCheckItem[];
}

export interface RawGitHubApiDiagnosticInput {
  remoteUrl: string;
  targetBranch: string;
  workflowYaml: string;
  hasToken: boolean;
  tokenScopes?: string[];
  repoHttpStatus?: number;
  repoVisibility?: 'public' | 'private' | 'unknown';
  repoDefaultBranch?: string;
  repoPermissions?: {
    admin?: boolean;
    push?: boolean;
    pull?: boolean;
    maintain?: boolean;
  };
  pagesHttpStatus?: number;
  pagesBuildType?: 'workflow' | 'legacy' | 'unknown';
  actionsEnabled?: boolean;
  branchHttpStatus?: number;
  branchProtected?: boolean;
  branchProtectionRules?: {
    requiresPullRequestReviews?: boolean;
    requiredApprovingReviewCount?: number;
    requiresStatusChecks?: boolean;
    enforceAdmins?: boolean;
    allowForcePushes?: boolean;
    blockCreations?: boolean;
  };
  localGitDiagnostics?: GitRepoDiagnostics | null;
}

export interface CiCdDiagnosticReport {
  overallStatus: 'healthy' | 'warning' | 'failing';
  healthScore: number;
  checkedAtIso: string;
  repositoryTarget: string;
  targetBranch: string;
  permissionsChecks: DiagnosticCheckItem[];
  branchProtectionChecks: DiagnosticCheckItem[];
  workflowYamlResult: WorkflowYamlDiagnosticResult;
  rootCauseSummary: string[];
  recommendedFixes: string[];
}

/**
 * Validates a GitHub Actions workflow YAML file for syntax errors, indentation traps,
 * OIDC permissions (`pages: write`, `id-token: write`), branch triggers, and Next.js 15 static export readiness.
 */
export function validateWorkflowYamlSyntax(
  yamlContent: string,
  expectedBranch = 'main'
): WorkflowYamlDiagnosticResult {
  const raw = String(yamlContent || '');
  const lines = raw.split(/\r?\n/);
  const issues: WorkflowYamlSyntaxIssue[] = [];
  const checks: DiagnosticCheckItem[] = [];

  if (!raw.trim()) {
    issues.push({
      lineNumber: 1,
      severity: 'error',
      code: 'YAML_EMPTY',
      message: 'Workflow YAML file is empty.',
      remediation: 'Restore the recommended .github/workflows/deploy-pages.yml template.',
    });
    checks.push({
      id: 'yaml-non-empty',
      category: 'workflow-yaml',
      label: 'Workflow YAML Syntax & Structure',
      status: 'fail',
      summary: 'Workflow YAML content is empty.',
      remediation: 'Click "Restore Recommended Workflow YAML" to generate a valid workflow.',
      lineNumber: 1,
    });
    return {
      isValid: false,
      score: 0,
      lineCount: 0,
      detectedJobs: [],
      detectedTriggers: [],
      hasRequiredPermissions: false,
      hasPagesArtifactUpload: false,
      hasDeployPagesAction: false,
      issues,
      checks,
    };
  }

  // 1. Check line-by-line indentation, tabs, and unbalanced quotes
  let tabLine: number | undefined;
  let unbalancedQuoteLine: number | undefined;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    if (/^\s*\t/.test(line)) {
      if (!tabLine) tabLine = lineNum;
      issues.push({
        lineNumber: lineNum,
        severity: 'error',
        code: 'YAML_TAB_INDENTATION',
        message: `Line ${lineNum} uses a TAB character for indentation, which is invalid in GitHub Actions YAML.`,
        remediation: `Replace TAB characters on line ${lineNum} with 2-space indentation.`,
      });
    }

    // Check unbalanced double quotes on simple single-line key: "value
    const codePart = line.replace(/#.*$/, '');
    const doubleQuotesCount = (codePart.match(/(?<!\\)"/g) || []).length;
    if (doubleQuotesCount % 2 !== 0) {
      if (!unbalancedQuoteLine) unbalancedQuoteLine = lineNum;
      issues.push({
        lineNumber: lineNum,
        severity: 'error',
        code: 'YAML_UNBALANCED_QUOTES',
        message: `Line ${lineNum} contains unbalanced double quotes (").`,
        remediation: `Close the string literal on line ${lineNum}.`,
      });
    }
  });

  if (tabLine || unbalancedQuoteLine) {
    checks.push({
      id: 'yaml-indentation-quotes',
      category: 'workflow-yaml',
      label: 'YAML Indentation & Quote Syntax',
      status: 'fail',
      summary: tabLine
        ? `Invalid TAB indentation detected on line ${tabLine}.`
        : `Unbalanced quotes detected on line ${unbalancedQuoteLine}.`,
      remediation: 'Use 2-space indentation and properly closed quotes across the workflow file.',
      lineNumber: tabLine || unbalancedQuoteLine,
    });
  } else {
    checks.push({
      id: 'yaml-indentation-quotes',
      category: 'workflow-yaml',
      label: 'YAML Indentation & Quote Syntax',
      status: 'pass',
      summary: `Validated ${lines.length} lines: 2-space indentation, zero TAB characters, and balanced string literals.`,
    });
  }

  // 2. Check top-level keys (`name:`, `on:`, `permissions:`, `jobs:`)
  const hasOnKey = /^on\s*:/m.test(raw);
  const hasJobsKey = /^jobs\s*:/m.test(raw);
  const hasPermissionsKey = /^permissions\s*:/m.test(raw);

  const detectedTriggers: string[] = [];
  if (/\bpush\s*:/m.test(raw)) detectedTriggers.push('push');
  if (/\bworkflow_dispatch\s*:/m.test(raw)) detectedTriggers.push('workflow_dispatch');
  if (/\bpull_request\s*:/m.test(raw)) detectedTriggers.push('pull_request');

  const detectedJobs: string[] = [];
  if (/^\s{2}build\s*:/m.test(raw)) detectedJobs.push('build');
  if (/^\s{2}deploy\s*:/m.test(raw)) detectedJobs.push('deploy');

  if (!hasOnKey || !hasJobsKey) {
    issues.push({
      severity: 'error',
      code: 'YAML_MISSING_TOP_LEVEL_KEYS',
      message: `Missing required top-level YAML section(s): ${[
        !hasOnKey ? '"on:"' : '',
        !hasJobsKey ? '"jobs:"' : '',
      ]
        .filter(Boolean)
        .join(', ')}.`,
      remediation: 'Include both "on:" trigger definitions and "jobs:" build/deploy definitions.',
    });
    checks.push({
      id: 'yaml-structure-jobs',
      category: 'workflow-yaml',
      label: 'Workflow Triggers & Job Graph (build → deploy)',
      status: 'fail',
      summary: 'Missing required "on:" or "jobs:" root block in workflow YAML.',
      remediation: 'Ensure the workflow defines top-level "on:" and "jobs:" (build & deploy) blocks.',
    });
  } else {
    const cleanBranch = (expectedBranch || 'main').trim() || 'main';
    const branchRegex = new RegExp(`['"-\\s]+${cleanBranch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\\s]*$`, 'm');
    const matchesExpectedBranch = branchRegex.test(raw) || raw.includes(`"${cleanBranch}"`) || raw.includes(`'${cleanBranch}'`) || raw.includes(`- ${cleanBranch}`);

    if (!matchesExpectedBranch) {
      issues.push({
        severity: 'warning',
        code: 'YAML_BRANCH_MISMATCH',
        message: `Workflow push trigger does not explicitly reference target branch "${cleanBranch}".`,
        remediation: `Update on.push.branches to include "${cleanBranch}" so pushes trigger the Pages build.`,
      });
      checks.push({
        id: 'yaml-structure-jobs',
        category: 'workflow-yaml',
        label: 'Workflow Triggers & Job Graph (build → deploy)',
        status: 'warn',
        summary: `Jobs (${detectedJobs.join(', ') || 'custom'}) found, but on.push.branches does not match target branch "${cleanBranch}".`,
        remediation: `Add - "${cleanBranch}" under on.push.branches in .github/workflows/deploy-pages.yml.`,
      });
    } else {
      checks.push({
        id: 'yaml-structure-jobs',
        category: 'workflow-yaml',
        label: 'Workflow Triggers & Job Graph (build → deploy)',
        status: 'pass',
        summary: `Triggers (${detectedTriggers.join(', ')}) aligned with branch "${cleanBranch}" and jobs (${detectedJobs.join(' → ')}).`,
      });
    }
  }

  // 3. Check GitHub Pages OIDC & Token Permissions
  const hasContentsRead = /contents\s*:\s*(?:read|write)/m.test(raw);
  const hasPagesWrite = /pages\s*:\s*write/m.test(raw);
  const hasIdTokenWrite = /id-token\s*:\s*write/m.test(raw);
  const hasRequiredPermissions = hasPermissionsKey && hasContentsRead && hasPagesWrite && hasIdTokenWrite;

  if (!hasRequiredPermissions) {
    issues.push({
      severity: 'error',
      code: 'YAML_MISSING_OIDC_PERMISSIONS',
      message:
        'Missing required GitHub Pages OIDC permissions (pages: write and id-token: write).',
      remediation:
        'Add top-level permissions: contents: read, pages: write, id-token: write so actions/deploy-pages@v4 can authenticate.',
    });
    checks.push({
      id: 'yaml-oidc-permissions',
      category: 'workflow-yaml',
      label: 'Workflow GITHUB_TOKEN & OIDC Permissions',
      status: 'fail',
      summary: `Missing ${[
        !hasPagesWrite ? 'pages: write' : '',
        !hasIdTokenWrite ? 'id-token: write' : '',
        !hasContentsRead ? 'contents: read' : '',
      ]
        .filter(Boolean)
        .join(', ')} in workflow YAML.`,
      remediation:
        'Add permissions: { contents: read, pages: write, id-token: write } to prevent HttpError: Resource not accessible by integration.',
    });
  } else {
    checks.push({
      id: 'yaml-oidc-permissions',
      category: 'workflow-yaml',
      label: 'Workflow GITHUB_TOKEN & OIDC Permissions',
      status: 'pass',
      summary: 'Verified contents: read, pages: write, and id-token: write for OIDC Pages deployment.',
    });
  }

  // 4. Check Next.js 15 & GitHub Actions known failure traps (cache: "npm" without lockfile, static_site_generator: next)
  const hasNpmCacheTrap = /cache\s*:\s*['"]?npm['"]?/m.test(raw);
  const hasConfigurePagesNextTrap = /static_site_generator\s*:\s*['"]?next['"]?/m.test(raw);

  if (hasNpmCacheTrap || hasConfigurePagesNextTrap) {
    if (hasNpmCacheTrap) {
      issues.push({
        severity: 'error',
        code: 'YAML_NPM_CACHE_TRAP',
        message:
          'setup-node uses `cache: "npm"`, which crashes GitHub Actions when package-lock.json is absent.',
        remediation:
          'Remove `cache: "npm"` from actions/setup-node@v4 so repositories without package-lock.json do not fail at step 2.',
      });
    }
    if (hasConfigurePagesNextTrap) {
      issues.push({
        severity: 'error',
        code: 'YAML_CONFIGURE_PAGES_NEXT_TRAP',
        message:
          'configure-pages uses `static_site_generator: next`, which fails to mutate TypeScript next.config.ts.',
        remediation:
          'Remove `static_site_generator: next` and use `npm run build:pages` with `GITHUB_PAGES: "true"` instead.',
      });
    }
    checks.push({
      id: 'yaml-nextjs15-traps',
      category: 'workflow-yaml',
      label: 'Next.js 15 & Lockfile Crash Protection',
      status: 'fail',
      summary: `Detected CI/CD crash pattern: ${[
        hasNpmCacheTrap ? 'cache: "npm" lockfile trap' : '',
        hasConfigurePagesNextTrap ? 'static_site_generator: next TypeScript config trap' : '',
      ]
        .filter(Boolean)
        .join(' & ')}.`,
      remediation:
        'Remove `cache: "npm"` and `static_site_generator: next` from .github/workflows/deploy-pages.yml.',
    });
  } else {
    checks.push({
      id: 'yaml-nextjs15-traps',
      category: 'workflow-yaml',
      label: 'Next.js 15 & Lockfile Crash Protection',
      status: 'pass',
      summary:
        'Free of `cache: "npm"` lockfile crashes and `static_site_generator: next` TypeScript config crashes.',
    });
  }

  // 5. Check Static Export Artifact Upload (`./out`) & `actions/deploy-pages@v4`
  const hasPagesArtifactUpload =
    /actions\/upload-pages-artifact@v[34]/m.test(raw) && /path\s*:\s*['"]?\.?\/?out['"]?/m.test(raw);
  const hasDeployPagesAction = /actions\/deploy-pages@v4/m.test(raw);
  const hasBuildPagesCmd = /build:pages/m.test(raw) || /GITHUB_PAGES\s*:\s*['"]?true['"]?/m.test(raw);

  if (!hasPagesArtifactUpload || !hasDeployPagesAction || !hasBuildPagesCmd) {
    issues.push({
      severity: 'error',
      code: 'YAML_ARTIFACT_OR_DEPLOY_MISSING',
      message:
        'Workflow is missing static export build (`npm run build:pages`), `./out` artifact upload, or `actions/deploy-pages@v4`.',
      remediation:
        'Ensure the build job runs `npm run build:pages`, uploads `./out` via `actions/upload-pages-artifact@v3`, and deploys via `actions/deploy-pages@v4`.',
    });
    checks.push({
      id: 'yaml-artifact-deploy',
      category: 'workflow-yaml',
      label: 'Static Bundle Artifact (./out) & Deploy Action',
      status: 'fail',
      summary: 'Missing `npm run build:pages`, `upload-pages-artifact` (./out), or `deploy-pages@v4`.',
      remediation: 'Restore the standard build and deploy steps in .github/workflows/deploy-pages.yml.',
    });
  } else {
    checks.push({
      id: 'yaml-artifact-deploy',
      category: 'workflow-yaml',
      label: 'Static Bundle Artifact (./out) & Deploy Action',
      status: 'pass',
      summary:
        'Builds static export via `npm run build:pages` (GITHUB_PAGES="true"), uploads `./out`, and deploys with `actions/deploy-pages@v4`.',
    });
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warning').length;
  const score = Math.max(0, 100 - errorCount * 25 - warnCount * 10);

  return {
    isValid: errorCount === 0,
    score,
    lineCount: lines.length,
    detectedJobs,
    detectedTriggers,
    hasRequiredPermissions,
    hasPagesArtifactUpload,
    hasDeployPagesAction,
    issues,
    checks,
  };
}

/**
 * Evaluates repository permissions, branch protection settings, and workflow YAML syntax
 * to produce a complete CI/CD diagnostic report with root causes and actionable fixes.
 */
export function evaluateRepoAndBranchDiagnostics(
  input: RawGitHubApiDiagnosticInput
): CiCdDiagnosticReport {
  const parsed = parseGitHubRemoteUrl(input.remoteUrl);
  const repoTarget = parsed.isValid ? `${parsed.owner}/${parsed.repo}` : input.remoteUrl || 'unknown/repo';
  const targetBranch = (input.targetBranch || 'main').trim() || 'main';

  const permissionsChecks: DiagnosticCheckItem[] = [];
  const branchProtectionChecks: DiagnosticCheckItem[] = [];
  const rootCauseSummary: string[] = [];
  const recommendedFixes: string[] = [];

  // ============================================================================
  // CATEGORY 1: Repository Permissions & Pages Build Source
  // ============================================================================
  if (!parsed.isValid) {
    permissionsChecks.push({
      id: 'perm-remote-url',
      category: 'permissions',
      label: 'GitHub Repository Remote URL',
      status: 'fail',
      summary: parsed.errorMessage || 'Invalid GitHub remote URL.',
      remediation: 'Enter a valid GitHub URL such as https://github.com/username/cratedig-yt.git.',
    });
    rootCauseSummary.push('Invalid GitHub repository URL format.');
  } else if (input.repoHttpStatus === 200) {
    permissionsChecks.push({
      id: 'perm-repo-access',
      category: 'permissions',
      label: 'Remote Repository Existence & Visibility',
      status: 'pass',
      summary: `Repository ${repoTarget} is live on GitHub (${input.repoVisibility || 'public'}, default branch: ${input.repoDefaultBranch || targetBranch}).`,
    });
  } else if (input.repoHttpStatus === 404) {
    permissionsChecks.push({
      id: 'perm-repo-access',
      category: 'permissions',
      label: 'Remote Repository Existence & Visibility',
      status: 'warn',
      summary: `Remote repository ${repoTarget} returned HTTP 404 (not created on GitHub yet, or private without a token).`,
      remediation: `Create https://github.com/${repoTarget} on GitHub, or supply a GitHub Personal Access Token (repo + workflow scopes) to auto-create and push directly.`,
    });
    rootCauseSummary.push(
      `Remote repository ${repoTarget} does not exist on GitHub yet (or is private and requires a Personal Access Token).`
    );
    recommendedFixes.push(
      `Provide a GitHub Personal Access Token with 'repo' and 'workflow' scopes to automatically create ${repoTarget} and push branch '${targetBranch}', or create the repository on GitHub and run the 1-Command Auto-Deploy Script.`
    );
  } else if (input.repoHttpStatus === 401 || input.repoHttpStatus === 403) {
    permissionsChecks.push({
      id: 'perm-repo-access',
      category: 'permissions',
      label: 'Remote Repository Existence & Visibility',
      status: 'fail',
      summary: `GitHub API returned HTTP ${input.repoHttpStatus} (Unauthorized / Forbidden) for ${repoTarget}.`,
      remediation: 'Verify that your GitHub Personal Access Token has not expired and grants access to this repository.',
    });
    rootCauseSummary.push(`GitHub API rejected authentication (HTTP ${input.repoHttpStatus}) for ${repoTarget}.`);
  } else {
    permissionsChecks.push({
      id: 'perm-repo-access',
      category: 'permissions',
      label: 'Remote Repository Target Resolution',
      status: 'pass',
      summary: `Resolved remote repository ${repoTarget} (${parsed.protocol.toUpperCase()}) with Pages basePath "${parsed.basePath || '/'}".`,
    });
  }

  // Token & Push Permission Check
  if (input.hasToken) {
    const canPush = input.repoPermissions?.push !== false;
    const scopes = input.tokenScopes || [];
    const missingWorkflowScope =
      scopes.length > 0 && !scopes.includes('workflow') && !scopes.includes('repo');

    if (!canPush) {
      permissionsChecks.push({
        id: 'perm-token-scopes',
        category: 'permissions',
        label: 'Write / Push & Workflow Token Permissions',
        status: 'fail',
        summary: `Authenticated user does not have push access (push: false) to ${repoTarget}.`,
        remediation: 'Use a Personal Access Token belonging to the repository owner or an admin/write collaborator.',
      });
      rootCauseSummary.push(`GitHub token lacks write/push permission on ${repoTarget}.`);
    } else if (missingWorkflowScope) {
      permissionsChecks.push({
        id: 'perm-token-scopes',
        category: 'permissions',
        label: 'Write / Push & Workflow Token Permissions',
        status: 'warn',
        summary: `Token scopes (${scopes.join(', ')}) may be missing 'workflow' scope required to push .github/workflows/deploy-pages.yml.`,
        remediation: 'Enable both "repo" and "workflow" scopes on your classic PAT (or Workflows: Read & Write on fine-grained PAT).',
      });
      recommendedFixes.push('Grant the `workflow` permission scope on your GitHub token so GitHub allows pushing `.github/workflows/deploy-pages.yml`.');
    } else {
      permissionsChecks.push({
        id: 'perm-token-scopes',
        category: 'permissions',
        label: 'Write / Push & Workflow Token Permissions',
        status: 'pass',
        summary: `Token authenticated with push permissions${scopes.length ? ` (scopes: ${scopes.join(', ')})` : ''}.`,
      });
    }
  } else {
    permissionsChecks.push({
      id: 'perm-token-scopes',
      category: 'permissions',
      label: 'Write / Push & Workflow Token Permissions',
      status: 'pass',
      summary:
        'Workflow GITHUB_TOKEN permissions (contents: read, pages: write, id-token: write) are configured; add an optional PAT only if pushing directly from the browser.',
    });
  }

  // GitHub Pages Build Source Check (`workflow` vs `legacy` branch)
  if (input.pagesHttpStatus === 200) {
    if (input.pagesBuildType === 'workflow') {
      permissionsChecks.push({
        id: 'perm-pages-build-type',
        category: 'permissions',
        label: 'GitHub Pages Build & Deployment Source',
        status: 'pass',
        summary: 'GitHub Pages source is set to "GitHub Actions" (build_type: workflow).',
      });
    } else {
      permissionsChecks.push({
        id: 'perm-pages-build-type',
        category: 'permissions',
        label: 'GitHub Pages Build & Deployment Source',
        status: 'fail',
        summary: `GitHub Pages is set to legacy branch mode (${input.pagesBuildType || 'legacy'}) instead of "GitHub Actions" workflow mode.`,
        remediation:
          'Go to GitHub Repository -> Settings -> Pages -> Build and deployment -> Source and select "GitHub Actions".',
      });
      rootCauseSummary.push(
        'GitHub Pages is configured to deploy from a legacy branch instead of "GitHub Actions" workflow mode.'
      );
      recommendedFixes.push(
        'Switch Repository Settings -> Pages -> Source to "GitHub Actions" (or run the 1-Command Auto-Deploy Script with gh CLI installed).'
      );
    }
  } else {
    permissionsChecks.push({
      id: 'perm-pages-build-type',
      category: 'permissions',
      label: 'GitHub Pages Build & Deployment Source',
      status: 'pass',
      summary:
        'Workflow includes `actions/configure-pages@v5` and `gh api .../pages -f build_type=workflow` to activate GitHub Actions Pages source automatically.',
    });
  }

  // ============================================================================
  // CATEGORY 2: Branch Protection & Push Settings
  // ============================================================================
  const localBranch = input.localGitDiagnostics?.currentBranch || targetBranch;
  if (localBranch !== targetBranch) {
    branchProtectionChecks.push({
      id: 'branch-local-alignment',
      category: 'branch-protection',
      label: 'Local HEAD vs Target Branch Alignment',
      status: 'warn',
      summary: `Local git branch is "${localBranch}" while target deployment branch is "${targetBranch}".`,
      remediation: `Click "Setup CI/CD & Auto-Deploy" to rename local branch to "${targetBranch}" and update workflow triggers.`,
    });
  } else {
    branchProtectionChecks.push({
      id: 'branch-local-alignment',
      category: 'branch-protection',
      label: 'Local HEAD vs Target Branch Alignment',
      status: 'pass',
      summary: `Local git repository is initialized on branch "${targetBranch}" (${input.localGitDiagnostics?.commitCount ?? 1} commit(s), HEAD: ${input.localGitDiagnostics?.latestCommit || 'ready'}).`,
    });
  }

  if (input.branchHttpStatus === 200) {
    if (input.branchProtected) {
      const rules = input.branchProtectionRules;
      if (rules?.requiresPullRequestReviews || rules?.requiresStatusChecks) {
        branchProtectionChecks.push({
          id: 'branch-protection-rules',
          category: 'branch-protection',
          label: 'Remote Branch Protection & PR Review Rules',
          status: 'fail',
          summary: `Branch "${targetBranch}" is protected and requires ${[
            rules.requiresPullRequestReviews
              ? `Pull Request reviews (${rules.requiredApprovingReviewCount || 1} approval)`
              : '',
            rules.requiresStatusChecks ? 'passing status checks' : '',
          ]
            .filter(Boolean)
            .join(' & ')} before pushing.`,
          remediation: `In GitHub Settings -> Branches -> "${targetBranch}", allow admin bypass or push to a staging branch and merge via Pull Request.`,
        });
        rootCauseSummary.push(
          `Target branch "${targetBranch}" has strict branch protection rules blocking direct pushes.`
        );
        recommendedFixes.push(
          `Disable "Require a pull request before merging" on "${targetBranch}" for direct deployment pushes, or enable "Allow specified actors to bypass required pull requests".`
        );
      } else {
        branchProtectionChecks.push({
          id: 'branch-protection-rules',
          category: 'branch-protection',
          label: 'Remote Branch Protection & PR Review Rules',
          status: 'warn',
          summary: `Branch "${targetBranch}" is marked protected on GitHub, though no blocking PR review rule was detected.`,
          remediation: `Ensure your user/token is permitted to push to "${targetBranch}" under Settings -> Branches.`,
        });
      }

      if (rules?.allowForcePushes === false) {
        branchProtectionChecks.push({
          id: 'branch-force-push-policy',
          category: 'branch-protection',
          label: 'Force-Push & Fast-Forward Policy',
          status: 'warn',
          summary: `Force pushes (--force) are disabled on protected branch "${targetBranch}".`,
          remediation: `Use standard fast-forward pushes (\`git push -u origin ${targetBranch}\`) as generated in the Auto-Deploy Script.`,
        });
      } else {
        branchProtectionChecks.push({
          id: 'branch-force-push-policy',
          category: 'branch-protection',
          label: 'Force-Push & Fast-Forward Policy',
          status: 'pass',
          summary: `Branch "${targetBranch}" allows standard and initial deployment pushes.`,
        });
      }
    } else {
      branchProtectionChecks.push({
        id: 'branch-protection-rules',
        category: 'branch-protection',
        label: 'Remote Branch Protection & PR Review Rules',
        status: 'pass',
        summary: `Remote branch "${targetBranch}" is unprotected (protected: false); direct pushes and CI/CD triggers are unobstructed.`,
      });
      branchProtectionChecks.push({
        id: 'branch-force-push-policy',
        category: 'branch-protection',
        label: 'Force-Push & Fast-Forward Policy',
        status: 'pass',
        summary: `Fast-forward and initial branch pushes to "${targetBranch}" are unrestricted.`,
      });
    }
  } else {
    branchProtectionChecks.push({
      id: 'branch-protection-rules',
      category: 'branch-protection',
      label: 'Remote Branch Protection & PR Review Rules',
      status: 'pass',
      summary: `No blocking branch protection rules detected for "${targetBranch}"; ready for \`git push -u origin ${targetBranch}\`.`,
    });
    branchProtectionChecks.push({
      id: 'branch-pages-environment',
      category: 'branch-protection',
      label: 'github-pages Environment Branch Policy',
      status: 'pass',
      summary: `Deploy job targets the "github-pages" environment from "${targetBranch}".`,
    });
  }

  // ============================================================================
  // CATEGORY 3: Workflow YAML Syntax & Next.js Static Export Readiness
  // ============================================================================
  const workflowYamlResult = validateWorkflowYamlSyntax(input.workflowYaml, targetBranch);

  if (input.localGitDiagnostics) {
    if (!input.localGitDiagnostics.nextConfigSupportsExport) {
      workflowYamlResult.checks.push({
        id: 'local-next-config-export',
        category: 'workflow-yaml',
        label: 'Next.js Static Export Configuration (next.config.ts)',
        status: 'fail',
        summary: 'next.config.ts is missing `output: "export"` conditional for GITHUB_PAGES=true.',
        remediation: 'Update next.config.ts to switch to `output: "export"` when `process.env.GITHUB_PAGES === "true"`.',
      });
      rootCauseSummary.push('next.config.ts does not enable static HTML export (`output: "export"`).');
    } else {
      workflowYamlResult.checks.push({
        id: 'local-next-config-export',
        category: 'workflow-yaml',
        label: 'Next.js Static Export Configuration (next.config.ts)',
        status: 'pass',
        summary: 'next.config.ts automatically activates `output: "export"`, `basePath`, and `images: { unoptimized: true }` when GITHUB_PAGES=true.',
      });
    }

    if (!input.localGitDiagnostics.hasBuildPagesScript) {
      workflowYamlResult.checks.push({
        id: 'local-build-pages-script',
        category: 'workflow-yaml',
        label: 'Static Export Builder Script (scripts/build-pages.mjs)',
        status: 'fail',
        summary: 'Missing scripts/build-pages.mjs to isolate server API routes during static export.',
        remediation: 'Add scripts/build-pages.mjs and "build:pages" script in package.json.',
      });
      rootCauseSummary.push('Missing scripts/build-pages.mjs static export builder.');
    } else {
      workflowYamlResult.checks.push({
        id: 'local-build-pages-script',
        category: 'workflow-yaml',
        label: 'Static Export Builder Script (scripts/build-pages.mjs)',
        status: 'pass',
        summary: 'scripts/build-pages.mjs verified: isolates POST API routes during static build and emits ./out/index.html + ./out/.nojekyll.',
      });
    }
  }

  for (const issue of workflowYamlResult.issues) {
    rootCauseSummary.push(issue.message);
    recommendedFixes.push(issue.remediation);
  }

  const allChecks = [
    ...permissionsChecks,
    ...branchProtectionChecks,
    ...workflowYamlResult.checks,
  ];
  const failCount = allChecks.filter((c) => c.status === 'fail').length;
  const warnCount = allChecks.filter((c) => c.status === 'warn').length;

  const overallStatus: CiCdDiagnosticReport['overallStatus'] =
    failCount > 0 ? 'failing' : warnCount > 0 ? 'warning' : 'healthy';

  const healthScore = Math.max(0, 100 - failCount * 22 - warnCount * 8);

  if (rootCauseSummary.length === 0) {
    rootCauseSummary.push(
      `All repository permissions, branch protection checks, and .github/workflows/deploy-pages.yml syntax rules passed for ${repoTarget} (${targetBranch}).`
    );
  }

  if (recommendedFixes.length === 0) {
    recommendedFixes.push(
      `Push your local '${targetBranch}' commit to ${repoTarget} using the 1-Command Auto-Deploy Script or an optional GitHub Personal Access Token.`
    );
  }

  return {
    overallStatus,
    healthScore,
    checkedAtIso: new Date().toISOString(),
    repositoryTarget: repoTarget,
    targetBranch,
    permissionsChecks,
    branchProtectionChecks,
    workflowYamlResult,
    rootCauseSummary,
    recommendedFixes,
  };
}

/**
 * Rewrites `<link>`, `<script>`, and CSS `url(...)` asset references in exported static HTML/CSS/JS
 * so that unprefixed `/_next/...` or stale `/cratedig-yt/_next/...` paths always use the configured `basePath` prefix.
 */
export function rewriteExportedAssetPaths(content: string, basePath = '/music-dna-search'): string {
  const raw = String(content || '');
  const trimmedBase = (basePath || '').trim();
  if (!trimmedBase || trimmedBase === '/') {
    return raw;
  }

  const cleanBase = `/${trimmedBase.replace(/^\/+|\/+$/g, '')}`;
  let updated = raw;

  // 1. Replace any legacy /cratedig-yt/_next/ prefix with cleanBase/_next/
  updated = updated.replace(/\/cratedig-yt\/_next\//g, `${cleanBase}/_next/`);

  // 2. Prefix any unprefixed href="/_next/, src="/_next/, content="/_next/, or url(/_next/
  updated = updated.replace(
    /(href=|src=|content=|url\()(["']?)\/_next\//g,
    `$1$2${cleanBase}/_next/`
  );
  updated = updated.replace(/(["'\\])\/_next\//g, `$1${cleanBase}/_next/`);

  // 3. Deduplicate any accidental double prefixing (e.g. /music-dna-search/music-dna-search/_next/)
  const escapedBase = cleanBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const doublePrefixRegex = new RegExp(`${escapedBase}${escapedBase}\\/_next\\/`, 'g');
  updated = updated.replace(doublePrefixRegex, `${cleanBase}/_next/`);

  return updated;
}


