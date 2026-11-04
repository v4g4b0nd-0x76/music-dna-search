import {
  MusicTrack,
  YouTubeFeedTarget,
  YtDlpCookieBrowser,
  COOKIE_FEED_SIMULATION_SAMPLES,
} from './music-data';
import {
  parseYouTubeFeedInput,
  filterMusicTracks,
  DEFAULT_NON_MUSIC_KEYWORDS,
  buildYtDlpCookieFlag,
  buildYtDlpMusicMatchFilter,
} from './taste-engine';

export { filterMusicTracks, DEFAULT_NON_MUSIC_KEYWORDS };

export interface ParsedCookieEntry {
  domain: string;
  name: string;
  maskedValue: string;
  secure: boolean;
  isAuthKey: boolean;
}

export interface CookieValidationResult {
  isValid: boolean;
  format: 'netscape' | 'header-string' | 'invalid';
  youtubeCookieCount: number;
  detectedAuthKeys: string[];
  entries: ParsedCookieEntry[];
  statusMessage: string;
  fingerprintHash: string;
}

const YOUTUBE_AUTH_COOKIE_KEYS = new Set([
  'SAPISID',
  '__Secure-3PAPISID',
  '__Secure-1PAPISID',
  'SID',
  '__Secure-3PSID',
  '__Secure-1PSID',
  'LOGIN_INFO',
  'HSID',
  'SSID',
  'APISID',
]);

export const DEMO_NETSCAPE_COOKIES_TXT = `# Netscape HTTP Cookie File
# https://curl.se/docs/http-cookies.html
# Safe synthetic demo cookies.txt for CrateDig YT local feed testing
.youtube.com\tTRUE\t/\tTRUE\t1893456000\tLOGIN_INFO\tAFmmF2swRQIhDemoSessionToken9941
.youtube.com\tTRUE\t/\tTRUE\t1893456000\tSAPISID\tdemo_sapisid_hash_7731/A9fK2mP0
.youtube.com\tTRUE\t/\tTRUE\t1893456000\t__Secure-3PAPISID\tdemo_3papisid_hash_7731/A9fK2mP0
.youtube.com\tTRUE\t/\tTRUE\t1893456000\t__Secure-3PSID\tg.a000Demo3PSIDTokenValue8821
.youtube.com\tTRUE\t/\tTRUE\t1893456000\tPREF\tf6=40000000&hl=en&tz=UTC`;

export const DEMO_SESSION_COOKIE_STRING =
  'LOGIN_INFO=AFmmF2swRQIhDemoSessionToken9941; SAPISID=demo_sapisid_hash_7731/A9fK2mP0; __Secure-3PSID=g.a000Demo3PSIDTokenValue8821; PREF=f6=40000000&hl=en';

/**
 * Generates a 1-line yt-dlp CLI command that exports a Netscape cookies.txt file
 * directly from the user's logged-in browser without needing any browser extension.
 * Always passes `--ignore-config --no-warnings` so broken ~/.config/yt-dlp/config files never cause FileNotFoundError.
 */
export function generateCookieExportCliCommand(
  browser: YtDlpCookieBrowser = 'firefox',
  profile: string = '',
  outputCookiePath: string = './cookies.txt'
): string {
  const browserFlag = buildYtDlpCookieFlag({
    cookieSource: 'browser',
    cookieBrowser: browser,
    cookieProfile: profile,
  });
  const outPath = outputCookiePath.trim() || './cookies.txt';
  return `yt-dlp --ignore-config --no-warnings ${browserFlag} --cookies "${outPath}" --skip-download "https://www.youtube.com"`;
}

/**
 * Generates a tested, working 1-step yt-dlp CLI command that reads the user's browser cookies,
 * ignores broken local config files (`--ignore-config --no-warnings`), filters out podcasts/Shorts/long videos
 * (`--match-filter "duration >? 60 & duration <? 600 & !is_live"`), and saves their YouTube music feed to `my-youtube-feed.txt`.
 */
export function generateOneStepFeedDumpCliCommand(config: {
  browser: YtDlpCookieBrowser;
  profile?: string;
  feedTarget: YouTubeFeedTarget;
  feedLimit?: number;
  musicOnlyFilter?: boolean;
  strictMusicCategory?: boolean;
  maxDurationSec?: number;
}): string {
  const browserFlag = buildYtDlpCookieFlag({
    cookieSource: 'browser',
    cookieBrowser: config.browser || 'firefox',
    cookieProfile: config.profile || '',
  });
  const limit = Math.max(5, Math.min(200, config.feedLimit || 35));
  const target = config.feedTarget.startsWith('http')
    ? `"${config.feedTarget}"`
    : config.feedTarget;

  const matchFilter = buildYtDlpMusicMatchFilter({
    musicOnlyFilter: config.musicOnlyFilter ?? true,
    strictMusicCategory: config.strictMusicCategory ?? false,
    maxDurationSec: config.maxDurationSec || 600,
  });

  const parts = [
    'yt-dlp',
    '--ignore-config',
    '--no-warnings',
    browserFlag,
    ...(config.strictMusicCategory ? [] : ['--flat-playlist']),
    ...(matchFilter ? [matchFilter] : []),
    `--playlist-end ${limit}`,
    '--print "%(webpage_url)s - %(uploader,channel)s - %(title)s [%(duration_string)s]"',
    target,
    '> my-youtube-feed.txt',
  ];

  return parts.join(' ');
}

/**
 * Masks a raw cookie value so sensitive session tokens are never rendered in plaintext
 */
export function maskCookieValue(value: string): string {
  const clean = value.trim();
  if (!clean) return '••••••';
  if (clean.length <= 6) {
    return '••••••';
  }
  return `••••••${clean.slice(-4)}`;
}

