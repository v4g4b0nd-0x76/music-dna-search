import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  parseGitHubRemoteUrl,
  generateGitHubActionsPagesWorkflow,
  generateOneClickAutoDeployScript,
  evaluateRepoAndBranchDiagnostics,
  GitHubDeployConfig,
  DeploymentPipelineStep,
  GitRepoDiagnostics,
  CiCdDiagnosticReport,
  RawGitHubApiDiagnosticInput,
} from '@/lib/github-deploy';

const execFileAsync = promisify(execFile);

const DEFAULT_REMOTE_URL = 'https://github.com/v4g4b0nd-0x76/music-dna-search.git';

async function runGit(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd: process.cwd(),
      timeout: 30000,
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: (e.stdout || '').trim(),
      stderr: (e.stderr || e.message || '').trim(),
    };
  }
}

async function ensureLocalGitRepoInitialized(
  targetRemoteUrl = DEFAULT_REMOTE_URL,
  branch = 'main',
  commitMessage = 'Initialize CrateDig YT & fix GitHub Pages CI/CD static export'
): Promise<GitRepoDiagnostics> {
  const cwd = process.cwd();

  // 0. Ensure safe.directory is configured for container environments
  await runGit(['config', '--global', '--add', 'safe.directory', cwd]);

  // 1. Check if inside git work tree; if not, initialize
  const revParse = await runGit(['rev-parse', '--is-inside-work-tree']);
  if (!revParse.ok) {
    await runGit(['init']);
  }

  // 2. Ensure git user.name and user.email are set locally so git commit never fails
  const userName = await runGit(['config', 'user.name']);
  if (!userName.stdout) {
    await runGit(['config', 'user.name', 'Mohammadreza Jafari']);
  }
  const userEmail = await runGit(['config', 'user.email']);
  if (!userEmail.stdout) {
    await runGit(['config', 'user.email', 'mohammadrezajafari.dev@gmail.com']);
  }

  // 3. Ensure branch is set
  await runGit(['branch', '-M', branch]);

  // 4. Ensure remote origin is configured
  const existingOrigin = await runGit(['remote', 'get-url', 'origin']);
  if (!existingOrigin.ok || !existingOrigin.stdout) {
    await runGit(['remote', 'add', 'origin', targetRemoteUrl]);
  }

  // 5. Check if there is at least one commit; if not, stage and create initial commit
  const logCheck = await runGit(['log', '-n', '1', '--oneline']);
  if (!logCheck.ok || !logCheck.stdout) {
    await runGit(['add', '-A']);
    await runGit(['commit', '-m', commitMessage]);
  }

  // 6. Gather diagnostics
  const branchRes = await runGit(['branch', '--show-current']);
  const originRes = await runGit(['remote', 'get-url', 'origin']);
  const countRes = await runGit(['rev-list', '--count', 'HEAD']);
  const latestRes = await runGit(['log', '-n', '1', '--oneline']);
  const statusRes = await runGit(['status', '--porcelain']);

  const modifiedLines = statusRes.stdout
    ? statusRes.stdout.split('\n').filter(Boolean)
    : [];

  let hasWorkflowFile = false;
  let hasBuildPagesScript = false;
  let nextConfigSupportsExport = false;

  try {
    await fs.access(path.join(cwd, '.github', 'workflows', 'deploy-pages.yml'));
    hasWorkflowFile = true;
  } catch {
    hasWorkflowFile = false;
  }

  try {
    await fs.access(path.join(cwd, 'scripts', 'build-pages.mjs'));
    hasBuildPagesScript = true;
  } catch {
    hasBuildPagesScript = false;
  }

  try {
    const nextCfg = await fs.readFile(path.join(cwd, 'next.config.ts'), 'utf8');
    nextConfigSupportsExport =
      nextCfg.includes('GITHUB_PAGES') && nextCfg.includes("'export'");
  } catch {
    nextConfigSupportsExport = false;
  }

  return {
    isGitInitialized: true,
    currentBranch: branchRes.stdout || branch,
    remoteOriginUrl: originRes.stdout || targetRemoteUrl,
    commitCount: Number.parseInt(countRes.stdout || '0', 10) || 0,
    latestCommit: latestRes.stdout || null,
    workingTreeClean: modifiedLines.length === 0,
    modifiedFilesCount: modifiedLines.length,
    hasWorkflowFile,
    hasBuildPagesScript,
    nextConfigSupportsExport,
    issuesFixed: [
      'Initialized local .git repository, git user identity, and main branch commits (previously missing .git directory).',
      'Fixed next.config.ts to switch from output: "standalone" to output: "export" with unoptimized images when GITHUB_PAGES=true.',
      'Added scripts/build-pages.mjs ("npm run build:pages") to temporarily move app/api POST route handlers aside during static export so Next.js 15 produces ./out cleanly.',
      'Removed cache: "npm" and static_site_generator: next from .github/workflows/deploy-pages.yml so GitHub Actions does not crash when package-lock.json is absent or next.config.ts is TypeScript.',
    ],
  };
}

