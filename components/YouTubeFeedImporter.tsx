'use client';

import React, { useState } from 'react';
import {
  Upload,
  Check,
  Copy,
  Terminal,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  KeyRound,
} from 'lucide-react';
import {
  MusicTrack,
  YouTubeFeedTarget,
  YtDlpCookieSource,
  YtDlpCookieBrowser,
} from '@/lib/music-data';
import {
  CookieValidationResult,
  parseAndValidateYouTubeCookies,
  fetchAuthenticatedYouTubeMusicFeed,
  generateOneStepFeedDumpCliCommand,
  DEMO_NETSCAPE_COOKIES_TXT,
} from '@/lib/youtube-feed-importer';
import {
  filterMusicTracks,
  FilteredNonMusicItem,
} from '@/lib/taste-engine';

export interface YouTubeFeedImporterProps {
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
  onImportAuthenticatedFeed: (rawFeedText: string, tracks: MusicTrack[]) => void;
  onProceedToNextStep?: () => void;
}

const BROWSER_OPTIONS: { id: YtDlpCookieBrowser; label: string }[] = [
  { id: 'firefox', label: 'Firefox' },
  { id: 'chrome', label: 'Chrome' },
  { id: 'brave', label: 'Brave' },
  { id: 'edge', label: 'Edge' },
  { id: 'safari', label: 'Safari' },
];

const FEED_TARGET_OPTIONS: { id: YouTubeFeedTarget; label: string }[] = [
  { id: ':ytfav', label: 'Liked Videos (:ytfav)' },
  { id: 'https://music.youtube.com/playlist?list=LM', label: 'YouTube Music Likes (LM)' },
  { id: ':ytrec', label: 'Home Feed (:ytrec)' },
  { id: ':ythistory', label: 'Watch History (:ythistory)' },
];

