'use client';

import React, { useState } from 'react';
import {
  KeyRound,
  Terminal,
  Copy,
  Check,
  Download,
  Upload,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import {
  YtDlpCookieSource,
  YtDlpCookieBrowser,
  YouTubeFeedTarget,
  YtDlpFeedCookieConfig,
  COOKIE_FEED_SIMULATION_SAMPLES,
} from '@/lib/music-data';
import {
  buildYtDlpCookieFlag,
  generateYtDlpFeedFetchCommand,
} from '@/lib/taste-engine';

export interface YtDlpCookieFeedPanelProps {
  cookieSource: YtDlpCookieSource;
  cookieBrowser: YtDlpCookieBrowser;
  cookieProfile: string;
  cookieFilePath: string;
  onUpdateCookieSettings: (settings: {
    cookieSource: YtDlpCookieSource;
    cookieBrowser: YtDlpCookieBrowser;
    cookieProfile: string;
    cookieFilePath: string;
  }) => void;
  onImportFeedOutput: (rawFeedOutput: string, sourceLabel?: string) => void;
}

const FEED_TARGET_OPTIONS: { id: YouTubeFeedTarget; label: string; hint: string }[] = [
  {
    id: ':ytrec',
    label: ':ytrec — My Home Recommendations',
    hint: 'Extracts your personalized YouTube home feed using your browser session cookies',
  },
  {
    id: ':ytfav',
    label: ':ytfav — My Liked Videos (LL)',
    hint: 'Extracts your private Liked Videos playlist from YouTube',
  },
  {
    id: ':ythistory',
    label: ':ythistory — My Watch History',
    hint: 'Extracts recently watched music videos from your personal YouTube history',
  },
  {
    id: 'https://music.youtube.com/playlist?list=LM',
    label: 'YouTube Music — Liked Songs (LM)',
    hint: 'Extracts your authenticated YouTube Music Liked Songs crate',
  },
  {
    id: ':ytwatchlater',
    label: ':ytwatchlater — My Watch Later (WL)',
    hint: 'Extracts tracks saved to your private Watch Later queue',
  },
];

const BROWSER_OPTIONS: { id: YtDlpCookieBrowser; label: string }[] = [
  { id: 'chrome', label: 'Google Chrome (chrome)' },
  { id: 'firefox', label: 'Mozilla Firefox (firefox)' },
  { id: 'brave', label: 'Brave Browser (brave)' },
  { id: 'edge', label: 'Microsoft Edge (edge)' },
  { id: 'safari', label: 'Apple Safari (safari)' },
  { id: 'chromium', label: 'Chromium (chromium)' },
  { id: 'vivaldi', label: 'Vivaldi (vivaldi)' },
];

export default function YtDlpCookieFeedPanel({
  cookieSource,
  cookieBrowser,
  cookieProfile,
  cookieFilePath,
  onUpdateCookieSettings,
  onImportFeedOutput,
}: YtDlpCookieFeedPanelProps) {
  const [feedTarget, setFeedTarget] = useState<YouTubeFeedTarget>(':ytrec');
  const [feedLimit, setFeedLimit] = useState<number>(35);
  const [outputMode, setOutputMode] = useState<YtDlpFeedCookieConfig['outputMode']>('print-stdout');
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);
  const [importStatus, setImportStatus] = useState<string>('');

  const fullConfig: YtDlpFeedCookieConfig = {
    cookieSource,
    cookieBrowser,
    cookieProfile,
    cookieFilePath,
    feedTarget,
    feedLimit,
    outputMode,
  };

  const activeCookieFlag = buildYtDlpCookieFlag(fullConfig);
  const generatedFeedCommand = generateYtDlpFeedFetchCommand(fullConfig);

  const handleCopyCommand = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(generatedFeedCommand).catch(() => {});
    }
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 1800);
  };

  const handleDownloadFeedScript = () => {
    const scriptLines = [
      '#!/usr/bin/env bash',
      '# CrateDig YT — Personal YouTube Feed Extractor via yt-dlp Cookies',
      '# Runs locally on your machine; cookies never leave your computer.',
      'set -e',
      '',
      `echo "Fetching personal YouTube feed (${feedTarget}) using ${activeCookieFlag || 'public session'}..."`,
      generatedFeedCommand,
      '',
    ].join('\n');

    const blob = new Blob([scriptLines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fetch-my-youtube-feed.sh';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '').trim();
      if (content) {
        onImportFeedOutput(content, `Imported ${file.name}`);
        setImportStatus(`Loaded ${file.name} into your YouTube feed sample and calibrated Taste DNA.`);
      }
    };
    reader.readAsText(file);
  };

  const handleSimulateCookieFeed = () => {
    const sample = COOKIE_FEED_SIMULATION_SAMPLES[feedTarget] || COOKIE_FEED_SIMULATION_SAMPLES[':ytrec'];
    onImportFeedOutput(sample, `yt-dlp ${activeCookieFlag} ${feedTarget}`);
    setImportStatus(
      `Imported personal ${feedTarget} cookie feed sample (${sample.split('\n').length} tracks) and updated Taste Discovery.`
    );
  };

  return (
    <div
      aria-label="yt-dlp Personal YouTube Feed Cookie Authenticator"
      className="bg-zinc-950/90 border border-amber-400/30 rounded-xl p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3.5">
        <div>
          <h3 className="text-sm font-display font-semibold text-zinc-100 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Personal YouTube Feed via yt-dlp Cookies</span>
            {activeCookieFlag && (
              <span className="text-[11px] font-mono text-amber-300 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded">
                {activeCookieFlag}
              </span>
            )}
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Use <code className="font-mono text-zinc-300">--cookies-from-browser</code> or{' '}
            <code className="font-mono text-zinc-300">cookies.txt</code> locally so{' '}
            <code className="font-mono text-amber-300">yt-dlp</code> can pull your private YouTube recommendations (
            <code className="font-mono text-zinc-300">:ytrec</code>), liked tracks (
            <code className="font-mono text-zinc-300">:ytfav</code>), or watch history (
            <code className="font-mono text-zinc-300">:ythistory</code>).
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 font-medium shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span>100% Local CLI — Cookies Never Uploaded</span>
        </div>
      </div>

      {/* Cookie Source + Browser / Path + Personal Feed Target Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Cookie Source */}
        <div className="space-y-1">
          <label
            htmlFor="cookie-source-select"
            className="block text-xs font-medium text-zinc-300"
          >
            Cookie Auth Mode
          </label>
          <select
            id="cookie-source-select"
            value={cookieSource}
            onChange={(e) =>
              onUpdateCookieSettings({
                cookieSource: e.target.value as YtDlpCookieSource,
                cookieBrowser,
                cookieProfile,
                cookieFilePath,
              })
            }
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
          >
            <option value="browser">Browser Cookies (--cookies-from-browser)</option>
            <option value="file">Netscape File (--cookies cookies.txt)</option>
            <option value="none">Disabled (Public Links Only)</option>
          </select>
        </div>

        {/* 2. Browser Selection OR Cookie File Path */}
        {cookieSource === 'file' ? (
          <div className="space-y-1">
            <label
              htmlFor="cookie-file-input"
              className="block text-xs font-medium text-zinc-300"
            >
              Cookies File Path (--cookies)
            </label>
            <input
              id="cookie-file-input"
              type="text"
              value={cookieFilePath}
              onChange={(e) =>
                onUpdateCookieSettings({
                  cookieSource,
                  cookieBrowser,
                  cookieProfile,
                  cookieFilePath: e.target.value,
                })
              }
              placeholder="./cookies.txt"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-400"
            />
          </div>
        ) : (
          <div className="space-y-1">
            <label
              htmlFor="cookie-browser-select"
              className="block text-xs font-medium text-zinc-300"
            >
              Browser Session
            </label>
            <div className="flex gap-1.5">
              <select
                id="cookie-browser-select"
                disabled={cookieSource === 'none'}
                value={cookieBrowser}
                onChange={(e) =>
                  onUpdateCookieSettings({
                    cookieSource: 'browser',
                    cookieBrowser: e.target.value as YtDlpCookieBrowser,
                    cookieProfile,
                    cookieFilePath,
                  })
                }
                className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-100 disabled:opacity-50 focus:outline-none focus:border-amber-400"
              >
                {BROWSER_OPTIONS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                aria-label="Optional Browser Profile Name"
                disabled={cookieSource === 'none'}
                value={cookieProfile}
                onChange={(e) =>
                  onUpdateCookieSettings({
                    cookieSource: 'browser',
                    cookieBrowser,
                    cookieProfile: e.target.value,
                    cookieFilePath,
                  })
                }
                placeholder="Profile (opt)"
                title="Optional browser profile name, e.g. Default or Profile 1"
                className="w-24 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-2 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 disabled:opacity-50 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>
        )}

        {/* 3. Personal YouTube Feed Target */}
        <div className="space-y-1">
          <label
            htmlFor="feed-target-select"
            className="block text-xs font-medium text-zinc-300"
          >
            My YouTube Feed Source
          </label>
          <select
            id="feed-target-select"
            value={feedTarget}
            onChange={(e) => setFeedTarget(e.target.value as YouTubeFeedTarget)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
          >
            {FEED_TARGET_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 4. Output Mode & Item Limit */}
        <div className="space-y-1">
          <label
            htmlFor="feed-output-mode"
            className="block text-xs font-medium text-zinc-300"
          >
            Extraction Format & Limit
          </label>
          <div className="flex gap-1.5">
            <select
              id="feed-output-mode"
              value={outputMode}
              onChange={(e) =>
                setOutputMode(e.target.value as YtDlpFeedCookieConfig['outputMode'])
              }
              className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
            >
              <option value="print-stdout">Terminal Lines (--print)</option>
              <option value="export-file">Save File (&gt; my-youtube-feed.txt)</option>
              <option value="dump-json">JSONL Dump (--dump-json)</option>
              <option value="direct-audio">Direct MP3 Audio Download</option>
            </select>
            <select
              aria-label="Feed Track Limit"
              value={feedLimit}
              onChange={(e) => setFeedLimit(Number(e.target.value))}
              className="w-20 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-400"
            >
              <option value={15}>15 trk</option>
              <option value={35}>35 trk</option>
              <option value={50}>50 trk</option>
              <option value={100}>100 trk</option>
            </select>
          </div>
        </div>
      </div>

      {/* Generated Local yt-dlp Cookie Feed Command */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs text-zinc-400">
            Step 1: Run this command in your terminal to pull your personal{' '}
            <code className="font-mono text-amber-300">{feedTarget}</code> feed with your browser cookies:
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyCommand}
              className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold rounded-lg text-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              {copiedCmd ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied Cookie Command</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Cookie Feed CLI</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadFeedScript}
              className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.sh Script</span>
            </button>
          </div>
        </div>

        <pre className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3 text-xs font-mono text-amber-200 overflow-x-auto leading-relaxed">
          {generatedFeedCommand}
        </pre>
      </div>

      {/* Step 2: Import / Simulate Output */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-zinc-800/80">
        <div className="text-xs text-zinc-400">
          Step 2: Paste the terminal output below, upload{' '}
          <code className="font-mono text-zinc-300">my-youtube-feed.txt</code> /{' '}
          <code className="font-mono text-zinc-300">.jsonl</code>, or test with a simulated{' '}
          <code className="font-mono text-amber-300">{feedTarget}</code> cookie dump.
        </div>

        <div className="flex items-center flex-wrap gap-2 shrink-0">
          <label className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
            <Upload className="w-3.5 h-3.5 text-amber-300" />
            <span>Import .txt / .jsonl Feed</span>
            <input
              type="file"
              accept=".txt,.jsonl,.json,text/plain,application/json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={handleSimulateCookieFeed}
            className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-400/30 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Load Sample {feedTarget} Cookie Dump</span>
          </button>
        </div>
      </div>

      {importStatus && (
        <p className="text-xs text-emerald-300 font-mono">{importStatus}</p>
      )}
    </div>
  );
}