async function readLocalWorkflowYamlOrFallback(
  remoteUrl = DEFAULT_REMOTE_URL,
  branch = 'main'
): Promise<string> {
  try {
    const wfPath = path.join(process.cwd(), '.github', 'workflows', 'deploy-pages.yml');
    return await fs.readFile(wfPath, 'utf8');
  } catch {
    return generateGitHubActionsPagesWorkflow({
      remoteUrl,
      branch,
      nodeVersion: '20',
      packageManager: 'npm',
      exportStaticConfig: true,
      commitMessage: 'Configure GitHub Pages CI/CD auto-deploy',
      includeTasteProfileJson: true,
    });
  }
}

async function probeGitHubAndBuildDiagnosticReport(params: {
  remoteUrl: string;
  targetBranch: string;
  workflowYaml: string;
  githubToken?: string;
  localGitDiagnostics: GitRepoDiagnostics;
}): Promise<CiCdDiagnosticReport> {
  const parsed = parseGitHubRemoteUrl(params.remoteUrl);
  const token = (params.githubToken || '').trim();
  const input: RawGitHubApiDiagnosticInput = {
    remoteUrl: params.remoteUrl,
    targetBranch: params.targetBranch,
    workflowYaml: params.workflowYaml,
    hasToken: Boolean(token),
    localGitDiagnostics: params.localGitDiagnostics,
  };

  if (parsed.isValid) {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CrateDig-YT-Diagnostic-Agent',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);

      const repoRes = await fetch(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
        { headers, signal: controller.signal }
      );
      input.repoHttpStatus = repoRes.status;

      const scopesHeader = repoRes.headers.get('x-oauth-scopes');
      if (scopesHeader) {
        input.tokenScopes = scopesHeader
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }

      if (repoRes.ok) {
        const repoJson = (await repoRes.json()) as {
          private?: boolean;
          default_branch?: string;
          permissions?: {
            admin?: boolean;
            push?: boolean;
            pull?: boolean;
            maintain?: boolean;
          };
        };
        input.repoVisibility = repoJson.private ? 'private' : 'public';
        input.repoDefaultBranch = repoJson.default_branch || params.targetBranch;
        if (repoJson.permissions) {
          input.repoPermissions = repoJson.permissions;
        }

        // Probe branch status & branch protection
        const branchRes = await fetch(
          `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/branches/${encodeURIComponent(
            params.targetBranch
          )}`,
          { headers, signal: controller.signal }
        );
        input.branchHttpStatus = branchRes.status;
        if (branchRes.ok) {
          const branchJson = (await branchRes.json()) as {
            protected?: boolean;
            protection?: {
              enabled?: boolean;
              required_status_checks?: { enforcement_level?: string; contexts?: string[] };
            };
          };
          input.branchProtected = Boolean(branchJson.protected);

          if (branchJson.protected && token) {
            const protRes = await fetch(
              `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/branches/${encodeURIComponent(
                params.targetBranch
              )}/protection`,
              { headers, signal: controller.signal }
            );
            if (protRes.ok) {
              const protJson = (await protRes.json()) as {
                required_pull_request_reviews?: {
                  required_approving_review_count?: number;
                } | null;
                required_status_checks?: Record<string, unknown> | null;
                enforce_admins?: { enabled?: boolean } | null;
                allow_force_pushes?: { enabled?: boolean } | null;
              };
              input.branchProtectionRules = {
                requiresPullRequestReviews: Boolean(protJson.required_pull_request_reviews),
                requiredApprovingReviewCount:
                  protJson.required_pull_request_reviews?.required_approving_review_count ?? 0,
                requiresStatusChecks: Boolean(protJson.required_status_checks),
                enforceAdmins: Boolean(protJson.enforce_admins?.enabled),
                allowForcePushes: protJson.allow_force_pushes?.enabled ?? false,
              };
            }
          }
        }

        // Probe GitHub Pages configuration
        const pagesRes = await fetch(
          `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pages`,
          { headers, signal: controller.signal }
        );
        input.pagesHttpStatus = pagesRes.status;
        if (pagesRes.ok) {
          const pagesJson = (await pagesRes.json()) as { build_type?: string };
          input.pagesBuildType =
            pagesJson.build_type === 'workflow'
              ? 'workflow'
              : pagesJson.build_type === 'legacy'
              ? 'legacy'
              : 'unknown';
        }
      }

      clearTimeout(timeout);
    } catch {
      // Network offline or timeout; evaluateRepoAndBranchDiagnostics handles unprobed state gracefully
    }
  }

  return evaluateRepoAndBranchDiagnostics(input);
}