export default function YouTubeFeedImporter({
  cookieSource,
  cookieBrowser,
  cookieProfile,
  cookieFilePath,
  onUpdateCookieSettings,
  onImportAuthenticatedFeed,
  onProceedToNextStep,
}: YouTubeFeedImporterProps) {
  const [feedTarget, setFeedTarget] = useState<YouTubeFeedTarget>(':ytfav');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [sessionInput, setSessionInput] = useState<string>('');
  const [showCookieStringBox, setShowCookieStringBox] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<CookieValidationResult | null>(null);
  const [syncedTracks, setSyncedTracks] = useState<MusicTrack[]>([]);
  const [filteredNonMusic, setFilteredNonMusic] = useState<FilteredNonMusicItem[]>([]);
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);

  // Tested 1-line command with --ignore-config --no-warnings and song duration filter
  const oneStepFeedDumpCmd = generateOneStepFeedDumpCliCommand({
    browser: cookieBrowser,
    profile: cookieProfile,
    feedTarget,
    feedLimit: 35,
    musicOnlyFilter: true,
    strictMusicCategory: false,
    maxDurationSec: 600,
  });

  const handleCopyCommand = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(oneStepFeedDumpCmd).catch(() => {});
    }
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const applyCookieValidation = (rawCookieInput: string, fileNameHint?: string) => {
    const result = parseAndValidateYouTubeCookies(rawCookieInput);
    setValidationResult(result);

    if (result.isValid) {
      setSessionInput('');
      const resolvedPath = fileNameHint ? `./${fileNameHint}` : cookieFilePath || './cookies.txt';
      onUpdateCookieSettings({
        cookieSource: 'file',
        cookieBrowser,
        cookieProfile,
        cookieFilePath: resolvedPath,
      });

      const { rawFeedText, tracks } = fetchAuthenticatedYouTubeMusicFeed(result, feedTarget);
      setSyncedTracks(tracks);
      setFilteredNonMusic([]);
      onImportAuthenticatedFeed(rawFeedText, tracks);
    } else {
      setSyncedTracks([]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const cookieCheck = parseAndValidateYouTubeCookies(text);
      if (cookieCheck.isValid) {
        applyCookieValidation(text, file.name);
        return;
      }

      const filteredResult = filterMusicTracks(text, {
        filterNonMusic: true,
        maxDurationSec: 600,
        minDurationSec: 45,
      });

      if (filteredResult.tracks.length > 0 || filteredResult.filteredOut.length > 0) {
        setFilteredNonMusic(filteredResult.filteredOut);
        setValidationResult({
          isValid: filteredResult.tracks.length > 0,
          format: 'netscape',
          youtubeCookieCount: filteredResult.tracks.length,
          detectedAuthKeys: ['CLI_FEED_DUMP', 'filterMusicTracks'],
          entries: [],
          statusMessage: `Imported ${filteredResult.tracks.length} music tracks from ${file.name} (filtered out ${filteredResult.filteredOut.length} podcasts/news items).`,
          fingerprintHash: `cli-dump-${filteredResult.tracks.length}trk`,
        });
        setSyncedTracks(filteredResult.tracks);
        onImportAuthenticatedFeed(filteredResult.filteredText || text, filteredResult.tracks);
      } else {
        setValidationResult(cookieCheck);
        setSyncedTracks([]);
      }
    };
    reader.readAsText(file);
  };

  return (
    <section
      aria-label="YouTube Cookie & Feed Setup"
      className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 space-y-6"
    >
      {/* Simple 3-Step Visual Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card 1: Choose Browser */}
        <div className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-amber-400 font-semibold">
              1. PICK YOUR BROWSER
            </span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Select the browser where you are logged into YouTube so <code className="font-mono text-zinc-200">yt-dlp</code> can read your music feed directly.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {BROWSER_OPTIONS.map((b) => {
              const active = cookieSource === 'browser' && cookieBrowser === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() =>
                    onUpdateCookieSettings({
                      cookieSource: 'browser',
                      cookieBrowser: b.id,
                      cookieProfile,
                      cookieFilePath,
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-amber-400 text-zinc-950 font-semibold'
                      : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800'
                  }`}
                >
                  {b.label}
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
            <label htmlFor="simple-feed-target" className="block text-[11px] text-zinc-400">
              Which YouTube playlist do you want to extract?
            </label>
            <select
              id="simple-feed-target"
              value={feedTarget}
              onChange={(e) => setFeedTarget(e.target.value as YouTubeFeedTarget)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-400"
            >
              {FEED_TARGET_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Card 2: Copy 1 Tested Terminal Command */}
        <div className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-amber-400 font-semibold">
                2. COPY &amp; RUN IN TERMINAL
              </span>
              <Terminal className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              This command uses <code className="font-mono text-zinc-200">--ignore-config</code> and filters for music songs (1–10 mins, no live streams) into <code className="font-mono text-amber-300">my-youtube-feed.txt</code>:
            </p>
            <pre className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-[11px] font-mono text-amber-200 overflow-x-auto leading-relaxed">
              {oneStepFeedDumpCmd}
            </pre>
          </div>

          <button
            type="button"
            onClick={handleCopyCommand}
            className="w-full py-2 px-3 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {copiedCmd ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied Command!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy yt-dlp Command</span>
              </>
            )}
          </button>
        </div>

        {/* Card 3: Upload File or Use 1-Click Sample */}
        <div className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-amber-400 font-semibold">
                3. UPLOAD FILE OR TRY DEMO
              </span>
              <Upload className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Upload your generated <code className="font-mono text-zinc-200">my-youtube-feed.txt</code> (or <code className="font-mono text-zinc-200">cookies.txt</code>), or load our demo music feed in 1 click:
            </p>

            <label
              htmlFor="cookie-or-feed-upload"
              className="flex items-center justify-center gap-2 w-full py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 border border-dashed border-zinc-700 hover:border-amber-400 rounded-lg text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {uploadedFileName
                  ? `Uploaded: ${uploadedFileName}`
                  : 'Upload my-youtube-feed.txt / cookies.txt'}
              </span>
              <input
                id="cookie-or-feed-upload"
                type="file"
                accept=".txt,.jsonl,.json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                applyCookieValidation(DEMO_NETSCAPE_COOKIES_TXT, 'demo-cookies.txt');
              }}
              className="w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700 font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Load Instant Demo Feed (Skip Terminal)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCookieStringBox((prev) => !prev)}
              className="w-full text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer flex items-center justify-center gap-1"
            >
              <KeyRound className="w-3 h-3" />
              <span>
                {showCookieStringBox
                  ? 'Hide raw session cookie input'
                  : 'Or paste raw YouTube cookie string'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Optional Raw Session Cookie String Input */}
      {showCookieStringBox && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-2.5">
          <label htmlFor="raw-cookie-input" className="block text-xs font-medium text-zinc-300">
            Paste Netscape <code className="font-mono">cookies.txt</code> content or raw <code className="font-mono">Cookie:</code> header string
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="raw-cookie-input"
              type="password"
              value={sessionInput}
              onChange={(e) => setSessionInput(e.target.value)}
              placeholder="SID=...; HSID=...; SSID=...; SAPISID=..."
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-400"
            />
            <button
              type="button"
              onClick={() => applyCookieValidation(sessionInput)}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg cursor-pointer whitespace-nowrap"
            >
              Validate &amp; Sync Feed
            </button>
          </div>
        </div>
      )}

      {/* Validation Status & Next Step Prompt */}
      {validationResult && (
        <div
          role="status"
          className={`rounded-xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            validationResult.isValid
              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
          }`}
        >
          <div className="space-y-1 text-xs">
            <div className="font-semibold flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{validationResult.statusMessage}</span>
            </div>
            {syncedTracks.length > 0 && (
              <p className="text-zinc-300 font-mono text-[11px]">
                Loaded {syncedTracks.length} songs · Filtered out {filteredNonMusic.length} non-music items
              </p>
            )}
          </div>

          {validationResult.isValid && onProceedToNextStep && (
            <button
              type="button"
              onClick={onProceedToNextStep}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Continue to Step 2: Filter &amp; Review Songs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
