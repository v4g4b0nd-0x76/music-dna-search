'use client';

import React, { useState } from 'react';
import {
  Upload,
  Check,
  Copy,
  Terminal,
  ShieldCheck,
  ArrowRight,
  KeyRound,
  Music,
  FileText,
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
  generateOneStepFeedDumpCliCommand,
  generateDirectPlaylistAudioCliCommand,
  generateCookieExportCliCommand,
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
  { id: 'https://music.youtube.com/playlist?list=LM', label: 'YouTube Music Likes (LM)' },
  { id: ':ytfav', label: 'YouTube Liked Videos (LL)' },
  { id: ':ythistory', label: 'YouTube Watch History' },
  { id: ':ytrec', label: 'YouTube Home Feed' },
];

type CliMode = 'print-feed' | 'direct-mp3' | 'export-cookies';

export default function YouTubeFeedImporter({
  cookieSource,
  cookieBrowser,
  cookieProfile,
  cookieFilePath,
  onUpdateCookieSettings,
  onImportAuthenticatedFeed,
  onProceedToNextStep,
}: YouTubeFeedImporterProps) {
  const [feedTarget, setFeedTarget] = useState<string>(
    'https://music.youtube.com/playlist?list=LM'
  );
  const [customPlaylistUrl, setCustomPlaylistUrl] = useState<string>('');
  const [cliMode, setCliMode] = useState<CliMode>('print-feed');
  const [feedLimit, setFeedLimit] = useState<number>(50);
  const [directPasteText, setDirectPasteText] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [sessionInput, setSessionInput] = useState<string>('');
  const [showCookieStringBox, setShowCookieStringBox] = useState<boolean>(false);
  const [validationResult, setValidationResult] =
    useState<CookieValidationResult | null>(null);
  const [syncedTracks, setSyncedTracks] = useState<MusicTrack[]>([]);
  const [filteredNonMusic, setFilteredNonMusic] = useState<FilteredNonMusicItem[]>(
    []
  );
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);

  const effectiveTarget = customPlaylistUrl.trim() || feedTarget;

  // Zsh & Bash safe yt-dlp commands (never uses !is_live inside double quotes, never prints NA for webpage_url)
  const activeCliCommand = (() => {
    if (cliMode === 'direct-mp3') {
      return generateDirectPlaylistAudioCliCommand({
        browser: cookieBrowser,
        profile: cookieProfile,
        feedTarget: effectiveTarget,
        feedLimit,
        audioFormat: 'mp3',
      });
    }
    if (cliMode === 'export-cookies') {
      return generateCookieExportCliCommand(
        cookieBrowser,
        cookieProfile,
        cookieFilePath || './cookies.txt'
      );
    }
    return generateOneStepFeedDumpCliCommand({
      browser: cookieBrowser,
      profile: cookieProfile,
      feedTarget: effectiveTarget,
      feedLimit,
      saveToFile: true,
    });
  })();

  const handleCopyCommand = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(activeCliCommand).catch(() => {});
    }
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const processFeedTextImport = (rawText: string, sourceLabel: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;

    const filteredResult = filterMusicTracks(trimmed, {
      filterNonMusic: true,
      maxDurationSec: 600,
      minDurationSec: 45,
    });

    setFilteredNonMusic(filteredResult.filteredOut);
    setSyncedTracks(filteredResult.tracks);
    setValidationResult({
      isValid: filteredResult.tracks.length > 0,
      format: 'netscape',
      youtubeCookieCount: filteredResult.tracks.length,
      detectedAuthKeys: ['DIRECT_IMPORT', 'filterMusicTracks'],
      entries: [],
      statusMessage:
        filteredResult.tracks.length > 0
          ? `Imported ${filteredResult.tracks.length} songs from ${sourceLabel} (filtered out ${filteredResult.filteredOut.length} non-music/podcast items).`
          : `No valid song lines found in ${sourceLabel}. Paste YouTube URLs or "Artist - Title" lines.`,
      fingerprintHash: `import-${filteredResult.tracks.length}trk`,
    });

    if (filteredResult.tracks.length > 0) {
      onImportAuthenticatedFeed(
        filteredResult.filteredText || trimmed,
        filteredResult.tracks
      );
    }
  };

  const applyCookieValidation = (rawCookieInput: string, fileNameHint?: string) => {
    const result = parseAndValidateYouTubeCookies(rawCookieInput);
    setValidationResult(result);

    if (result.isValid) {
      setSessionInput('');
      const resolvedPath = fileNameHint
        ? `./${fileNameHint}`
        : cookieFilePath || './cookies.txt';
      onUpdateCookieSettings({
        cookieSource: 'file',
        cookieBrowser,
        cookieProfile,
        cookieFilePath: resolvedPath,
      });
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
      processFeedTextImport(text, file.name);
    };
    reader.readAsText(file);
  };

  return (
    <section
      aria-label="YouTube Cookie & Feed Setup"
      className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 space-y-6"
    >
      {/* Top 2-Column Layout: Left = Zsh-Safe Command Builder, Right = Direct Paste or Upload */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 6 Cols: Zsh/Bash Safe yt-dlp Command Builder */}
        <div className="lg:col-span-6 bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 space-y-4 flex flex-col justify-between">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-amber-400 font-semibold">
                1. ZSH &amp; BASH SAFE YT-DLP COMMAND BUILDER
              </span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>

            {/* Browser Selector */}
            <div className="space-y-1.5">
              <span className="block text-[11px] text-zinc-400">
                Select your logged-in browser for <code className="font-mono text-zinc-200">--cookies-from-browser</code>:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {BROWSER_OPTIONS.map((b) => {
                  const active =
                    cookieSource === 'browser' && cookieBrowser === b.id;
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
            </div>

            {/* Target Playlist / Custom URL */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-8 space-y-1">
                <label
                  htmlFor="simple-feed-target"
                  className="block text-[11px] text-zinc-400"
                >
                  YouTube Source Playlist
                </label>
                <select
                  id="simple-feed-target"
                  value={feedTarget}
                  onChange={(e) => setFeedTarget(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-400"
                >
                  {FEED_TARGET_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-4 space-y-1">
                <label
                  htmlFor="feed-limit-input"
                  className="block text-[11px] text-zinc-400"
                >
                  Max Tracks
                </label>
                <input
                  id="feed-limit-input"
                  type="number"
                  min={5}
                  max={200}
                  value={feedLimit}
                  onChange={(e) => setFeedLimit(Number(e.target.value) || 50)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="custom-playlist-url"
                className="block text-[11px] text-zinc-400"
              >
                Or paste any custom YouTube / YouTube Music Playlist URL:
              </label>
              <input
                id="custom-playlist-url"
                type="text"
                value={customPlaylistUrl}
                onChange={(e) => setCustomPlaylistUrl(e.target.value)}
                placeholder="https://music.youtube.com/playlist?list=..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Command Mode Selector */}
            <div className="space-y-2 pt-1">
              <div className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 text-[11px] flex-wrap">
                <button
                  type="button"
                  onClick={() => setCliMode('print-feed')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    cliMode === 'print-feed'
                      ? 'bg-amber-400 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Export URLs &amp; Titles
                </button>
                <button
                  type="button"
                  onClick={() => setCliMode('direct-mp3')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    cliMode === 'direct-mp3'
                      ? 'bg-amber-400 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Direct MP3 Download (No .txt)
                </button>
                <button
                  type="button"
                  onClick={() => setCliMode('export-cookies')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    cliMode === 'export-cookies'
                      ? 'bg-amber-400 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Export cookies.txt
                </button>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Fixed for <code className="font-mono text-emerald-300">zsh</code> &amp; <code className="font-mono text-emerald-300">bash</code>: no <code className="font-mono text-rose-300">!is_live</code> history-expansion errors and uses <code className="font-mono text-zinc-200">%(id)s - %(title)s</code> so <code className="font-mono text-zinc-200">--flat-playlist</code> never prints <code className="font-mono text-zinc-200">NA</code>:
              </p>

              <pre className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-[11px] font-mono text-amber-200 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                {activeCliCommand}
              </pre>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyCommand}
            className="w-full py-2.5 px-3 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {copiedCmd ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied Zsh-Safe yt-dlp Command!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy yt-dlp Command</span>
              </>
            )}
          </button>
        </div>

        {/* Right 6 Cols: Direct Paste or File Upload (No clunky multi-step .txt process required!) */}
        <div className="lg:col-span-6 bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 space-y-3.5 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-amber-400 font-semibold">
                2. PASTE YOUTUBE LINKS / SONGS DIRECTLY (OR UPLOAD FILE)
              </span>
              <Music className="w-4 h-4 text-amber-400" />
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              You don&apos;t need to create a file if you don&apos;t want to—paste any YouTube URLs, terminal output, or <code className="font-mono text-zinc-200">Artist - Song Title</code> lines directly below, or upload your <code className="font-mono text-zinc-200">my-youtube-feed.txt</code>:
            </p>

            <textarea
              aria-label="Direct YouTube URLs or Song Lines"
              rows={5}
              value={directPasteText}
              onChange={(e) => setDirectPasteText(e.target.value)}
              placeholder={`https://www.youtube.com/watch?v=... - Artist - Song Title\nArtist - Song Title [your-custom-tag]`}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400 leading-relaxed"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  processFeedTextImport(directPasteText, 'direct paste')
                }
                disabled={!directPasteText.trim()}
                className="py-2 px-3 bg-amber-400 hover:bg-amber-300 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Filter &amp; Import Pasted Songs</span>
              </button>

              <label
                htmlFor="cookie-or-feed-upload"
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-zinc-900 hover:bg-zinc-800 border border-dashed border-zinc-700 hover:border-amber-400 rounded-lg text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-amber-400" />
                <span className="truncate">
                  {uploadedFileName
                    ? `Loaded: ${uploadedFileName}`
                    : 'Or Upload .txt / cookies.txt'}
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
          </div>

          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowCookieStringBox((prev) => !prev)}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer inline-flex items-center gap-1"
            >
              <KeyRound className="w-3 h-3" />
              <span>
                {showCookieStringBox
                  ? 'Hide raw session cookie input'
                  : 'Have a raw Cookie header string? Paste here'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Optional Raw Session Cookie String Input */}
      {showCookieStringBox && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-2.5">
          <label
            htmlFor="raw-cookie-input"
            className="block text-xs font-medium text-zinc-300"
          >
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
              Validate Cookie String
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
                Imported {syncedTracks.length} songs · Filtered out{' '}
                {filteredNonMusic.length} non-music items
              </p>
            )}
          </div>

          {validationResult.isValid && onProceedToNextStep && (
            <button
              type="button"
              onClick={onProceedToNextStep}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Continue to Step 2: Review &amp; Add Songs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