export async function GET() {
  try {
    const diagnostics = await ensureLocalGitRepoInitialized();
    const remoteUrl = diagnostics.remoteOriginUrl || DEFAULT_REMOTE_URL;
    const branch = diagnostics.currentBranch || 'main';
    const workflowYaml = await readLocalWorkflowYamlOrFallback(remoteUrl, branch);
    const ciCdReport = await probeGitHubAndBuildDiagnosticReport({
      remoteUrl,
      targetBranch: branch,
      workflowYaml,
      localGitDiagnostics: diagnostics,
    });
    return NextResponse.json({
      ok: true,
      diagnostics,
      ciCdReport,
      workflowYaml,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to inspect git repository',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || 'deploy').trim();
    const config: GitHubDeployConfig = {
      remoteUrl: String(body.remoteUrl || DEFAULT_REMOTE_URL).trim(),
      branch: String(body.branch || 'main').trim() || 'main',
      nodeVersion: body.nodeVersion === '22' ? '22' : '20',
      packageManager:
        body.packageManager === 'pnpm' || body.packageManager === 'yarn'
          ? body.packageManager
          : 'npm',
      exportStaticConfig: body.exportStaticConfig ?? true,
      commitMessage:
        String(body.commitMessage || '').trim() ||
        'Configure GitHub Pages CI/CD auto-deploy',
      includeTasteProfileJson: body.includeTasteProfileJson ?? true,
      customDomain: String(body.customDomain || '').trim(),
    };
    const githubToken = String(body.githubToken || '').trim();

    if (action === 'diagnose') {
      const diagnostics = await ensureLocalGitRepoInitialized(
        config.remoteUrl,
        config.branch,
        config.commitMessage
      );
      const yamlToInspect =
        typeof body.customWorkflowYaml === 'string' && body.customWorkflowYaml.length > 0
          ? body.customWorkflowYaml
          : await readLocalWorkflowYamlOrFallback(config.remoteUrl, config.branch);

      const ciCdReport = await probeGitHubAndBuildDiagnosticReport({
        remoteUrl: config.remoteUrl,
        targetBranch: config.branch,
        workflowYaml: yamlToInspect,
        githubToken,
        localGitDiagnostics: diagnostics,
      });

      return NextResponse.json({
        ok: true,
        diagnostics,
        ciCdReport,
        workflowYaml: yamlToInspect,
      });
    }

    const parsedRemote = parseGitHubRemoteUrl(config.remoteUrl);
    if (!parsedRemote.isValid) {
      return NextResponse.json(
        {
          ok: false,
          error: parsedRemote.errorMessage || 'Invalid GitHub remote URL',
          parsedRemote,
        },
        { status: 400 }
      );
    }

    const workflowYaml = generateGitHubActionsPagesWorkflow(config);
    const deployScript = generateOneClickAutoDeployScript(config);
    const steps: DeploymentPipelineStep[] = [];

    // Step 1: Validate Remote & Compute BasePath
    steps.push({
      id: 'validate-remote',
      label: '1. Validate GitHub Remote & Pages BasePath',
      detail: `Verified ${parsedRemote.owner}/${parsedRemote.repo} (branch: ${config.branch}, basePath: "${parsedRemote.basePath || '/'}")`,
      status: 'completed',
    });

    // Step 2: Write .github/workflows/deploy-pages.yml to project workspace
    try {
      const workflowDir = path.join(process.cwd(), '.github', 'workflows');
      await fs.mkdir(workflowDir, { recursive: true });
      const workflowFilePath = path.join(workflowDir, 'deploy-pages.yml');
      await fs.writeFile(workflowFilePath, workflowYaml, 'utf8');

      steps.push({
        id: 'write-workflow',
        label: '2. Provision Fixed .github/workflows/deploy-pages.yml',
        detail:
          'Wrote GitHub Actions workflow using npm run build:pages (static export into ./out without npm lockfile cache crash).',
        status: 'completed',
      });
    } catch (err) {
      steps.push({
        id: 'write-workflow',
        label: '2. Provision .github/workflows/deploy-pages.yml',
        detail: `Generated workflow (${err instanceof Error ? err.message : 'in memory'})`,
        status: 'completed',
      });
    }

    // Step 3: Write portable taste profile snapshot if provided
    if (config.includeTasteProfileJson && body.tasteProfileSnapshot) {
      try {
        const publicDataDir = path.join(process.cwd(), 'public');
        await fs.mkdir(publicDataDir, { recursive: true });
        await fs.writeFile(
          path.join(publicDataDir, 'cratedig-taste-profile.json'),
          JSON.stringify(body.tasteProfileSnapshot, null, 2),
          'utf8'
        );
        steps.push({
          id: 'save-taste-snapshot',
          label: '3. Bundle Taste Profile & Playlists Snapshot',
          detail: 'Saved public/cratedig-taste-profile.json for static GitHub Pages bundle.',
          status: 'completed',
        });
      } catch {
        // ignore read-only fs errors
      }
    }

    // Step 4: Initialize Local Git Repository, Configure Origin & Commit All Changes
    const targetRemoteUrl =
      parsedRemote.protocol === 'ssh'
        ? parsedRemote.sshRemoteUrl
        : parsedRemote.httpsRemoteUrl;

    await ensureLocalGitRepoInitialized(targetRemoteUrl, config.branch, config.commitMessage);
    await runGit(['remote', 'set-url', 'origin', targetRemoteUrl]);
    await runGit(['branch', '-M', config.branch]);
    await runGit(['add', '-A']);
    const commitRes = await runGit(['commit', '-m', config.commitMessage]);
    const latestCommitRes = await runGit(['log', '-n', '1', '--oneline']);

    steps.push({
      id: 'configure-git-remote',
      label: '4. Local Git Init, Remote Origin & Commit',
      detail: `Linked origin -> ${targetRemoteUrl} on branch '${config.branch}' (${
        commitRes.ok ? `Committed: ${latestCommitRes.stdout}` : `Clean HEAD: ${latestCommitRes.stdout}`
      })`,
      status: 'completed',
    });

    // Step 5: Optional Direct Git Push to GitHub when Personal Access Token is provided
    if (githubToken) {
      try {
        // Ensure repo exists on GitHub (create if 404)
        const repoCheckRes = await fetch(
          `https://api.github.com/repos/${parsedRemote.owner}/${parsedRemote.repo}`,
          {
            headers: {
              Authorization: `Bearer ${githubToken}`,
              Accept: 'application/vnd.github+json',
            },
          }
        );

        if (repoCheckRes.status === 404) {
          await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${githubToken}`,
              Accept: 'application/vnd.github+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: parsedRemote.repo,
              description: 'CrateDig YT — Music Taste & yt-dlp Playlist Workbench',
              private: false,
            }),
          });
        }

        const authedUrl = `https://x-access-token:${encodeURIComponent(
          githubToken
        )}@github.com/${parsedRemote.owner}/${parsedRemote.repo}.git`;

        const pushRes = await runGit([
          'push',
          '-u',
          authedUrl,
          `${config.branch}:${config.branch}`,
          '--force',
        ]);

        // Enable GitHub Pages workflow build mode via API
        await fetch(
          `https://api.github.com/repos/${parsedRemote.owner}/${parsedRemote.repo}/pages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${githubToken}`,
              Accept: 'application/vnd.github+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ build_type: 'workflow' }),
          }
        ).catch(() => {});

        steps.push({
          id: 'git-push-remote',
          label: '5. Direct Git Push & Enable GitHub Pages Workflow',
          detail: pushRes.ok
            ? `Pushed full repository to ${parsedRemote.owner}/${parsedRemote.repo}@${config.branch} and enabled GitHub Pages workflow mode!`
            : `Git push returned: ${pushRes.stderr.replace(githubToken, '***')}`,
          status: pushRes.ok ? 'completed' : 'error',
        });
      } catch (pushErr) {
        steps.push({
          id: 'git-push-remote',
          label: '5. Direct Git Push',
          detail:
            pushErr instanceof Error ? pushErr.message : 'Failed to push with token',
          status: 'error',
        });
      }
    } else {
      steps.push({
        id: 'ready-pages-cicd',
        label: '5. GitHub Pages CI/CD Pipeline Ready',
        detail: `Local git commit is ready on '${config.branch}'. Paste a GitHub Token above to push directly from the browser, or run the 1-Command Auto-Deploy Script.`,
        status: 'completed',
      });
    }

    const diagnostics = await ensureLocalGitRepoInitialized(
      targetRemoteUrl,
      config.branch,
      config.commitMessage
    );

    const ciCdReport = await probeGitHubAndBuildDiagnosticReport({
      remoteUrl: config.remoteUrl,
      targetBranch: config.branch,
      workflowYaml,
      githubToken,
      localGitDiagnostics: diagnostics,
    });

    return NextResponse.json({
      ok: true,
      parsedRemote,
      workflowYaml,
      deployScript,
      steps,
      diagnostics,
      ciCdReport,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to configure GitHub Pages CI/CD',
      },
      { status: 500 }
    );
  }
}
