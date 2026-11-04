import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGitHubRemoteUrl,
  generateGitHubActionsPagesWorkflow,
  generateNextConfigForPages,
  generateOneClickAutoDeployScript,
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
