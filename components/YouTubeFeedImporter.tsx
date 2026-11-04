'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  Upload,
  KeyRound,
  Lock,
  Check,
  Trash2,
  Sparkles,
  Eye,
  EyeOff,
  Copy,
  Heart,
  AlertCircle,
  Terminal,
  HelpCircle,
  FileText,
  Filter,
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
  generateCookieExportCliCommand,
  generateOneStepFeedDumpCliCommand,
  DEMO_NETSCAPE_COOKIES_TXT,
  DEMO_SESSION_COOKIE_STRING,
} from '@/lib/youtube-feed-importer';
import {
  buildYtDlpCookieFlag,
  generateYtDlpFeedFetchCommand,
  filterMusicTracks,
  FilteredNonMusicItem,
} from '@/lib/taste-engine';
import { useFavorites } from '@/context/FavoritesContext';

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
}

const FEED_TARGET_OPTIONS: { id: YouTubeFeedTarget; label: string; shortLabel: string }[] = [
  {
    id: ':ytfav',
    label: ':ytfav — My YouTube Liked Videos (Recommended)',
    shortLabel: 'Liked Videos (:ytfav)',
  },
  {
    id: 'https://music.youtube.com/playlist?list=LM',
    label: 'YouTube Music — My Liked Songs (100% Music Only)',
    shortLabel: 'YT Music Liked Songs (LM)',
  },
  {
    id: ':ytrec',
    label: ':ytrec — My YouTube Home Recommendations',
    shortLabel: 'Home Recommendations (:ytrec)',
  },
  {
    id: ':ythistory',
    label: ':ythistory — My Watch History',
    shortLabel: 'Watch History (:ythistory)',
  },
  {
    id: ':ytwatchlater',
    label: ':ytwatchlater — My Watch Later (WL)',
    shortLabel: 'Watch Later (:ytwatchlater)',
  },
];

const BROWSER_OPTIONS: { id: YtDlpCookieBrowser; label: string }[] = [
  { id: 'firefox', label: 'Mozilla Firefox' },
  { id: 'chrome', label: 'Google Chrome' },
  { id: 'brave', label: 'Brave Browser' },
  { id: 'edge', label: 'Microsoft Edge' },
  { id: 'safari', label: 'Apple Safari' },
  { id: 'chromium', label: 'Chromium' },
  { id: 'vivaldi', label: 'Vivaldi' },
];

