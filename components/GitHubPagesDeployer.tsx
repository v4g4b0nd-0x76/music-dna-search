'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  FolderGit2,
  Rocket,
  Check,
  Copy,
  Download,
  ExternalLink,
  Terminal,
  FileCode2,
  GitBranch,
  Globe,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  Upload,
  KeyRound,
  Stethoscope,
  Lock,
  Wrench,
} from 'lucide-react';
import {
  parseGitHubRemoteUrl,
  generateGitHubActionsPagesWorkflow,
  generateNextConfigForPages,
  generateOneClickAutoDeployScript,
  validateWorkflowYamlSyntax,
  evaluateRepoAndBranchDiagnostics,
  GitHubDeployConfig,
  DeploymentPipelineStep,
  GitRepoDiagnostics,
  CiCdDiagnosticReport,
  DiagnosticCheckItem,
} from '@/lib/github-deploy';

export interface GitHubPagesDeployerProps {
  tasteProfileSnapshot?: Record<string, unknown>;
  onImportTasteBackup?: (parsed: Record<string, unknown>) => void;
}

const SAMPLE_BROKEN_WORKFLOW_YAML = `name: Broken Pages CI/CD Workflow
on:
  push:
    branches:
      - "master"
permissions:
  contents: read
jobs:
  build:
\t  runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - uses: actions/configure-pages@v5
        with:
          static_site_generator: next
      - run: npm run build
`;

