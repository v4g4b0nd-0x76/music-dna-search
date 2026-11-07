import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGitHubRemoteUrl,
  generateGitHubActionsPagesWorkflow,
  generateNextConfigForPages,
  generateOneClickAutoDeployScript,
  validateWorkflowYamlSyntax,
  evaluateRepoAndBranchDiagnostics,
} from './github-deploy';

test('parseGitHubRemoteUrl parses HTTPS, SSH, and owner/repo shorthand remotes accurately', () => {
  const httpsParsed = parseGitHubRemoteUrl('https://github.com/mohammadrezajafari/cratedig-yt.git');
  assert.equal(httpsParsed.isValid, true);
  assert.equal(httpsParsed.protocol, 'https');
  assert.equal(httpsParsed.owner, 'mohammadrezajafari');
  assert.equal(httpsParsed.repo, 'cratedig-yt');
  assert.equal(httpsParsed.basePath, '/cratedig-yt');
  assert.equal(
    httpsParsed.livePagesUrl,
    'https://mohammadrezajafari.github.io/cratedig-yt/'
  );
  assert.equal(
    httpsParsed.actionsWebUrl,
    'https://github.com/mohammadrezajafari/cratedig-yt/actions'
  );

  const sshParsed = parseGitHubRemoteUrl('git@github.com:mohammadrezajafari/music-crate.git');
  assert.equal(sshParsed.isValid, true);
  assert.equal(sshParsed.protocol, 'ssh');
  assert.equal(sshParsed.owner, 'mohammadrezajafari');
  assert.equal(sshParsed.repo, 'music-crate');
  assert.equal(
    sshParsed.sshRemoteUrl,
    'git@github.com:mohammadrezajafari/music-crate.git'
  );

  const userSiteParsed = parseGitHubRemoteUrl('mohammadrezajafari/mohammadrezajafari.github.io');
  assert.equal(userSiteParsed.isValid, true);
  assert.equal(userSiteParsed.isUserOrOrgSite, true);
  assert.equal(userSiteParsed.basePath, '');
  assert.equal(userSiteParsed.livePagesUrl, 'https://mohammadrezajafari.github.io/');

  const invalidParsed = parseGitHubRemoteUrl('not a valid url');
  assert.equal(invalidParsed.isValid, false);
});

test('generateGitHubActionsPagesWorkflow builds a valid GitHub Pages CI/CD YAML workflow', () => {
  const yaml = generateGitHubActionsPagesWorkflow({
    remoteUrl: 'https://github.com/mohammadrezajafari/cratedig-yt.git',
    branch: 'main',
    nodeVersion: '20',
    packageManager: 'npm',
    exportStaticConfig: true,
    commitMessage: 'Deploy to GitHub Pages',
    includeTasteProfileJson: true,
  });

  assert.ok(yaml.includes('name: Deploy CrateDig YT to GitHub Pages'));
  assert.ok(yaml.includes('pages: write'));
  assert.ok(yaml.includes('id-token: write'));
  assert.ok(yaml.includes('actions/configure-pages@v5'));
  assert.ok(yaml.includes('NEXT_PUBLIC_BASE_PATH: "/cratedig-yt"'));
  assert.ok(yaml.includes('actions/upload-pages-artifact@v3'));
  assert.ok(yaml.includes('actions/deploy-pages@v4'));
});

test('generateOneClickAutoDeployScript and generateNextConfigForPages produce working configurations', () => {
  const config = {
    remoteUrl: 'https://github.com/mohammadrezajafari/cratedig-yt.git',
    branch: 'main',
    nodeVersion: '20' as const,
    packageManager: 'npm' as const,
    exportStaticConfig: true,
    commitMessage: 'Setup GitHub Pages CI/CD',
    includeTasteProfileJson: true,
    customDomain: '',
  };

  const script = generateOneClickAutoDeployScript(config);
  assert.ok(script.startsWith('#!/usr/bin/env bash'));
  assert.ok(script.includes('mkdir -p .github/workflows'));
  assert.ok(script.includes('git remote set-url origin "https://github.com/mohammadrezajafari/cratedig-yt.git"'));
  assert.ok(script.includes('git push -u origin main'));

  const nextCfg = generateNextConfigForPages(config);
  assert.ok(nextCfg.includes("output: isGitHubPages ? 'export' : 'standalone'"));
  assert.ok(nextCfg.includes("'/cratedig-yt'"));
});