export default function YouTubeFeedImporter({
  cookieSource,
  cookieBrowser,
  cookieProfile,
  cookieFilePath,
  onUpdateCookieSettings,
  onImportAuthenticatedFeed,
}: YouTubeFeedImporterProps) {
  const { addFavoriteSignal } = useFavorites();

  const [authMethodTab, setAuthMethodTab] = useState<
    'browser-cli' | 'cookies-file' | 'session-string'
  >('browser-cli');
  const [sessionInput, setSessionInput] = useState<string>('');
  const [showRawInput, setShowRawInput] = useState<boolean>(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [feedTarget, setFeedTarget] = useState<YouTubeFeedTarget>(':ytfav');
  const [feedLimit, setFeedLimit] = useState<number>(35);
  const [musicOnlyFilter, setMusicOnlyFilter] = useState<boolean>(true);
  const [strictMusicCategory, setStrictMusicCategory] = useState<boolean>(false);
  const [maxDurationSec, setMaxDurationSec] = useState<number>(600);
  const [validationResult, setValidationResult] = useState<CookieValidationResult | null>(null);
  const [syncedTracks, setSyncedTracks] = useState<MusicTrack[]>([]);
  const [filteredNonMusic, setFilteredNonMusic] = useState<FilteredNonMusicItem[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [favoritedSeedArtists, setFavoritedSeedArtists] = useState<boolean>(false);

  const activeCookieFlag = buildYtDlpCookieFlag({
    cookieSource,
    cookieBrowser,
    cookieProfile,
    cookieFilePath,
  });

  // Command 1: Export cookies.txt directly from logged-in browser via yt-dlp (with --ignore-config --no-warnings)
  const exportCookiesTxtCmd = generateCookieExportCliCommand(
    cookieBrowser,
    cookieProfile,
    cookieFilePath || './cookies.txt'
  );

  // Command 2: Tested 1-step terminal dump of personal YouTube feed into my-youtube-feed.txt
  // Includes --ignore-config --no-warnings and --match-filter for songs only (60s-600s, !is_live)
  const oneStepFeedDumpCmd = generateOneStepFeedDumpCliCommand({
    browser: cookieBrowser,
    profile: cookieProfile,
    feedTarget,
    feedLimit,
    musicOnlyFilter,
    strictMusicCategory,
    maxDurationSec,
  });

  // Command 3: Active yt-dlp feed print command matching current settings
  const generatedCliCommand = generateYtDlpFeedFetchCommand({
    cookieSource,
    cookieBrowser,
    cookieProfile,
    cookieFilePath,
    feedTarget,
    feedLimit,
    outputMode: 'export-file',
    musicOnlyFilter,
    strictMusicCategory,
    maxDurationSec,
  });

  const copyCommandText = (text: string, key: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
  };

  const applyValidationAndSync = (
    rawCookieInput: string,
    targetFeed: YouTubeFeedTarget = feedTarget,
    fileNameHint?: string
  ) => {
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

      const { rawFeedText, tracks } = fetchAuthenticatedYouTubeMusicFeed(result, targetFeed);
      setSyncedTracks(tracks);
      setFilteredNonMusic([]);
      onImportAuthenticatedFeed(rawFeedText, tracks);
      setFavoritedSeedArtists(false);
    } else {
      setSyncedTracks([]);
    }
  };

  const handleCookiesOrFeedFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const cookieCheck = parseAndValidateYouTubeCookies(text);
      if (cookieCheck.isValid) {
        applyValidationAndSync(text, feedTarget, file.name);
        return;
      }
      // Process `my-youtube-feed.txt` or `.jsonl` using `filterMusicTracks` to automatically filter out
      // non-music content ('podcast', 'news', 'update', interviews, tutorials, Shorts, and long videos)
      const filteredResult = filterMusicTracks(text, {
        filterNonMusic: musicOnlyFilter,
        maxDurationSec,
        minDurationSec: 45,
      });

      if (filteredResult.tracks.length > 0 || filteredResult.filteredOut.length > 0) {
        setFilteredNonMusic(filteredResult.filteredOut);
        setValidationResult({
          isValid: filteredResult.tracks.length > 0,
          format: 'netscape',
          youtubeCookieCount: filteredResult.tracks.length,
          detectedAuthKeys: ['CLI_FEED_DUMP', 'filterMusicTracks'],
          entries: [
            {
              domain: '.youtube.com',
              name: 'FEED_FILE',
              maskedValue: file.name,
              secure: true,
              isAuthKey: true,
            },
          ],
          statusMessage:
            filteredResult.filteredOut.length > 0
              ? `Imported ${filteredResult.tracks.length} music songs from ${file.name} via filterMusicTracks (Filtered out ${filteredResult.filteredOut.length} podcast / news / update / non-music items).`
              : `Imported ${filteredResult.tracks.length} music songs from ${file.name} via filterMusicTracks!`,
          fingerprintHash: `cli-dump-${filteredResult.tracks.length}trk`,
        });
        setSyncedTracks(filteredResult.tracks);
        onImportAuthenticatedFeed(filteredResult.filteredText || text, filteredResult.tracks);
        setFavoritedSeedArtists(false);
      } else {
        setValidationResult(cookieCheck);
        setSyncedTracks([]);
      }
    };
    reader.readAsText(file);
  };

  const handleVerifySessionString = (e: React.FormEvent) => {
    e.preventDefault();
    applyValidationAndSync(sessionInput, feedTarget);
  };

  const handleLoadDemoCookiesTxt = () => {
    setUploadedFileName('my-youtube-feed.txt (Processed by filterMusicTracks)');
    const demoMixedFeedWithPodcastsNewsUpdates = `https://www.youtube.com/watch?v=2Y6Nne8RvaA - Khruangbin - Topic - Time (You and I) [5:42]
https://www.youtube.com/watch?v=5qap5aO4i9A - Bicep - Topic - Glue [4:29]
https://www.youtube.com/watch?v=pod99112233 - Lex Fridman - Ep #412 - AI & Physics Full Podcast [2:48:15]
https://www.youtube.com/watch?v=nws44556677 - Tech Daily - Breaking Tech News & Industry Roundup [12:18]
https://www.youtube.com/watch?v=upd77889900 - Studio Gear - Synthesizer Firmware Update v3.2 [8:45]
https://www.youtube.com/watch?v=pFptt7Cargc - Tame Impala - Topic - Let It Happen [7:47]
https://www.youtube.com/watch?v=c1f7eZ8c1u4 - Floating Points - Topic - Bias [5:07]
https://www.youtube.com/watch?v=4NRXx6U8ABQ - Bonobo - Topic - Kerala [3:57]
https://www.youtube.com/watch?v=overmono01 - Overmono - Topic - Good Lies [3:51]`;

    const filteredResult = filterMusicTracks(demoMixedFeedWithPodcastsNewsUpdates, {
      filterNonMusic: true,
      maxDurationSec,
      minDurationSec: 45,
    });
    setFilteredNonMusic(filteredResult.filteredOut);
    setValidationResult({
      isValid: true,
      format: 'netscape',
      youtubeCookieCount: filteredResult.tracks.length,
      detectedAuthKeys: ['SAPISID', 'LOGIN_INFO', 'filterMusicTracks'],
      entries: [
        {
          domain: '.youtube.com',
          name: 'SAPISID',
          maskedValue: '••••••2mP0',
          secure: true,
          isAuthKey: true,
        },
        {
          domain: '.youtube.com',
          name: 'FILTER_HELPER',
          maskedValue: 'filterMusicTracks',
          secure: true,
          isAuthKey: true,
        },
      ],
      statusMessage: `Synced ${filteredResult.tracks.length} music tracks & automatically filtered out ${filteredResult.filteredOut.length} non-music items ('podcast', 'news', 'update') via filterMusicTracks!`,
      fingerprintHash: `yt-music-${filteredResult.tracks.length}songs`,
    });
    setSyncedTracks(filteredResult.tracks);
    onImportAuthenticatedFeed(
      filteredResult.filteredText || demoMixedFeedWithPodcastsNewsUpdates,
      filteredResult.tracks
    );
    setFavoritedSeedArtists(false);
  };

  const handleLoadDemoSessionString = () => {
    setAuthMethodTab('session-string');
    applyValidationAndSync(DEMO_SESSION_COOKIE_STRING, feedTarget, 'cookies.txt');
  };

  const handlePurgeSession = () => {
    setValidationResult(null);
    setSessionInput('');
    setUploadedFileName('');
    setSyncedTracks([]);
    setFilteredNonMusic([]);
    setFavoritedSeedArtists(false);
  };

  const handleChangeFeedTarget = (nextTarget: YouTubeFeedTarget) => {
    setFeedTarget(nextTarget);
    if (validationResult?.isValid) {
      const { rawFeedText, tracks } = fetchAuthenticatedYouTubeMusicFeed(
        validationResult,
        nextTarget
      );
      setSyncedTracks(tracks);
      onImportAuthenticatedFeed(rawFeedText, tracks);
    }
  };

  const handleFavoriteAllSyncedArtists = () => {
    syncedTracks.forEach((track) => {
      addFavoriteSignal('artist', track.artist);
      track.tags.slice(0, 2).forEach((tag) => addFavoriteSignal('tag', tag));
    });
    setFavoritedSeedArtists(true);
  };

  return (
    <section
      id="youtube-cookie-guide-panel"
      aria-label="YouTubeFeedImporter — Step-by-Step Cookie Import & CLI Guide"
      className="bg-zinc-900/95 border-2 border-amber-400/50 rounded-xl p-4 sm:p-5 space-y-4 shadow-lg"
    >
      {/* Top Banner Header: High-Contrast Step 1 Badge + Quick Demo Button */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 bg-amber-400 text-zinc-950 font-mono text-[11px] font-bold uppercase tracking-wider rounded">
              Start Here · Step 1
            </span>
            <h2 className="text-base sm:text-lg font-display font-bold text-zinc-100 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Connect Your YouTube Feed (Tested yt-dlp CLI &amp; Song-Only Filter)</span>
            </h2>
            {activeCookieFlag && (
              <span className="text-[11px] font-mono text-amber-300 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded">
                Active: --ignore-config --no-warnings {activeCookieFlag}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-300">
            Includes <code className="font-mono text-emerald-300">--ignore-config --no-warnings</code> (prevents broken <code className="font-mono text-zinc-400">~/.config/yt-dlp/config</code> errors) and <code className="font-mono text-amber-300">--match-filter</code> so podcasts, livestreams, and videos over {Math.round(maxDurationSec / 60)} minutes are automatically skipped.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={handleLoadDemoCookiesTxt}
            className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold rounded-lg text-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Instant Test: Demo Feed + Podcast Filter</span>
          </button>

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-950/40 border border-emerald-500/30 rounded-lg text-[11px] text-emerald-300 font-medium">
            <Filter className="w-3.5 h-3.5 shrink-0" />
            <span>Songs Only · No Podcasts</span>
          </div>
        </div>
      </div>

      {/* Masked Validation & Authenticated Feed Status Readout (Immediately Visible at Top) */}
      {validationResult && (
        <div
          role="status"
          className={`rounded-lg p-3.5 border text-xs space-y-2.5 ${
            validationResult.isValid
              ? 'bg-emerald-950/35 border-emerald-500/50 text-zinc-100'
              : 'bg-rose-950/35 border-rose-500/50 text-rose-200'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-medium">
              {validationResult.isValid ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{validationResult.statusMessage}</span>
            </div>

            {validationResult.isValid && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-[11px] text-zinc-400">
                  {validationResult.fingerprintHash}
                </span>
                <button
                  type="button"
                  onClick={handlePurgeSession}
                  className="px-2 py-1 bg-zinc-900 hover:bg-rose-950/60 text-zinc-300 hover:text-rose-300 border border-zinc-800 rounded text-[11px] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              </div>
            )}
          </div>

          {filteredNonMusic.length > 0 && (
            <div className="bg-zinc-950/80 border border-zinc-800 rounded-md px-3 py-2 text-[11px] text-zinc-300 space-y-1">
              <div className="font-semibold text-amber-300">
                Excluded {filteredNonMusic.length} Non-Music / Podcast Videos:
              </div>
              <div className="flex flex-wrap gap-2">
                {filteredNonMusic.slice(0, 4).map((item, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded font-mono text-[10px] text-zinc-400"
                  >
                    ✕ {item.title.slice(0, 38)} ({item.reason})
                  </span>
                ))}
              </div>
            </div>
          )}

          {validationResult.isValid && (
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 pt-2 border-t border-zinc-800/80">
              <div className="text-[11px] font-mono text-zinc-400 flex items-center flex-wrap gap-2">
                <span className="text-zinc-300">Session / Filter Keys:</span>
                {validationResult.entries.slice(0, 5).map((entry) => (
                  <span key={`${entry.domain}-${entry.name}`} className="text-amber-300">
                    {entry.name}={entry.maskedValue}
                  </span>
                ))}
              </div>

              {syncedTracks.length > 0 && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-emerald-300 font-mono font-semibold">
                    Kept {syncedTracks.length} music songs from {feedTarget}
                  </span>
                  <button
                    type="button"
                    onClick={handleFavoriteAllSyncedArtists}
                    className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-zinc-950 rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    {favoritedSeedArtists ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Saved Feed Artists to Favorites</span>
                      </>
                    ) : (
                      <>
                        <Heart className="w-3 h-3" />
                        <span>Favorite Synced Feed Artists</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Global Browser, Feed & Song-Only Filter Bar */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-amber-300 whitespace-nowrap">
              1. Your Browser:
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              {BROWSER_OPTIONS.slice(0, 5).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() =>
                    onUpdateCookieSettings({
                      cookieSource,
                      cookieBrowser: b.id,
                      cookieProfile,
                      cookieFilePath,
                    })
                  }
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    cookieBrowser === b.id
                      ? 'bg-amber-400 text-zinc-950 font-semibold'
                      : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label
              htmlFor="importer-feed-target"
              className="text-xs font-semibold text-amber-300 whitespace-nowrap"
            >
              2. Target Feed:
            </label>
            <select
              id="importer-feed-target"
              aria-label="Target YouTube Feed"
              value={feedTarget}
              onChange={(e) => handleChangeFeedTarget(e.target.value as YouTubeFeedTarget)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-100 focus:outline-none focus:border-amber-400"
            >
              {FEED_TARGET_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Song-Only / Anti-Podcast Filter Strip */}
        <div className="pt-2.5 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="inline-flex items-center gap-2 text-zinc-200 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={musicOnlyFilter}
                onChange={(e) => setMusicOnlyFilter(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-amber-400 focus:ring-amber-400"
              />
              <span>
                Filter Songs Only (<code className="font-mono text-amber-300 text-[11px]">filterMusicTracks</code> · skips <code className="font-mono text-emerald-300 text-[11px]">&apos;podcast&apos;, &apos;news&apos;, &apos;update&apos;</code> &amp; &gt;{Math.round(maxDurationSec / 60)}m)
              </span>
            </label>

            <label className="inline-flex items-center gap-2 text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={strictMusicCategory}
                onChange={(e) => setStrictMusicCategory(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-amber-400 focus:ring-amber-400"
              />
              <span>
                Strict Music Category (<code className="font-mono text-emerald-300 text-[11px]">categories *= &apos;Music&apos;</code>)
              </span>
            </label>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor="max-song-duration" className="text-[11px] text-zinc-400 whitespace-nowrap">
              Max Song Length:
            </label>
            <select
              id="max-song-duration"
              value={maxDurationSec}
              onChange={(e) => setMaxDurationSec(Number(e.target.value))}
              className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-400"
            >
              <option value={480}>8 min (480s — Radio Tracks)</option>
              <option value={600}>10 min (600s — Songs Only, No Podcasts)</option>
              <option value={900}>15 min (900s — Extended Club Mixes)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3 Big Visual Method Cards / Tabs */}
      <div
        role="tablist"
        aria-label="Cookie Authentication Method"
        className="grid grid-cols-1 md:grid-cols-3 gap-2.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={authMethodTab === 'browser-cli'}
          onClick={() => {
            setAuthMethodTab('browser-cli');
            onUpdateCookieSettings({
              cookieSource: 'browser',
              cookieBrowser,
              cookieProfile,
              cookieFilePath,
            });
          }}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
            authMethodTab === 'browser-cli'
              ? 'bg-amber-400/15 border-amber-400 text-zinc-100'
              : 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
          }`}
        >
          <span
            className={`w-6 h-6 rounded-full text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5 ${
              authMethodTab === 'browser-cli'
                ? 'bg-amber-400 text-zinc-950'
                : 'bg-zinc-800 text-zinc-300'
            }`}
          >
            1
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-100">
              Option 1: 1-Command Terminal Fetch (Recommended)
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
              Tested command with <code className="font-mono text-emerald-300">--ignore-config</code> + song filter. Saves <code className="font-mono text-amber-300">my-youtube-feed.txt</code>.
            </div>
          </div>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={authMethodTab === 'cookies-file'}
          onClick={() => setAuthMethodTab('cookies-file')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
            authMethodTab === 'cookies-file'
              ? 'bg-amber-400/15 border-amber-400 text-zinc-100'
              : 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
          }`}
        >
          <span
            className={`w-6 h-6 rounded-full text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5 ${
              authMethodTab === 'cookies-file'
                ? 'bg-amber-400 text-zinc-950'
                : 'bg-zinc-800 text-zinc-300'
            }`}
          >
            2
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-100">
              Option 2: Upload Feed or cookies.txt
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
              Upload your generated <code className="font-mono text-amber-300">my-youtube-feed.txt</code> or Netscape <code className="font-mono text-amber-300">cookies.txt</code>.
            </div>
          </div>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={authMethodTab === 'session-string'}
          onClick={() => setAuthMethodTab('session-string')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
            authMethodTab === 'session-string'
              ? 'bg-amber-400/15 border-amber-400 text-zinc-100'
              : 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
          }`}
        >
          <span
            className={`w-6 h-6 rounded-full text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5 ${
              authMethodTab === 'session-string'
                ? 'bg-amber-400 text-zinc-950'
                : 'bg-zinc-800 text-zinc-300'
            }`}
          >
            3
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-100">
              Option 3: Paste Cookie String (F12)
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
              Copy your <code className="font-mono text-amber-300">Cookie:</code> header from Browser DevTools (<code className="font-mono">F12</code>) and paste here.
            </div>
          </div>
        </button>
      </div>

      {/* =====================================================================
          OPTION 1: 1-COMMAND TERMINAL FEED GRABBER (--ignore-config --no-warnings)
      ===================================================================== */}
      {authMethodTab === 'browser-cli' && (
        <div className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Step 1 & Step 2: Copy & Run Tested Command (7 cols) */}
            <div className="lg:col-span-7 bg-zinc-900/90 border border-amber-400/40 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-amber-400 text-zinc-950 font-mono text-[11px] font-bold rounded">
                    STEP 1
                  </span>
                  <span className="text-xs font-semibold text-zinc-100">
                    Copy &amp; Run This Command in Your Terminal
                  </span>
                </div>
                <span className="text-[11px] font-mono text-emerald-300">
                  Fixes config crash · Filters songs ≤{Math.round(maxDurationSec / 60)}m
                </span>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed">
                Uses <code className="font-mono text-emerald-300">--ignore-config --no-warnings</code> so broken local config files never fail, reads your <strong className="text-amber-300">{cookieBrowser}</strong> cookies, skips podcasts/videos over {Math.round(maxDurationSec / 60)}m, and saves <code className="font-mono text-amber-300">my-youtube-feed.txt</code>:
              </p>

              <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs font-mono text-amber-300 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed select-all">
                {oneStepFeedDumpCmd}
              </pre>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <label htmlFor="cli-feed-limit" className="text-[11px] text-zinc-400">
                    Scan Limit:
                  </label>
                  <select
                    id="cli-feed-limit"
                    value={feedLimit}
                    onChange={(e) => setFeedLimit(Number(e.target.value))}
                    className="bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-400"
                  >
                    <option value={25}>25 items</option>
                    <option value={35}>35 items</option>
                    <option value={50}>50 items</option>
                    <option value={100}>100 items</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => copyCommandText(oneStepFeedDumpCmd, 'one-step-dump')}
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold rounded-lg text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer shadow"
                >
                  {copiedKey === 'one-step-dump' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied Command!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Working yt-dlp Command</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Step 2: Upload my-youtube-feed.txt (5 cols) */}
            <div className="lg:col-span-5 bg-amber-400/5 border-2 border-dashed border-amber-400/50 rounded-xl p-4 flex flex-col justify-between text-center space-y-3">
              <div className="space-y-1.5 my-auto">
                <div className="flex items-center justify-center gap-2">
                  <span className="px-2 py-0.5 bg-amber-400 text-zinc-950 font-mono text-[11px] font-bold rounded">
                    STEP 2
                  </span>
                  <span className="text-sm font-display font-semibold text-zinc-100">
                    Upload my-youtube-feed.txt
                  </span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Select the <code className="font-mono text-amber-300">my-youtube-feed.txt</code> file created by the command. Any remaining podcasts, interviews, or non-music videos are automatically filtered out!
                </p>
                {uploadedFileName && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-400/15 border border-amber-400/40 rounded-md text-xs font-mono text-amber-300">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Loaded: {uploadedFileName}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold rounded-lg text-xs inline-flex items-center justify-center gap-2 cursor-pointer shadow">
                  <Upload className="w-4 h-4" />
                  <span>Upload my-youtube-feed.txt</span>
                  <input
                    type="file"
                    aria-label="Upload my-youtube-feed.txt file"
                    accept=".txt,.jsonl,text/plain"
                    onChange={handleCookiesOrFeedFileUpload}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleLoadDemoCookiesTxt}
                  className="w-full py-1.5 px-3 bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-zinc-700 rounded-lg text-[11px] font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Test with Sample Feed + Podcast Filter</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          OPTION 2: UPLOAD COOKIES.TXT OR FEED FILE + VISUAL GUIDE
      ===================================================================== */}
      {authMethodTab === 'cookies-file' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-zinc-950/90 border border-zinc-800 rounded-xl p-4">
          {/* Left 7 cols: Step-by-step visual guide on HOW to get cookies.txt */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <HelpCircle className="w-4 h-4 shrink-0" />
              <span>How to Export cookies.txt (Choose Way A or Way B):</span>
            </div>

            {/* Way A: 1-Line Terminal Command (With --ignore-config --no-warnings) */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-100">
                  Way A (Terminal · Includes --ignore-config): Export cookies.txt
                </span>
                <span className="text-[11px] font-mono text-emerald-300">
                  Uses {cookieBrowser} cookies
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Run this command to save <code className="font-mono text-amber-300">./cookies.txt</code> in your current folder without triggering config errors:
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <code className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-[11px] font-mono text-amber-300 overflow-x-auto whitespace-nowrap">
                  {exportCookiesTxtCmd}
                </code>
                <button
                  type="button"
                  onClick={() => copyCommandText(exportCookiesTxtCmd, 'export-cookie-cmd')}
                  className="px-3 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold rounded-lg text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {copiedKey === 'export-cookie-cmd' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied Command!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Command</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Way B: Browser Extension */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-3 space-y-1.5">
              <div className="text-xs font-semibold text-zinc-200">
                Way B (Browser Extension): Export in 2 Clicks
              </div>
              <ol className="text-[11px] text-zinc-400 space-y-1 list-decimal list-inside">
                <li>
                  Install <strong className="text-zinc-200">&ldquo;cookies.txt&rdquo;</strong> (Firefox) or <strong className="text-zinc-200">&ldquo;Get cookies.txt LOCALLY&rdquo;</strong> (Chrome/Brave/Edge).
                </li>
                <li>
                  Open <code className="font-mono text-zinc-300">youtube.com</code> while signed in and click <strong className="text-amber-300">Export cookies.txt</strong>.
                </li>
              </ol>
            </div>
          </div>

          {/* Right 5 cols: Prominent Upload Dropzone Box */}
          <div className="lg:col-span-5 flex flex-col justify-between bg-amber-400/5 border-2 border-dashed border-amber-400/50 rounded-xl p-4 text-center space-y-3">
            <div className="space-y-1.5 my-auto">
              <div className="w-10 h-10 rounded-full bg-amber-400/20 text-amber-300 flex items-center justify-center mx-auto">
                <Upload className="w-5 h-5" />
              </div>
              <div className="text-sm font-display font-semibold text-zinc-100">
                Upload File Here
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Accepts both <code className="font-mono text-amber-300">my-youtube-feed.txt</code> and Netscape <code className="font-mono text-amber-300">cookies.txt</code> files.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <label className="w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold rounded-lg text-xs transition-colors inline-flex items-center justify-center gap-2 cursor-pointer shadow">
                <Upload className="w-4 h-4" />
                <span>Choose cookies.txt or Feed File</span>
                <input
                  type="file"
                  aria-label="Upload cookies.txt file"
                  accept=".txt,.jsonl,text/plain"
                  onChange={handleCookiesOrFeedFileUpload}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleLoadDemoCookiesTxt}
                className="w-full py-2 px-3 bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-zinc-700 rounded-lg text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Try Demo Feed &amp; Podcast Filter</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          OPTION 3: PASTE YOUTUBE SESSION COOKIE STRING (DEVTOOLS F12 GUIDE)
      ===================================================================== */}
      {authMethodTab === 'session-string' && (
        <form
          onSubmit={handleVerifySessionString}
          className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 space-y-3.5"
        >
          {/* Visual 3-Step Mini Guide for DevTools F12 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-2.5">
              <div className="font-mono text-[11px] text-amber-400 font-bold">
                STEP 1 · OPEN DEVTOOLS
              </div>
              <p className="text-[11px] text-zinc-300 mt-1">
                Open <code className="font-mono text-amber-300">youtube.com</code> (logged in), press <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-[10px]">F12</kbd>, and click the <strong>Network</strong> tab.
              </p>
            </div>
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-2.5">
              <div className="font-mono text-[11px] text-amber-400 font-bold">
                STEP 2 · COPY COOKIE HEADER
              </div>
              <p className="text-[11px] text-zinc-300 mt-1">
                Click any request to <code className="font-mono">youtube.com</code>, scroll to <strong>Request Headers</strong>, and copy the <code className="font-mono text-amber-300">Cookie:</code> value.
              </p>
            </div>
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-2.5">
              <div className="font-mono text-[11px] text-amber-400 font-bold">
                STEP 3 · PASTE &amp; AUTHENTICATE
              </div>
              <p className="text-[11px] text-zinc-300 mt-1">
                Paste below. Keys (<code className="font-mono">SAPISID</code>, <code className="font-mono">__Secure-3PSID</code>, <code className="font-mono">LOGIN_INFO</code>) are verified locally &amp; masked.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <label
              htmlFor="youtube-session-cookie-input"
              className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Paste YouTube Cookie Header or Netscape Lines</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowRawInput((prev) => !prev)}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1 cursor-pointer"
              >
                {showRawInput ? (
                  <>
                    <EyeOff className="w-3 h-3" />
                    <span>Mask Input</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" />
                    <span>Show Input</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleLoadDemoSessionString}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-zinc-700 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
              >
                Use Demo Session Cookie
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="youtube-session-cookie-input"
              type={showRawInput ? 'text' : 'password'}
              aria-label="YouTube session cookie string"
              value={sessionInput}
              onChange={(e) => setSessionInput(e.target.value)}
              placeholder="SAPISID=...; __Secure-3PSID=...; LOGIN_INFO=... (cleared from input after verification)"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Authenticate &amp; Sync Feed</span>
            </button>
          </div>
        </form>
      )}

      {/* Always-Visible Ready-to-Run yt-dlp Cookie Feed CLI Bar */}
      <div className="pt-2 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[11px] font-mono font-semibold text-amber-300 shrink-0">
            Live yt-dlp CLI:
          </span>
          <code className="text-[11px] font-mono text-zinc-200 truncate bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-lg flex-1">
            {generatedCliCommand}
          </code>
        </div>
        <button
          type="button"
          onClick={() => copyCommandText(generatedCliCommand, 'live-cli-bar')}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
        >
          {copiedKey === 'live-cli-bar' ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Copied CLI</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy yt-dlp Feed CLI</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
}