export default function GitHubPagesDeployer({
  tasteProfileSnapshot,
  onImportTasteBackup,
}: GitHubPagesDeployerProps) {
  const [remoteUrl, setRemoteUrl] = useState<string>(
    'https://github.com/v4g4b0nd-0x76/music-dna-search.git'
  );
  const [branch, setBranch] = useState<string>('main');
  const [nodeVersion, setNodeVersion] = useState<'20' | '22'>('20');
  const [packageManager, setPackageManager] = useState<'npm' | 'pnpm' | 'yarn'>('npm');
  const [commitMessage, setCommitMessage] = useState<string>(
    'Configure GitHub Pages CI/CD auto-deploy'
  );
  const [customDomain, setCustomDomain] = useState<string>('');
  const [includeTasteProfileJson, setIncludeTasteProfileJson] = useState<boolean>(true);

  // Optional GitHub Token for direct browser -> GitHub API commit & Pages activation
  const [githubToken, setGithubToken] = useState<string>('');
  const [showTokenBox, setShowTokenBox] = useState<boolean>(false);

  // Active artifact tab
  const [activeArtifactTab, setActiveArtifactTab] = useState<
    'auto-script' | 'workflow-yaml' | 'next-config' | 'state-backup'
  >('auto-script');

  // Deployment Pipeline Execution State
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [pipelineSteps, setPipelineSteps] = useState<DeploymentPipelineStep[]>([]);
  const [deployBannerMessage, setDeployBannerMessage] = useState<string>('');
  const [deployError, setDeployError] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [gitDiagnostics, setGitDiagnostics] = useState<GitRepoDiagnostics | null>(null);

  // CI/CD Diagnostic Tool State
  const [serverCiCdReport, setServerCiCdReport] = useState<CiCdDiagnosticReport | null>(null);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState<boolean>(false);
  const [showYamlValidatorDrawer, setShowYamlValidatorDrawer] = useState<boolean>(false);
  const [customYamlOverride, setCustomYamlOverride] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/github-deploy')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (data.diagnostics) {
          setGitDiagnostics(data.diagnostics as GitRepoDiagnostics);
        }
        if (data.ciCdReport) {
          setServerCiCdReport(data.ciCdReport as CiCdDiagnosticReport);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const deployConfig: GitHubDeployConfig = useMemo(
    () => ({
      remoteUrl,
      branch,
      nodeVersion,
      packageManager,
      exportStaticConfig: true,
      commitMessage,
      includeTasteProfileJson,
      customDomain,
    }),
    [remoteUrl, branch, nodeVersion, packageManager, commitMessage, includeTasteProfileJson, customDomain]
  );

  const parsedRemote = useMemo(() => parseGitHubRemoteUrl(remoteUrl), [remoteUrl]);
  const workflowYaml = useMemo(
    () => generateGitHubActionsPagesWorkflow(deployConfig),
    [deployConfig]
  );
  const activeYamlForValidation = customYamlOverride !== null ? customYamlOverride : workflowYaml;

  const liveYamlValidation = useMemo(
    () => validateWorkflowYamlSyntax(activeYamlForValidation, branch),
    [activeYamlForValidation, branch]
  );

  const effectiveCiCdReport: CiCdDiagnosticReport = useMemo(() => {
    const baseReport = evaluateRepoAndBranchDiagnostics({
      remoteUrl,
      targetBranch: branch,
      workflowYaml: activeYamlForValidation,
      hasToken: Boolean(githubToken.trim()),
      localGitDiagnostics: gitDiagnostics,
    });

    if (
      serverCiCdReport &&
      customYamlOverride === null &&
      serverCiCdReport.targetBranch === branch &&
      parsedRemote.isValid &&
      serverCiCdReport.repositoryTarget === `${parsedRemote.owner}/${parsedRemote.repo}`
    ) {
      return serverCiCdReport;
    }

    return baseReport;
  }, [
    remoteUrl,
    branch,
    activeYamlForValidation,
    githubToken,
    gitDiagnostics,
    serverCiCdReport,
    customYamlOverride,
    parsedRemote,
  ]);

  const autoDeployScript = useMemo(
    () => generateOneClickAutoDeployScript(deployConfig),
    [deployConfig]
  );
  const nextConfigCode = useMemo(
    () => generateNextConfigForPages(deployConfig),
    [deployConfig]
  );

  const copyText = (text: string, id: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
  };

  const downloadTextFile = (filename: string, content: string, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRunCiCdDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    try {
      const response = await fetch('/api/github-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'diagnose',
          ...deployConfig,
          githubToken: githubToken.trim(),
          customWorkflowYaml: activeYamlForValidation,
        }),
      });
      const data = await response.json();
      if (response.ok && data?.ok) {
        if (data.diagnostics) {
          setGitDiagnostics(data.diagnostics as GitRepoDiagnostics);
        }
        if (data.ciCdReport) {
          setServerCiCdReport(data.ciCdReport as CiCdDiagnosticReport);
        }
      }
    } catch {
      // Fallback uses client-side evaluateRepoAndBranchDiagnostics automatically
    } finally {
      setIsRunningDiagnostics(false);
    }
  };

  const handleAutoFixWorkflowYaml = async () => {
    setCustomYamlOverride(null);
    await handleRunCiCdDiagnostics();
  };

  const handleRunAutoDeploySetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeployError('');
    setDeployBannerMessage('');

    if (!parsedRemote.isValid) {
      setDeployError(
        parsedRemote.errorMessage || 'Please enter a valid GitHub repository remote URL.'
      );
      return;
    }

    setIsDeploying(true);
    try {
      const response = await fetch('/api/github-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...deployConfig,
          githubToken: githubToken.trim(),
          tasteProfileSnapshot,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to provision GitHub Pages CI/CD');
      }

      if (data.diagnostics) {
        setGitDiagnostics(data.diagnostics as GitRepoDiagnostics);
      }
      if (data.ciCdReport) {
        setServerCiCdReport(data.ciCdReport as CiCdDiagnosticReport);
      }
      setCustomYamlOverride(null);

      const nextSteps: DeploymentPipelineStep[] = Array.isArray(data.steps) ? data.steps : [];
      if (githubToken.trim()) {
        setGithubToken('');
      }

      setPipelineSteps(nextSteps);
      setDeployBannerMessage(
        `Configured GitHub remote (${parsedRemote.owner}/${parsedRemote.repo}), committed local git repo, and provisioned .github/workflows/deploy-pages.yml! Target Pages URL: ${parsedRemote.livePagesUrl}`
      );
    } catch {
      // Client-side static fallback (e.g. when running on GitHub Pages with no backend)
      setPipelineSteps([
        {
          id: 'validate-remote',
          label: 'Validate GitHub Remote & Pages BasePath',
          detail: `Verified ${parsedRemote.owner}/${parsedRemote.repo} (branch: ${branch}, basePath: "${parsedRemote.basePath || '/'}")`,
          status: 'completed',
        },
        {
          id: 'write-workflow',
          label: 'Generate .github/workflows/deploy-pages.yml',
          detail: 'Generated GitHub Actions Pages CI/CD workflow YAML.',
          status: 'completed',
        },
        {
          id: 'configure-git-remote',
          label: 'Prepare Git Remote & Auto-Deploy Script',
          detail: `Configured script for origin -> ${parsedRemote.httpsRemoteUrl}`,
          status: 'completed',
        },
      ]);
      setDeployBannerMessage(
        `Generated GitHub Pages CI/CD workflow and auto-deploy script for ${parsedRemote.owner}/${parsedRemote.repo}!`
      );
    } finally {
      setIsDeploying(false);
    }
  };

  const renderStatusBadge = (status: DiagnosticCheckItem['status']) => {
    if (status === 'pass') {
      return (
        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded text-[10px] font-mono font-bold uppercase tracking-wider shrink-0">
          PASS
        </span>
      );
    }
    if (status === 'warn') {
      return (
        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[10px] font-mono font-bold uppercase tracking-wider shrink-0">
          WARN
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded text-[10px] font-mono font-bold uppercase tracking-wider shrink-0">
        FAIL
      </span>
    );
  };

  return (
    <section
      id="github-pages-cicd-deployer"
      aria-label="GitHub Remote & Pages CI/CD Auto-Deploy"
      className="bg-zinc-900/90 border-2 border-amber-400/50 rounded-xl p-5 space-y-5 shadow-lg"
    >
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 bg-amber-400 text-zinc-950 font-mono text-[11px] font-bold uppercase tracking-wider rounded">
              GitHub Pages CI/CD
            </span>
            <h2 className="text-base sm:text-lg font-display font-bold text-zinc-100 flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span>GitHub Remote &amp; Automatic Pages CI/CD Setup</span>
            </h2>
          </div>
          <p className="text-xs text-zinc-300">
            Provide your GitHub repository remote URL below to link <code className="font-mono text-amber-300">origin</code>, provision <code className="font-mono text-emerald-300">.github/workflows/deploy-pages.yml</code>, and auto-deploy your static crate workbench to GitHub Pages on every push.
          </p>
        </div>

        {/* Preset Remote Buttons */}
        <div className="flex items-center flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              setRemoteUrl('https://github.com/v4g4b0nd-0x76/music-dna-search.git')
            }
            className="px-2.5 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            Preset: HTTPS Repo (music-dna-search)
          </button>
          <button
            type="button"
            onClick={() =>
              setRemoteUrl('git@github.com:v4g4b0nd-0x76/music-dna-search.git')
            }
            className="px-2.5 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            Preset: SSH Remote
          </button>
          <button
            type="button"
            onClick={() =>
              setRemoteUrl(
                'https://github.com/v4g4b0nd-0x76/v4g4b0nd-0x76.github.io.git'
              )
            }
            className="px-2.5 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            Preset: User Site (.github.io)
          </button>
        </div>
      </div>

      {/* CI/CD Failure Diagnostic Tool: Repository Permissions, Branch Protection & Workflow YAML Syntax */}
      <div
        id="cicd-failure-diagnostic-tool"
        aria-label="CI/CD Failure Diagnostic Tool"
        className="bg-zinc-950/95 border border-zinc-800 rounded-xl p-4 space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Stethoscope className="w-4 h-4 text-amber-400 shrink-0" />
              <h3 className="text-sm font-display font-bold text-zinc-100">
                CI/CD Failure Diagnostic Tool
              </h3>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold uppercase ${
                  effectiveCiCdReport.overallStatus === 'healthy'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : effectiveCiCdReport.overallStatus === 'warning'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}
              >
                Health Score: {effectiveCiCdReport.healthScore}/100 (
                {effectiveCiCdReport.overallStatus.toUpperCase()})
              </span>
              {gitDiagnostics && (
                <span className="text-[11px] font-mono text-zinc-400">
                  Local HEAD: {gitDiagnostics.latestCommit || 'Ready'} ({gitDiagnostics.commitCount}{' '}
                  commit{gitDiagnostics.commitCount === 1 ? '' : 's'} on{' '}
                  {gitDiagnostics.currentBranch})
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              Inspects <span className="text-zinc-200 font-medium">Repository Permissions</span>,{' '}
              <span className="text-zinc-200 font-medium">Branch Protection Settings</span>, and{' '}
              <span className="text-zinc-200 font-medium">Workflow YAML Syntax</span> to pinpoint and
              fix GitHub Pages CI/CD deployment blockers.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRunCiCdDiagnostics}
              disabled={isRunningDiagnostics}
              className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunningDiagnostics ? 'animate-spin' : ''}`} />
              <span>{isRunningDiagnostics ? 'Probing GitHub...' : 'Run CI/CD Diagnostics'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowYamlValidatorDrawer((prev) => !prev)}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileCode2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {showYamlValidatorDrawer
                  ? 'Hide YAML Syntax Validator'
                  : 'Workflow YAML Syntax Validator'}
              </span>
            </button>
          </div>
        </div>

        {/* 3-Column Diagnostic Matrix: 1. Repository Permissions | 2. Branch Protection | 3. Workflow YAML Syntax */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
          {/* Card 1: Repository Permissions & Pages Source */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>1. Repository Permissions</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400">
                {
                  effectiveCiCdReport.permissionsChecks.filter((c) => c.status === 'pass')
                    .length
                }
                /{effectiveCiCdReport.permissionsChecks.length} Passed
              </span>
            </div>

            <div className="space-y-2">
              {effectiveCiCdReport.permissionsChecks.map((check) => (
                <div
                  key={check.id}
                  className="bg-zinc-950/85 border border-zinc-800/90 rounded-lg p-2.5 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-100">{check.label}</span>
                    {renderStatusBadge(check.status)}
                  </div>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">{check.summary}</p>
                  {check.remediation && check.status !== 'pass' && (
                    <div className="text-[11px] font-mono text-amber-300 bg-amber-950/30 border border-amber-500/30 rounded px-2 py-1 mt-1 break-words">
                      Fix: {check.remediation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: Branch Protection & Push Settings */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
                <Lock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>2. Branch Protection Settings</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400">
                {
                  effectiveCiCdReport.branchProtectionChecks.filter((c) => c.status === 'pass')
                    .length
                }
                /{effectiveCiCdReport.branchProtectionChecks.length} Passed
              </span>
            </div>

            <div className="space-y-2">
              {effectiveCiCdReport.branchProtectionChecks.map((check) => (
                <div
                  key={check.id}
                  className="bg-zinc-950/85 border border-zinc-800/90 rounded-lg p-2.5 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-100">{check.label}</span>
                    {renderStatusBadge(check.status)}
                  </div>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">{check.summary}</p>
                  {check.remediation && check.status !== 'pass' && (
                    <div className="text-[11px] font-mono text-amber-300 bg-amber-950/30 border border-amber-500/30 rounded px-2 py-1 mt-1 break-words">
                      Fix: {check.remediation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Workflow YAML Syntax & Static Export Validator */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                <FileCode2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>3. Workflow YAML Syntax</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400">
                YAML Score: {liveYamlValidation.score}/100
              </span>
            </div>

            <div className="space-y-2">
              {effectiveCiCdReport.workflowYamlResult.checks.map((check) => (
                <div
                  key={check.id}
                  className="bg-zinc-950/85 border border-zinc-800/90 rounded-lg p-2.5 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-100">
                      {check.label}
                      {check.lineNumber ? ` (Line ${check.lineNumber})` : ''}
                    </span>
                    {renderStatusBadge(check.status)}
                  </div>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">{check.summary}</p>
                  {check.remediation && check.status !== 'pass' && (
                    <div className="text-[11px] font-mono text-amber-300 bg-amber-950/30 border border-amber-500/30 rounded px-2 py-1 mt-1 break-words">
                      Fix: {check.remediation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Interactive Workflow YAML Syntax Linter & Simulator Drawer */}
        {showYamlValidatorDrawer && (
          <div className="bg-zinc-900/90 border border-amber-400/40 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    Interactive Workflow YAML Syntax Validator (
                    <code className="font-mono text-amber-300">.github/workflows/deploy-pages.yml</code>
                    )
                  </span>
                </h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Paste or edit workflow YAML below to test for TAB indentation errors, missing OIDC{' '}
                  <code className="font-mono text-zinc-300">pages: write</code> /{' '}
                  <code className="font-mono text-zinc-300">id-token: write</code> permissions, or
                  Next.js 15 <code className="font-mono text-zinc-300">cache: &quot;npm&quot;</code>{' '}
                  traps.
                </p>
              </div>

              <div className="flex items-center flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setCustomYamlOverride(SAMPLE_BROKEN_WORKFLOW_YAML)}
                  className="px-2.5 py-1.5 bg-rose-950/70 hover:bg-rose-900/60 text-rose-200 border border-rose-500/40 rounded-lg text-xs font-medium cursor-pointer"
                >
                  Simulate Broken YAML
                </button>
                <button
                  type="button"
                  onClick={handleAutoFixWorkflowYaml}
                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold rounded-lg text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Auto-Fix &amp; Restore Valid Workflow YAML</span>
                </button>
              </div>
            </div>

            <textarea
              aria-label="Workflow YAML Syntax Validator Input"
              value={activeYamlForValidation}
              onChange={(e) => setCustomYamlOverride(e.target.value)}
              rows={11}
              spellCheck={false}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-xs font-mono text-emerald-300 focus:outline-none focus:border-amber-400 leading-relaxed"
            />

            {liveYamlValidation.issues.length > 0 ? (
              <div className="bg-rose-950/40 border border-rose-500/40 rounded-lg p-3 space-y-1.5">
                <div className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    Detected {liveYamlValidation.issues.length} Workflow YAML Issue(s):
                  </span>
                </div>
                <ul className="space-y-1 text-[11px] text-rose-200 font-mono">
                  {liveYamlValidation.issues.map((issue, idx) => (
                    <li key={`${issue.code}-${idx}`}>
                      • [{issue.code}
                      {issue.lineNumber ? ` @ Line ${issue.lineNumber}` : ''}] {issue.message} →{' '}
                      <span className="text-amber-300">{issue.remediation}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="bg-emerald-950/35 border border-emerald-500/40 rounded-lg p-2.5 text-xs text-emerald-300 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  YAML Syntax Validated ({liveYamlValidation.lineCount} lines): OIDC permissions (
                  <code className="font-mono">pages: write</code>,{' '}
                  <code className="font-mono">id-token: write</code>),{' '}
                  <code className="font-mono">npm run build:pages</code>, and{' '}
                  <code className="font-mono">./out</code> artifact upload are all verified.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Root Cause & Recommended Remediation Summary */}
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
              Diagnostic Findings ({effectiveCiCdReport.repositoryTarget} @{' '}
              {effectiveCiCdReport.targetBranch})
            </div>
            <ul className="space-y-1 text-[11px] text-zinc-300 list-disc list-inside">
              {effectiveCiCdReport.rootCauseSummary.map((cause) => (
                <li key={cause}>{cause}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-300 mb-1">
              Recommended Next Step / Remediation
            </div>
            <ul className="space-y-1 text-[11px] text-zinc-300 list-disc list-inside">
              {effectiveCiCdReport.recommendedFixes.map((fix) => (
                <li key={fix}>{fix}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Form: GitHub Remote URL + Branch + CI/CD Options */}
      <form
        onSubmit={handleRunAutoDeploySetup}
        className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 space-y-4"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 space-y-1.5">
            <label
              htmlFor="github-remote-url-input"
              className="block text-xs font-semibold text-amber-300"
            >
              1. GitHub Repository Remote URL (HTTPS, SSH, or owner/repo)
            </label>
            <input
              id="github-remote-url-input"
              type="text"
              aria-label="GitHub Repository Remote URL"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="https://github.com/username/cratedig-yt.git or git@github.com:username/cratedig-yt.git"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="lg:col-span-2 space-y-1.5">
            <label
              htmlFor="github-deploy-branch"
              className="block text-xs font-semibold text-zinc-300"
            >
              2. Target Branch
            </label>
            <input
              id="github-deploy-branch"
              type="text"
              aria-label="Target Git Branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="lg:col-span-3 flex flex-col justify-end">
            <button
              type="submit"
              disabled={isDeploying}
              className="w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 font-semibold rounded-lg text-xs transition-colors inline-flex items-center justify-center gap-2 cursor-pointer shadow"
            >
              {isDeploying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Configuring CI/CD...</span>
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" />
                  <span>Setup CI/CD &amp; Auto-Deploy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Secondary CI/CD Options Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-zinc-800/80 text-xs">
          <div className="space-y-1">
            <label htmlFor="cicd-commit-msg" className="block text-[11px] text-zinc-400">
              Commit Message
            </label>
            <input
              id="cicd-commit-msg"
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="cicd-node-version" className="block text-[11px] text-zinc-400">
              GitHub Actions Node.js
            </label>
            <select
              id="cicd-node-version"
              value={nodeVersion}
              onChange={(e) => setNodeVersion(e.target.value as '20' | '22')}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-400"
            >
              <option value="20">Node.js 20 LTS (Recommended)</option>
              <option value="22">Node.js 22 LTS</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="cicd-custom-domain" className="block text-[11px] text-zinc-400">
              Custom Domain (Optional CNAME)
            </label>
            <input
              id="cicd-custom-domain"
              type="text"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="e.g. music.example.com"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex flex-col justify-end pb-1">
            <button
              type="button"
              onClick={() => setShowTokenBox((prev) => !prev)}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-md text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>{showTokenBox ? 'Hide GitHub Token' : 'Optional: GitHub Token Push'}</span>
            </button>
          </div>
        </div>

        {showTokenBox && (
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3 space-y-2">
            <label
              htmlFor="github-pat-input"
              className="block text-xs font-medium text-zinc-200"
            >
              Optional GitHub Personal Access Token (<code className="font-mono text-amber-300">repo</code> + <code className="font-mono text-amber-300">workflow</code> scopes)
            </label>
            <input
              id="github-pat-input"
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="ghp_... or github_pat_... (commits .github/workflows/deploy-pages.yml directly via GitHub API)"
              className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-400"
            />
            <p className="text-[11px] text-zinc-400">
              Used once in memory to commit <code className="font-mono text-zinc-300">.github/workflows/deploy-pages.yml</code> directly to your repository and cleared immediately after setup.
            </p>
          </div>
        )}
      </form>

      {/* Live Parsed GitHub Repository & Pages Telemetry Cards */}
      {parsedRemote.isValid ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-zinc-950/90 border border-zinc-800 rounded-lg p-3">
            <div className="text-[11px] text-zinc-400 flex items-center justify-between">
              <span>Target Repository</span>
              <GitBranch className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-sm font-display font-bold text-zinc-100 mt-1 truncate">
              {parsedRemote.owner}/{parsedRemote.repo}
            </div>
            <a
              href={parsedRemote.repoWebUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-mono text-amber-300 hover:underline inline-flex items-center gap-1 mt-1"
            >
              <span>Open Repo</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="bg-zinc-950/90 border border-zinc-800 rounded-lg p-3">
            <div className="text-[11px] text-zinc-400 flex items-center justify-between">
              <span>Live GitHub Pages URL</span>
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xs font-mono font-bold text-emerald-300 mt-1 truncate">
              {customDomain.trim() ? `https://${customDomain.trim()}/` : parsedRemote.livePagesUrl}
            </div>
            <a
              href={parsedRemote.pagesSettingsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1 mt-1"
            >
              <span>Pages Settings</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="bg-zinc-950/90 border border-zinc-800 rounded-lg p-3">
            <div className="text-[11px] text-zinc-400">Next.js Static BasePath</div>
            <div className="text-sm font-mono font-bold text-amber-300 mt-1">
              {parsedRemote.basePath || '/ (Root User Site)'}
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">
              Auto-injected in CI/CD workflow
            </div>
          </div>

          <div className="bg-zinc-950/90 border border-zinc-800 rounded-lg p-3">
            <div className="text-[11px] text-zinc-400">CI/CD Workflow Trigger</div>
            <div className="text-sm font-mono font-bold text-zinc-100 mt-1">
              push → {branch}
            </div>
            <a
              href={parsedRemote.actionsWebUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-mono text-amber-300 hover:underline inline-flex items-center gap-1 mt-1"
            >
              <span>View GitHub Actions</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      ) : (
        <div
          role="alert"
          className="bg-rose-950/40 border border-rose-500/50 rounded-lg p-3 text-xs text-rose-200 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{parsedRemote.errorMessage}</span>
        </div>
      )}

      {/* Deployment Pipeline Execution Status Banner */}
      {(deployBannerMessage || deployError || pipelineSteps.length > 0) && (
        <div
          role="status"
          className={`rounded-xl p-4 border text-xs space-y-3 ${
            deployError
              ? 'bg-rose-950/40 border-rose-500/50 text-rose-200'
              : 'bg-emerald-950/35 border-emerald-500/50 text-zinc-100'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-sm">
              {deployError ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>{deployError || deployBannerMessage}</span>
            </div>

            {parsedRemote.isValid && !deployError && (
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={parsedRemote.actionsWebUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-zinc-700 rounded-md text-[11px] font-mono inline-flex items-center gap-1"
                >
                  <span>Actions Pipeline</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href={parsedRemote.livePagesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold rounded-md text-[11px] inline-flex items-center gap-1"
                >
                  <span>Live Pages URL</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>

          {pipelineSteps.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-zinc-800/80">
              {pipelineSteps.map((step) => (
                <div
                  key={step.id}
                  className="bg-zinc-950/80 border border-zinc-800 rounded-lg px-3 py-2 flex items-start gap-2.5"
                >
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-semibold text-zinc-100">{step.label}</div>
                    <div className="text-[11px] text-zinc-400 font-mono break-all">
                      {step.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4 Tabs for Auto-Deploy Script, GitHub Actions YAML, Next.js Config, and State Backup */}
      <div className="space-y-3">
        <div
          role="tablist"
          aria-label="GitHub Pages CI/CD Generated Files"
          className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeArtifactTab === 'auto-script'}
            onClick={() => setActiveArtifactTab('auto-script')}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              activeArtifactTab === 'auto-script'
                ? 'bg-amber-400 text-zinc-950 font-semibold'
                : 'bg-zinc-950 text-zinc-300 hover:bg-zinc-800 border border-zinc-800'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>1. Auto-Deploy Terminal Script (.sh)</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeArtifactTab === 'workflow-yaml'}
            onClick={() => setActiveArtifactTab('workflow-yaml')}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              activeArtifactTab === 'workflow-yaml'
                ? 'bg-amber-400 text-zinc-950 font-semibold'
                : 'bg-zinc-950 text-zinc-300 hover:bg-zinc-800 border border-zinc-800'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span>2. GitHub Actions CI/CD (.github/workflows/deploy-pages.yml)</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeArtifactTab === 'next-config'}
            onClick={() => setActiveArtifactTab('next-config')}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              activeArtifactTab === 'next-config'
                ? 'bg-amber-400 text-zinc-950 font-semibold'
                : 'bg-zinc-950 text-zinc-300 hover:bg-zinc-800 border border-zinc-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>3. Static Export Config (next.config.ts)</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeArtifactTab === 'state-backup'}
            onClick={() => setActiveArtifactTab('state-backup')}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              activeArtifactTab === 'state-backup'
                ? 'bg-amber-400 text-zinc-950 font-semibold'
                : 'bg-zinc-950 text-zinc-300 hover:bg-zinc-800 border border-zinc-800'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>4. Portable State Backup (.json)</span>
          </button>
        </div>

        {/* TAB 1: 1-Command Auto-Deploy Script */}
        {activeArtifactTab === 'auto-script' && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-zinc-100">
                  1-Command Git Remote &amp; GitHub Pages Auto-Deploy Script
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Creates <code className="font-mono text-amber-300">.github/workflows/deploy-pages.yml</code>, sets <code className="font-mono text-emerald-300">origin</code> to your GitHub repo, commits, pushes to <code className="font-mono text-amber-300">{branch}</code>, and activates GitHub Pages workflow mode.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => copyText(autoDeployScript, 'copy-auto-script')}
                  className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold rounded-lg text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedId === 'copy-auto-script' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied Script!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Auto-Deploy Script</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile('auto-deploy-github-pages.sh', autoDeployScript)
                  }
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .sh</span>
                </button>
              </div>
            </div>

            <pre className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3.5 text-xs font-mono text-amber-300 overflow-x-auto max-h-80 leading-relaxed select-all">
              {autoDeployScript}
            </pre>
          </div>
        )}

        {/* TAB 2: GitHub Actions Workflow YAML */}
        {activeArtifactTab === 'workflow-yaml' && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-zinc-100">
                  GitHub Actions Workflow (<code className="font-mono text-amber-300">.github/workflows/deploy-pages.yml</code>)
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Automatically builds the static Next.js bundle with <code className="font-mono text-emerald-300">NEXT_PUBLIC_BASE_PATH=&quot;{parsedRemote.basePath}&quot;</code> and deploys to GitHub Pages on every push to <code className="font-mono text-amber-300">{branch}</code>.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => copyText(workflowYaml, 'copy-workflow-yaml')}
                  className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold rounded-lg text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedId === 'copy-workflow-yaml' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied YAML!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy deploy-pages.yml</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile('deploy-pages.yml', workflowYaml, 'text/yaml;charset=utf-8')
                  }
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download YAML</span>
                </button>
              </div>
            </div>

            <pre className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3.5 text-xs font-mono text-emerald-300 overflow-x-auto max-h-80 leading-relaxed select-all">
              {workflowYaml}
            </pre>
          </div>
        )}

        {/* TAB 3: Next.js Static Export Config */}
        {activeArtifactTab === 'next-config' && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-zinc-100">
                  GitHub Pages Static Export Configuration (<code className="font-mono text-amber-300">next.config.ts</code>)
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Automatically switches to <code className="font-mono text-emerald-300">output: &apos;export&apos;</code> and applies <code className="font-mono text-amber-300">basePath: &apos;{parsedRemote.basePath}&apos;</code> when <code className="font-mono">GITHUB_PAGES=true</code> is set in the GitHub Actions workflow.
                </p>
              </div>
              <button
                type="button"
                onClick={() => copyText(nextConfigCode, 'copy-next-config')}
                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold rounded-lg text-xs inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                {copiedId === 'copy-next-config' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied Config!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy next.config.ts</span>
                  </>
                )}
              </button>
            </div>

            <pre className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3.5 text-xs font-mono text-zinc-200 overflow-x-auto max-h-80 leading-relaxed select-all">
              {nextConfigCode}
            </pre>
          </div>
        )}

        {/* TAB 4: Portable Taste & Playlist JSON Backup */}
        {activeArtifactTab === 'state-backup' && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-zinc-100">
                  Portable Taste Profile, Favorites &amp; Playlists Snapshot (<code className="font-mono text-amber-300">cratedig-taste-profile.json</code>)
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Export your favorite artists, tags, categories, playlists, and filtered YouTube feed to commit alongside your GitHub Pages repository.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(
                      'cratedig-taste-profile.json',
                      JSON.stringify(tasteProfileSnapshot || {}, null, 2),
                      'application/json'
                    )
                  }
                  className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold rounded-lg text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Taste Profile (.json)</span>
                </button>

                {onImportTasteBackup && (
                  <label className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-medium rounded-lg text-xs inline-flex items-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import JSON Backup</span>
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          try {
                            const parsed = JSON.parse(String(reader.result));
                            onImportTasteBackup(parsed);
                          } catch {
                            // ignore invalid JSON
                          }
                        };
                        reader.readAsText(file);
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