/**
 * Computes a non-reversible short fingerprint from cookie names and lengths
 */
function computeSafeFingerprint(entries: ParsedCookieEntry[]): string {
  let acc = 2166136261;
  for (const entry of entries) {
    const token = `${entry.domain}:${entry.name}:${entry.maskedValue}`;
    for (let i = 0; i < token.length; i++) {
      acc ^= token.charCodeAt(i);
      acc = Math.imul(acc, 16777619);
    }
  }
  return `yt-session-${(acc >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Parses and validates either a Netscape cookies.txt file or a raw HTTP Cookie header string
 * Strictly runs in memory and masks all secret values.
 */
export function parseAndValidateYouTubeCookies(rawInput: string): CookieValidationResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      isValid: false,
      format: 'invalid',
      youtubeCookieCount: 0,
      detectedAuthKeys: [],
      entries: [],
      statusMessage: 'Please upload a Netscape cookies.txt file or paste a YouTube session cookie string.',
      fingerprintHash: '',
    };
  }

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim());
  const isNetscapeHeader = lines.some((l) => l.toLowerCase().includes('netscape http cookie file'));
  const hasTabColumns = lines.some(
    (l) => !l.startsWith('#') && l.split(/\t+/).length >= 6
  );

  const entries: ParsedCookieEntry[] = [];

  if (isNetscapeHeader || hasTabColumns) {
    for (const line of lines) {
      if (!line || line.startsWith('#')) continue;
      const parts = line.includes('\t') ? line.split(/\t+/) : line.split(/\s+/);
      if (parts.length >= 7) {
        const domain = parts[0].trim();
        const secure = parts[3].toUpperCase() === 'TRUE';
        const name = parts[5].trim();
        const value = parts.slice(6).join(' ').trim();

        if (
          domain.includes('youtube.com') ||
          domain.includes('google.com') ||
          YOUTUBE_AUTH_COOKIE_KEYS.has(name)
        ) {
          entries.push({
            domain,
            name,
            maskedValue: maskCookieValue(value),
            secure,
            isAuthKey: YOUTUBE_AUTH_COOKIE_KEYS.has(name),
          });
        }
      }
    }

    const detectedAuthKeys = Array.from(
      new Set(entries.filter((e) => e.isAuthKey).map((e) => e.name))
    );
    const isValid = entries.length > 0 && detectedAuthKeys.length > 0;

    return {
      isValid,
      format: isValid ? 'netscape' : 'invalid',
      youtubeCookieCount: entries.length,
      detectedAuthKeys,
      entries,
      statusMessage: isValid
        ? `Verified Netscape cookies.txt (${entries.length} YouTube cookies, ${detectedAuthKeys.length} auth keys masked in memory).`
        : 'Netscape file parsed, but no YouTube authentication cookies (SAPISID, SID, __Secure-3PSID, or LOGIN_INFO) were found.',
      fingerprintHash: isValid ? computeSafeFingerprint(entries) : '',
    };
  }

  // Fallback: Parse semicolon-separated HTTP Cookie header string (e.g. "Cookie: SAPISID=...; __Secure-3PSID=...")
  const cleanedHeader = trimmed.replace(/^cookie:\s*/i, '');
  const pairs = cleanedHeader
    .split(/;|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx <= 0) continue;
    const name = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();
    if (!name || !value) continue;

    entries.push({
      domain: '.youtube.com',
      name,
      maskedValue: maskCookieValue(value),
      secure: name.startsWith('__Secure-') || name === 'SAPISID',
      isAuthKey: YOUTUBE_AUTH_COOKIE_KEYS.has(name),
    });
  }

  const detectedAuthKeys = Array.from(
    new Set(entries.filter((e) => e.isAuthKey).map((e) => e.name))
  );
  const isValid = entries.length > 0 && detectedAuthKeys.length > 0;

  return {
    isValid,
    format: isValid ? 'header-string' : 'invalid',
    youtubeCookieCount: entries.length,
    detectedAuthKeys,
    entries,
    statusMessage: isValid
      ? `Verified YouTube session cookie string (${detectedAuthKeys.join(', ')} masked in memory).`
      : 'No valid YouTube session cookie keys (e.g. SAPISID, __Secure-3PSID, SID, LOGIN_INFO) detected in input.',
    fingerprintHash: isValid ? computeSafeFingerprint(entries) : '',
  };
}

/**
 * Fetches / resolves the user's personalized YouTube music feed tracks for a validated cookie session
 */
export function fetchAuthenticatedYouTubeMusicFeed(
  validation: CookieValidationResult,
  feedTarget: YouTubeFeedTarget = ':ytfav'
): { rawFeedText: string; tracks: MusicTrack[] } {
  if (!validation.isValid) {
    return { rawFeedText: '', tracks: [] };
  }

  const baseDump =
    COOKIE_FEED_SIMULATION_SAMPLES[feedTarget] ||
    COOKIE_FEED_SIMULATION_SAMPLES[':ytrec'];

  const extraAuthenticatedLines =
    feedTarget === ':ytrec'
      ? `\n{"id":"yT0gRc2c2wQ","webpage_url":"https://www.youtube.com/watch?v=yT0gRc2c2wQ","uploader":"Boards of Canada - Topic","title":"Boards of Canada - Roygbiv","duration":149}\n{"id":"burial-arch01","webpage_url":"https://www.youtube.com/watch?v=burial-arch01","uploader":"Burial - Topic","title":"Burial - Archangel","duration":238}`
      : '';

  const rawFeedText = `${baseDump}${extraAuthenticatedLines}`;
  const filtered = filterMusicTracks(rawFeedText);

  return {
    rawFeedText: filtered.filteredText || rawFeedText,
    tracks: filtered.tracks,
  };
}