test('validateWorkflowYamlSyntax passes valid workflow and catches tabs, missing permissions, and Next.js 15 traps', () => {
  const validYaml = generateGitHubActionsPagesWorkflow({
    remoteUrl: 'https://github.com/mohammadrezajafari/cratedig-yt.git',
    branch: 'main',
    nodeVersion: '20',
    packageManager: 'npm',
    exportStaticConfig: true,
    commitMessage: 'Deploy to GitHub Pages',
    includeTasteProfileJson: true,
  });

  const validResult = validateWorkflowYamlSyntax(validYaml, 'main');
  assert.equal(validResult.isValid, true);
  assert.equal(validResult.score, 100);
  assert.equal(validResult.hasRequiredPermissions, true);
  assert.equal(validResult.hasPagesArtifactUpload, true);
  assert.equal(validResult.hasDeployPagesAction, true);
  assert.equal(validResult.issues.length, 0);

  // Broken YAML with TAB indentation, cache: "npm", static_site_generator: next, and missing id-token: write
  const brokenYaml = `name: Broken Workflow
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
      - uses: actions/setup-node@v4
        with:
          cache: "npm"
      - uses: actions/configure-pages@v5
        with:
          static_site_generator: next
`;

  const brokenResult = validateWorkflowYamlSyntax(brokenYaml, 'main');
  assert.equal(brokenResult.isValid, false);
  assert.ok(brokenResult.score < 50);
  const codes = brokenResult.issues.map((i) => i.code);
  assert.ok(codes.includes('YAML_TAB_INDENTATION'));
  assert.ok(codes.includes('YAML_MISSING_OIDC_PERMISSIONS'));
  assert.ok(codes.includes('YAML_NPM_CACHE_TRAP'));
  assert.ok(codes.includes('YAML_CONFIGURE_PAGES_NEXT_TRAP'));
  assert.ok(codes.includes('YAML_BRANCH_MISMATCH'));
});

test('evaluateRepoAndBranchDiagnostics evaluates repository permissions, branch protection, and YAML syntax accurately', () => {
  const validYaml = generateGitHubActionsPagesWorkflow({
    remoteUrl: 'https://github.com/mohammadrezajafari/cratedig-yt.git',
    branch: 'main',
    nodeVersion: '20',
    packageManager: 'npm',
    exportStaticConfig: true,
    commitMessage: 'Deploy to GitHub Pages',
    includeTasteProfileJson: true,
  });

  const healthyReport = evaluateRepoAndBranchDiagnostics({
    remoteUrl: 'https://github.com/mohammadrezajafari/cratedig-yt.git',
    targetBranch: 'main',
    workflowYaml: validYaml,
    hasToken: true,
    tokenScopes: ['repo', 'workflow'],
    repoHttpStatus: 200,
    repoVisibility: 'public',
    repoDefaultBranch: 'main',
    repoPermissions: { admin: true, push: true, pull: true },
    pagesHttpStatus: 200,
    pagesBuildType: 'workflow',
    branchHttpStatus: 200,
    branchProtected: false,
    localGitDiagnostics: {
      isGitInitialized: true,
      currentBranch: 'main',
      remoteOriginUrl: 'https://github.com/mohammadrezajafari/cratedig-yt.git',
      commitCount: 2,
      latestCommit: 'ea9ff4d Fix CI/CD',
      workingTreeClean: true,
      modifiedFilesCount: 0,
      hasWorkflowFile: true,
      hasBuildPagesScript: true,
      nextConfigSupportsExport: true,
      issuesFixed: [],
    },
  });

  assert.equal(healthyReport.overallStatus, 'healthy');
  assert.equal(healthyReport.healthScore, 100);

  // Failing report: protected branch requiring PR approval + legacy pages source + missing push permission
  const failingReport = evaluateRepoAndBranchDiagnostics({
    remoteUrl: 'https://github.com/mohammadrezajafari/cratedig-yt.git',
    targetBranch: 'main',
    workflowYaml: validYaml,
    hasToken: true,
    tokenScopes: ['public_repo'],
    repoHttpStatus: 200,
    repoVisibility: 'public',
    repoPermissions: { admin: false, push: false, pull: true },
    pagesHttpStatus: 200,
    pagesBuildType: 'legacy',
    branchHttpStatus: 200,
    branchProtected: true,
    branchProtectionRules: {
      requiresPullRequestReviews: true,
      requiredApprovingReviewCount: 2,
      requiresStatusChecks: true,
      allowForcePushes: false,
    },
  });

  assert.equal(failingReport.overallStatus, 'failing');
  assert.ok(failingReport.healthScore < 60);
  assert.ok(
    failingReport.permissionsChecks.some(
      (c) => c.id === 'perm-token-scopes' && c.status === 'fail'
    )
  );
  assert.ok(
    failingReport.permissionsChecks.some(
      (c) => c.id === 'perm-pages-build-type' && c.status === 'fail'
    )
  );
  assert.ok(
    failingReport.branchProtectionChecks.some(
      (c) => c.id === 'branch-protection-rules' && c.status === 'fail'
    )
  );
});

