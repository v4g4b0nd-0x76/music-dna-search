import {
  MusicTrack,
  TasteProfile,
  YtDlpOptions,
  YtDlpCookieSource,
  YtDlpCookieBrowser,
  YtDlpFeedCookieConfig,
  AlgorithmMode,
  CURATED_CATALOG,
} from './music-data';

export interface ParsedFeedLine {
  raw: string;
  youtubeId?: string;
  youtubeUrl: string;
  artist: string;
  title: string;
  inferredTags: string[];
  inferredCategory: string;
}

export interface FilteredNonMusicItem {
  rawLine: string;
  title: string;
  reason: string;
  matchedKeyword?: string;
}

export interface FeedParseReport {
  tracks: MusicTrack[];
  filteredOut: FilteredNonMusicItem[];
  keptLines: string[];
  filteredText: string;
  totalInputLines: number;
}

export interface FilterMusicTracksOptions {
  keywords?: string[];
  maxDurationSec?: number;
  minDurationSec?: number;
  filterNonMusic?: boolean;
}

export type FilteredMusicTracksResult = MusicTrack[] & {
  tracks: MusicTrack[];
  filteredOut: FilteredNonMusicItem[];
  keptLines: string[];
  filteredText: string;
  totalInputLines: number;
  activeKeywords: string[];
};

export const DEFAULT_NON_MUSIC_KEYWORDS: readonly string[] = [
  'podcast',
  'news',
  'update',
  'interview',
  'episode',
  'tutorial',
  'walkthrough',
  'gameplay',
  'review',
  'unboxing',
  'reaction',
  'vlog',
  'lecture',
  'keynote',
  'debate',
  'audiobook',
  'documentary',
  'shorts',
];

/**
 * Builds the yt-dlp cookie authentication CLI argument (--cookies-from-browser or --cookies)
 */
export function buildYtDlpCookieFlag(config: {
  cookieSource?: YtDlpCookieSource;
  cookieBrowser?: YtDlpCookieBrowser;
  cookieProfile?: string;
  cookieFilePath?: string;
}): string {
  const source = config.cookieSource || 'none';
  if (source === 'browser') {
    const browser = config.cookieBrowser || 'chrome';
    const profile = (config.cookieProfile || '').trim();
    return profile
      ? `--cookies-from-browser "${browser}:${profile}"`
      : `--cookies-from-browser ${browser}`;
  }
  if (source === 'file') {
    const path = (config.cookieFilePath || './cookies.txt').trim();
    return `--cookies "${path}"`;
  }
  return '';
}

/**
 * Builds the yt-dlp --match-filter expression to keep songs (60s - maxDurationSec, not live)
 * and exclude Shorts, podcasts, livestreams, and long non-music videos.
 */
export function buildYtDlpMusicMatchFilter(options?: {
  musicOnlyFilter?: boolean;
  strictMusicCategory?: boolean;
  maxDurationSec?: number;
}): string {
  if (options?.musicOnlyFilter === false) {
    return '';
  }
  const maxSec = Math.max(180, Math.min(3600, options?.maxDurationSec || 600));
  const conditions = [`duration >? 60`, `duration <? ${maxSec}`, `!is_live`];
  if (options?.strictMusicCategory) {
    conditions.push(`categories *= 'Music'`);
  }
  return `--match-filter "${conditions.join(' & ')}"`;
}

/**
 * Generates a yt-dlp CLI command that authenticates with the user's cookies to extract or download their personal YouTube feed.
 * Always includes `--ignore-config --no-warnings` so broken ~/.config/yt-dlp/config files never cause FileNotFoundError crashes,
 * and includes `--match-filter` to filter only songs (1–10 mins, no podcasts/streams).
 */
export function generateYtDlpFeedFetchCommand(config: YtDlpFeedCookieConfig): string {
  const cookieFlag = buildYtDlpCookieFlag(config);
  const limit = Math.max(5, Math.min(200, config.feedLimit || 35));
  const target = config.feedTarget.startsWith('http')
    ? `"${config.feedTarget}"`
    : config.feedTarget;

  const baseParts = ['yt-dlp', '--ignore-config', '--no-warnings'];
  if (cookieFlag) {
    baseParts.push(cookieFlag);
  }

  const matchFilterFlag = buildYtDlpMusicMatchFilter({
    musicOnlyFilter: config.musicOnlyFilter ?? true,
    strictMusicCategory: config.strictMusicCategory ?? false,
    maxDurationSec: config.maxDurationSec || 600,
  });

  if (config.outputMode === 'direct-audio') {
    return [
      ...baseParts,
      ...(matchFilterFlag ? [matchFilterFlag] : []),
      `--playlist-end ${limit}`,
      '-x --audio-format mp3 --audio-quality 0',
      '--embed-metadata --embed-thumbnail',
      '-o "%(artist,uploader)s - %(title)s.%(ext)s"',
      target,
    ].join(' ');
  }

  if (config.outputMode === 'dump-json') {
    return [
      ...baseParts,
      '--flat-playlist',
      ...(matchFilterFlag ? [matchFilterFlag] : []),
      `--playlist-end ${limit}`,
      '--dump-json',
      target,
      '> my-youtube-feed.jsonl',
    ].join(' ');
  }

  const printParts = [
    ...baseParts,
    ...(config.strictMusicCategory ? [] : ['--flat-playlist']),
    ...(matchFilterFlag ? [matchFilterFlag] : []),
    `--playlist-end ${limit}`,
    '--print "%(webpage_url)s - %(uploader,channel)s - %(title)s"',
    target,
  ];

  const printCmd = printParts.join(' ');

  if (config.outputMode === 'export-file') {
    return `${printCmd} > my-youtube-feed.txt`;
  }

  return printCmd;
}

/**
 * Extracts a YouTube 11-char video ID from standard watch URLs, youtu.be links, or raw IDs
 */
export function extractYouTubeId(input: string): string | undefined {
  const watchMatch = input.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  if (watchMatch && watchMatch[1]) {
    return watchMatch[1];
  }
  return undefined;
}

/**
 * Parses a duration string like "4:29" or "1:24:10" into total seconds, if valid.
 */
export function parseDurationTokenToSeconds(token: string): number | undefined {
  const cleaned = token.trim();
  const match = cleaned.match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/);
  if (!match) return undefined;
  const hours = match[1] ? Number(match[1]) : 0;
  const mins = Number(match[2]);
  const secs = Number(match[3]);
  if (Number.isNaN(hours) || Number.isNaN(mins) || Number.isNaN(secs)) return undefined;
  return hours * 3600 + mins * 60 + secs;
}

const NON_MUSIC_PODCAST_PATTERNS: { pattern: RegExp; label: string; keyword: string }[] = [
  { pattern: /\bpodcast\b/i, label: "Keyword: 'podcast'", keyword: 'podcast' },
  { pattern: /\bnews\b|\bbreaking\s+news\b|\bnews\s+report\b/i, label: "Keyword: 'news'", keyword: 'news' },
  { pattern: /\bupdate\b|\bstatus\s+update\b|\bdev\s+update\b/i, label: "Keyword: 'update'", keyword: 'update' },
  { pattern: /\bfull\s+episode\b|\bepisode\s*#?\d+|\bep\.?\s*#?\d+\b/i, label: 'Podcast / Episode', keyword: 'episode' },
  { pattern: /\binterview\b|\btalk\s+show\b|\bpress\s+conference\b|\bdebate\b/i, label: 'Interview / Talk', keyword: 'interview' },
  { pattern: /\btedx?\b|\bkeynote\b|\blecture\b|\bfull\s+course\b|\bcrash\s+course\b/i, label: 'Lecture / Talk', keyword: 'lecture' },
  { pattern: /\btutorial\b|\bhow\s+to\b|\bwalkthrough\b|\bexplained\b/i, label: 'Tutorial / How-To', keyword: 'tutorial' },
  { pattern: /\bgameplay\b|\blet'?s\s+play\b|\bspeedrun\b|\bstream\s+vod\b|\bfull\s+stream\b/i, label: 'Gaming / Stream VOD', keyword: 'gameplay' },
  { pattern: /\bunboxing\b|\breview\b|\btier\s+list\b|\breaction\b|\bvlog\b|\bq&a\b/i, label: 'Vlog / Review / Non-Music', keyword: 'review' },
  { pattern: /\baudiobook\b|\bdocumentary\b|\bstand-?up\s+comedy\b/i, label: 'Long-Form Non-Music', keyword: 'documentary' },
  { pattern: /#shorts\b|\/shorts\//i, label: 'YouTube Short', keyword: 'shorts' },
];

/**
 * Escapes special regex characters in a user-provided keyword string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks whether a parsed feed item is a podcast, news clip, update video, interview, tutorial, Short, or long non-music video
 */
export function checkNonMusicOrPodcast(params: {
  rawLine: string;
  uploader: string;
  title: string;
  durationSec?: number;
  maxDurationSec?: number;
  minDurationSec?: number;
  customKeywords?: string[];
}): { excluded: boolean; reason: string; matchedKeyword?: string } {
  const maxDur = params.maxDurationSec ?? 600; // default 10 minutes max for songs
  const minDur = params.minDurationSec ?? 45; // default 45 seconds min to skip Shorts

  // 1. Check explicit title & line keywords first (e.g., 'podcast', 'news', 'update', or custom keywords)
  const titleAndLine = `${params.title} ${params.uploader} ${params.rawLine}`;

  if (params.customKeywords && params.customKeywords.length > 0) {
    for (const rawKw of params.customKeywords) {
      const kw = rawKw.trim().toLowerCase();
      if (!kw) continue;
      const kwRegex = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i');
      if (kwRegex.test(titleAndLine)) {
        return {
          excluded: true,
          reason: `Keyword: '${kw}'`,
          matchedKeyword: kw,
        };
      }
    }
  }

  for (const rule of NON_MUSIC_PODCAST_PATTERNS) {
    if (rule.pattern.test(params.title) || rule.pattern.test(titleAndLine)) {
      return {
        excluded: true,
        reason: rule.label,
        matchedKeyword: rule.keyword,
      };
    }
  }

  // 2. Check duration bounds if available
  if (typeof params.durationSec === 'number' && params.durationSec > 0) {
    if (params.durationSec < minDur) {
      return {
        excluded: true,
        reason: `Short clip (${formatDuration(params.durationSec)} < ${minDur}s)`,
        matchedKeyword: 'short-duration',
      };
    }
    if (params.durationSec > maxDur) {
      return {
        excluded: true,
        reason: `Long video / podcast (${formatDuration(params.durationSec)} > ${Math.round(maxDur / 60)}m)`,
        matchedKeyword: 'long-duration',
      };
    }
  }

  return { excluded: false, reason: '' };
}

/**
 * Infers genre tags and category from artist/title/bracket annotations
 */
export function inferMetadataFromText(artist: string, title: string, bracketHint?: string): {
  tags: string[];
  category: string;
} {
  const combined = `${artist} ${title} ${bracketHint || ''}`.toLowerCase();
  const matchedCatalog = CURATED_CATALOG.find(
    (t) =>
      t.artist.toLowerCase() === artist.toLowerCase() ||
      combined.includes(t.artist.toLowerCase())
  );

  if (matchedCatalog) {
    return {
      tags: [...matchedCatalog.tags],
      category: matchedCatalog.category,
    };
  }

  const tags: string[] = [];
  let category = 'Electronic';

  if (combined.includes('funk') || combined.includes('soul') || combined.includes('groove')) {
    tags.push('psychedelic-funk', 'groovy', 'warm-analog');
    category = 'Indie & Funk';
  }
  if (combined.includes('synth') || combined.includes('chill') || combined.includes('wave')) {
    tags.push('synthwave', 'chillwave', 'analog-synth');
    category = 'Synthwave & Chill';
  }
  if (combined.includes('psych') || combined.includes('rock') || combined.includes('impala')) {
    tags.push('psychedelic-pop', 'hypnotic');
    category = 'Psychedelic Rock';
  }
  if (combined.includes('jazz') || combined.includes('downtempo') || combined.includes('lofi')) {
    tags.push('downtempo', 'nu-jazz');
    category = 'Downtempo & Jazz';
  }
  if (combined.includes('break') || combined.includes('garage') || combined.includes('idm') || combined.includes('electronic')) {
    tags.push('breakbeat', 'melodic-electronic');
    category = 'Electronic';
  }

  if (bracketHint) {
    const parts = bracketHint
      .split(/[/,|]/)
      .map((s) => s.trim().toLowerCase().replace(/\s+/g, '-'))
      .filter((s) => Boolean(s) && !/^\d+:\d+$/.test(s));
    for (const p of parts) {
      if (!tags.includes(p)) tags.push(p);
    }
  }

  if (tags.length === 0) {
    tags.push('melodic-electronic', 'indie-discovery');
  }

  return { tags: tags.slice(0, 4), category };
}

/**
 * Parses a multi-line YouTube feed / watch history / yt-dlp cookie dump (.txt or .jsonl) into structured music tracks,
 * automatically filtering out podcasts, non-music videos, Shorts, and videos longer than maxDurationSec.
 */
export function parseYouTubeFeedInputWithReport(
  feedText: string,
  options?: {
    filterNonMusic?: boolean;
    maxDurationSec?: number;
    minDurationSec?: number;
    customKeywords?: string[];
  }
): FeedParseReport {
  const filterNonMusic = options?.filterNonMusic ?? true;
  const maxDurationSec = options?.maxDurationSec ?? 600;
  const minDurationSec = options?.minDurationSec ?? 45;

  const trimmedWhole = feedText.trim();
  if (!trimmedWhole) {
    return {
      tracks: [],
      filteredOut: [],
      keptLines: [],
      filteredText: '',
      totalInputLines: 0,
    };
  }

  let rawLines: string[] = [];
  if (trimmedWhole.startsWith('{') && trimmedWhole.includes('"entries"')) {
    try {
      const parsedObj = JSON.parse(trimmedWhole);
      if (Array.isArray(parsedObj.entries)) {
        rawLines = parsedObj.entries.map((e: unknown) => JSON.stringify(e));
      }
    } catch {
      rawLines = feedText.split('\n');
    }
  } else {
    rawLines = feedText.split('\n');
  }

  const lines = rawLines
    .map((l) => l.trim())
    .filter((l) => l.length > 2 && !l.startsWith('#'));

  const parsedTracks: MusicTrack[] = [];
  const filteredOut: FilteredNonMusicItem[] = [];
  const keptLines: string[] = [];

  lines.forEach((line, idx) => {
    let ytId: string | undefined;
    let bracketHint: string | undefined;
    let uploaderName = '';
    let artist = 'Unknown Artist';
    let title = `YouTube Feed Track ${idx + 1}`;
    let durationOverride: number | undefined;

    // 1. Check if line is a JSON object from `yt-dlp --dump-json` / `-j`
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const obj = JSON.parse(line);
        const rawUrl = String(obj.webpage_url || obj.url || '');
        ytId =
          (typeof obj.id === 'string' && obj.id.length <= 15 ? obj.id : undefined) ||
          extractYouTubeId(rawUrl);
        uploaderName = String(obj.artist || obj.uploader || obj.channel || '').trim();
        const cleanUploader = uploaderName.replace(/\s*-\s*Topic$/i, '').trim();
        const rawTitle = String(obj.track || obj.title || '').trim();
        if (typeof obj.duration === 'number' && obj.duration > 0) {
          durationOverride = Math.round(obj.duration);
        }

        if (rawTitle.includes(' - ')) {
          const splitTitle = rawTitle.split(/\s+[-–—]\s+/);
          artist = splitTitle[0].trim();
          title = splitTitle.slice(1).join(' - ').trim();
        } else {
          artist = cleanUploader || 'Unknown Artist';
          title = rawTitle || title;
        }
      } catch {
        // Fallback to standard text line parsing below
      }
    }

    // 2. Standard text / `--print "%(webpage_url)s - %(uploader,channel)s - %(title)s"` line parsing
    if (artist === 'Unknown Artist' && title === `YouTube Feed Track ${idx + 1}`) {
      ytId = extractYouTubeId(line);

      // Extract all bracketed segments `[...]`, checking if any is a duration token `[4:29]` or `[1:15:00]`
      const bracketMatches = Array.from(line.matchAll(/\[([^\]]+)\]/g));
      for (const m of bracketMatches) {
        const token = m[1].trim();
        const durSec = parseDurationTokenToSeconds(token);
        if (durSec !== undefined) {
          durationOverride = durSec;
        } else if (!bracketHint) {
          bracketHint = token;
        }
      }

      // Also check trailing parenthetical duration like `(45:12)` or `(1:12:00)`
      const parenDurMatch = line.match(/\(((?:\d{1,2}:)?\d{1,2}:\d{2})\)\s*$/);
      if (parenDurMatch && durationOverride === undefined) {
        durationOverride = parseDurationTokenToSeconds(parenDurMatch[1]);
      }

      // Strip URL, bracket hints, and common YouTube video suffixes to find "Artist - Title"
      const cleanText = line
        .replace(/https?:\/\/[^\s]+/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\(((?:\d{1,2}:)?\d{1,2}:\d{2})\)\s*$/g, '')
        .replace(/\((?:Official|Music|Video|Audio|HD|4K|Lyrics|Visualizer)[^)]*\)/gi, '')
        .replace(/\s+-\s+Topic(?=\s+[-–—]|\s*$)/gi, '')
        .replace(/^[\s\-–—:•]+|[\s\-–—:•]+$/g, '')
        .trim();

      title = cleanText || title;

      const dashParts = cleanText
        .split(/\s+[-–—]\s+/)
        .map((p) => p.trim())
        .filter(Boolean);

      if (dashParts.length >= 3) {
        // Format from `yt-dlp --print "%(webpage_url)s - %(uploader,channel)s - %(title)s"`
        // when the YouTube video title itself is "Artist - Song Title":
        // dashParts[0] = Uploader/Channel (e.g. "Ninja Tune" or "Bicep")
        // dashParts[1] = Artist in title (e.g. "Bicep")
        // dashParts[2..] = Song Title (e.g. "Glue")
        uploaderName = dashParts[0];
        artist = dashParts[1];
        title = dashParts.slice(2).join(' - ');
      } else if (dashParts.length === 2) {
        uploaderName = dashParts[0];
        artist = dashParts[0];
        title = dashParts[1];
      } else if (ytId) {
        const known = CURATED_CATALOG.find((c) => c.youtubeId === ytId);
        if (known) {
          artist = known.artist;
          title = known.title;
        }
      }
    }

    // 3. Apply Music-Only Filter (exclude podcasts, news, updates, talks, tutorials, Shorts, and long non-music videos)
    if (filterNonMusic) {
      const check = checkNonMusicOrPodcast({
        rawLine: line,
        uploader: uploaderName || artist,
        title,
        durationSec: durationOverride,
        maxDurationSec,
        minDurationSec,
        customKeywords: options?.customKeywords,
      });
      if (check.excluded) {
        filteredOut.push({
          rawLine: line,
          title: `${artist !== 'Unknown Artist' ? `${artist} - ` : ''}${title}`,
          reason: check.reason,
          matchedKeyword: check.matchedKeyword,
        });
        return;
      }
    }

    keptLines.push(line);

    // 4. Check if this matches a curated track for exact metadata
    const existing = CURATED_CATALOG.find(
      (c) =>
        (ytId && c.youtubeId === ytId) ||
        (c.artist.toLowerCase() === artist.toLowerCase() &&
          c.title.toLowerCase() === title.toLowerCase())
    );

    if (existing) {
      parsedTracks.push({
        ...existing,
        source: 'YouTube Feed',
      });
      return;
    }

    const { tags, category } = inferMetadataFromText(artist, title, bracketHint);
    const youtubeUrl = ytId
      ? `https://www.youtube.com/watch?v=${ytId}`
      : `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} - ${title}`)}`;

    parsedTracks.push({
      id: `feed-${idx}-${ytId || title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)}`,
      title,
      artist,
      album: 'YouTube Feed Sample',
      tags,
      category,
      durationSec: durationOverride || 240 + ((idx * 29) % 120),
      bpm: 110 + ((idx * 7) % 24),
      energy: 65 + ((idx * 9) % 25),
      year: 2021,
      youtubeId: ytId,
      youtubeUrl,
      ytDlpQuery: ytId ? youtubeUrl : `ytsearch1:"${artist} - ${title}"`,
      source: 'YouTube Feed',
    });
  });

  return {
    tracks: parsedTracks,
    filteredOut,
    keptLines,
    filteredText: keptLines.join('\n'),
    totalInputLines: lines.length,
  };
}

/**
 * Helper function `filterMusicTracks` that processes an imported text file or raw output from yt-dlp
 * and automatically filters out non-music content by checking for keywords like 'podcast', 'news', or 'update'
 * in the title (as well as interviews, episodes, tutorials, Shorts, and long non-music videos).
 *
 * Returns a MusicTrack[] array augmented with `{ tracks, filteredOut, keptLines, filteredText, totalInputLines, activeKeywords }`
 * so it can be used directly as an array of MusicTrack items or destructured for the detailed filter report.
 */
export function filterMusicTracks(
  rawYtDlpOutput: string,
  options?: FilterMusicTracksOptions
): FilteredMusicTracksResult {
  const customKeywords = options?.keywords || [];
  const activeKeywords = Array.from(
    new Set([
      ...DEFAULT_NON_MUSIC_KEYWORDS,
      ...customKeywords.map((k) => k.trim().toLowerCase()).filter(Boolean),
    ])
  );

  const report = parseYouTubeFeedInputWithReport(rawYtDlpOutput, {
    filterNonMusic: options?.filterNonMusic ?? true,
    maxDurationSec: options?.maxDurationSec ?? 600,
    minDurationSec: options?.minDurationSec ?? 45,
    customKeywords: activeKeywords,
  });

  const result = Object.assign([...report.tracks], {
    tracks: report.tracks,
    filteredOut: report.filteredOut,
    keptLines: report.keptLines,
    filteredText: report.filteredText,
    totalInputLines: report.totalInputLines,
    activeKeywords,
  }) as FilteredMusicTracksResult;

  return result;
}

/**
 * Parses a multi-line YouTube feed / watch history / yt-dlp cookie dump (.txt or .jsonl) into structured music tracks,
 * automatically filtering out podcasts, news, updates, and long non-music videos via `filterMusicTracks`.
 */
export function parseYouTubeFeedInput(feedText: string): MusicTrack[] {
  return filterMusicTracks(feedText).tracks;
}

/**
 * Builds an aggregated TasteProfile from seed tracks and explicit user favorites
 */
export function buildTasteProfile(
  seedTracks: MusicTrack[],
  favoriteArtists: string[],
  favoriteTags: string[],
  favoriteCategories: string[]
): TasteProfile {
  const artistCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();

  for (const track of seedTracks) {
    artistCounts.set(track.artist, (artistCounts.get(track.artist) || 0) + 1);
    categoryCounts.set(track.category, (categoryCounts.get(track.category) || 0) + 1);
    for (const tag of track.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  for (const favArtist of favoriteArtists) {
    artistCounts.set(favArtist, (artistCounts.get(favArtist) || 0) + 2);
  }
  for (const favTag of favoriteTags) {
    tagCounts.set(favTag, (tagCounts.get(favTag) || 0) + 2);
  }
  for (const favCat of favoriteCategories) {
    categoryCounts.set(favCat, (categoryCounts.get(favCat) || 0) + 2);
  }

  const sortMap = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const bpms = seedTracks.map((t) => t.bpm).filter(Boolean);
  const energies = seedTracks.map((t) => t.energy).filter(Boolean);

  const avgBpm = bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : 120;
  const avgEnergy = energies.length
    ? Math.round(energies.reduce((a, b) => a + b, 0) / energies.length)
    : 72;

  return {
    favoriteArtists,
    favoriteTags,
    favoriteCategories,
    extractedArtists: sortMap(artistCounts),
    extractedTags: sortMap(tagCounts),
    extractedCategories: sortMap(categoryCounts),
    targetBpmRange: [Math.max(70, avgBpm - 18), Math.min(175, avgBpm + 18)],
    targetEnergyRange: [Math.max(20, avgEnergy - 20), Math.min(100, avgEnergy + 20)],
  };
}

/**
 * Scores and ranks tracks using multi-signal taste affinity algorithms
 */
export function rankTracksByTaste(
  candidates: MusicTrack[],
  profile: TasteProfile,
  algorithm: AlgorithmMode = 'hybrid-affinity',
  searchQuery: string = '',
  categoryFilter: string = 'All'
): MusicTrack[] {
  const favArtistsLower = new Set(profile.favoriteArtists.map((a) => a.toLowerCase()));
  const seedArtistsLower = new Set(profile.extractedArtists.map((a) => a.name.toLowerCase()));
  const favTagsLower = new Set(profile.favoriteTags.map((t) => t.toLowerCase()));
  const seedTagsMap = new Map(
    profile.extractedTags.map((t) => [t.name.toLowerCase(), t.count])
  );
  const favCatsLower = new Set(profile.favoriteCategories.map((c) => c.toLowerCase()));

  const q = searchQuery.trim().toLowerCase();

  return candidates
    .filter((track) => {
      if (categoryFilter !== 'All' && track.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        track.title.toLowerCase().includes(q) ||
        track.artist.toLowerCase().includes(q) ||
        track.category.toLowerCase().includes(q) ||
        (track.album && track.album.toLowerCase().includes(q)) ||
        track.tags.some((t) => t.toLowerCase().includes(q))
      );
    })
    .map((track) => {
      let score = 45;
      const reasons: string[] = [];

      const artistLower = track.artist.toLowerCase();
      if (favArtistsLower.has(artistLower)) {
        score += algorithm === 'deep-cuts' ? 12 : 28;
        reasons.push(`Favorite artist (${track.artist})`);
      } else if (seedArtistsLower.has(artistLower)) {
        score += algorithm === 'deep-cuts' ? 5 : 18;
        reasons.push(`In your YouTube feed`);
      } else if (algorithm === 'deep-cuts') {
        score += 20;
        reasons.push('Novel artist outside feed');
      }

      // Tag overlap
      const matchedTags: string[] = [];
      for (const t of track.tags) {
        const tl = t.toLowerCase();
        if (favTagsLower.has(tl)) {
          score += algorithm === 'tag-cluster' ? 18 : 12;
          matchedTags.push(`#${t}`);
        } else if (seedTagsMap.has(tl)) {
          const weight = Math.min(10, (seedTagsMap.get(tl) || 1) * 4);
          score += algorithm === 'tag-cluster' ? weight + 5 : weight;
          matchedTags.push(`#${t}`);
        }
      }
      if (matchedTags.length > 0) {
        reasons.push(`Matches ${matchedTags.slice(0, 2).join(', ')}`);
      }

      // Category affinity
      if (favCatsLower.has(track.category.toLowerCase())) {
        score += 12;
        reasons.push(`Favorite category (${track.category})`);
      }

      // Sonic BPM & Energy proximity
      const [minBpm, maxBpm] = profile.targetBpmRange;
      if (track.bpm >= minBpm && track.bpm <= maxBpm) {
        score += algorithm === 'high-tempo-sonic' ? 16 : 8;
        reasons.push(`${track.bpm} BPM sonic lock`);
      } else if (algorithm === 'high-tempo-sonic' && track.energy >= 75) {
        score += 14;
        reasons.push(`High energy (${track.energy}%)`);
      }

      const clampedScore = Math.max(35, Math.min(99, Math.round(score)));
      return {
        ...track,
        matchScore: clampedScore,
        matchReasons: reasons.length > 0 ? reasons.slice(0, 2) : ['Sonic catalog affinity'],
      };
    })
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
}

/**
 * Generates a single-track or multi-track yt-dlp command / script.
 * Includes `--ignore-config --no-warnings` and optional song duration filter so it works reliably on any setup.
 */
export function generateYtDlpCommand(
  tracks: MusicTrack[],
  options: YtDlpOptions
): string {
  if (tracks.length === 0) {
    return '# Add tracks to your playlist or select a track to generate yt-dlp commands';
  }

  const flags: string[] = ['yt-dlp', '--ignore-config', '--no-warnings'];
  const cookieFlag = buildYtDlpCookieFlag(options);
  if (cookieFlag) {
    flags.push(cookieFlag);
  }

  if (options.musicOnlyFilter !== false) {
    const matchFilter = buildYtDlpMusicMatchFilter({
      musicOnlyFilter: true,
      maxDurationSec: options.maxDurationSec || 600,
    });
    if (matchFilter) {
      flags.push(matchFilter);
    }
  }

  if (options.format === 'mp4-video') {
    flags.push('-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"');
  } else {
    flags.push('-x');
    flags.push(`--audio-format ${options.format}`);
    flags.push(`--audio-quality ${options.audioQuality}`);
  }

  if (options.embedMetadata) {
    flags.push('--embed-metadata');
  }
  if (options.embedThumbnail && options.format !== 'mp4-video') {
    flags.push('--embed-thumbnail');
  }
  if (options.addSubtitles) {
    flags.push('--write-auto-subs --sub-lang en');
  }
  if (options.sponsorBlock) {
    flags.push('--sponsorblock-remove music_offtopic,intro,outro');
  }

  const outTpl = options.outputTemplate.trim() || '%(artist,uploader)s - %(title)s.%(ext)s';
  flags.push(`-o "${outTpl}"`);

  const baseCmd = flags.join(' ');

  if (tracks.length === 1) {
    const t = tracks[0];
    const target =
      !options.useSearchFallback && t.youtubeId && t.youtubeId.length === 11
        ? `https://www.youtube.com/watch?v=${t.youtubeId}`
        : `ytsearch1:"${t.artist} - ${t.title} Official Audio"`;
    return `${baseCmd} ${target.startsWith('http') ? `"${target}"` : target}`;
  }

  if (options.batchFileMode) {
    const header = [
      '#!/usr/bin/env bash',
      '# CrateDig YT — Generated yt-dlp Batch Download Script',
      `# Total Tracks: ${tracks.length}`,
      'set -e',
      '',
    ];
    const lines = tracks.map((t, i) => {
      const target =
        !options.useSearchFallback && t.youtubeId && t.youtubeId.length === 11
          ? `"https://www.youtube.com/watch?v=${t.youtubeId}"`
          : `ytsearch1:"${t.artist} - ${t.title} Official Audio"`;
      return `echo "[${i + 1}/${tracks.length}] Downloading: ${t.artist} - ${t.title}"\n${baseCmd} ${target}`;
    });
    return [...header, ...lines].join('\n\n');
  }

  const targets = tracks.map((t) =>
    !options.useSearchFallback && t.youtubeId && t.youtubeId.length === 11
      ? `"https://www.youtube.com/watch?v=${t.youtubeId}"`
      : `ytsearch1:"${t.artist} - ${t.title}"`
  );

  return `${baseCmd} \\\n  ${targets.join(' \\\n  ')}`;
}

/**
 * Generates an M3U8 playlist file with YouTube links and track durations
 */
export function generateM3u8Playlist(playlistName: string, tracks: MusicTrack[]): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${playlistName}`];
  for (const t of tracks) {
    lines.push(`#EXTINF:${t.durationSec},${t.artist} - ${t.title}`);
    lines.push(t.youtubeUrl);
  }
  return lines.join('\n');
}

/**
 * Formats seconds into mm:ss
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export type BulkTagOperationMode = 'add' | 'replace' | 'remove';

export interface TrackMetadataOverride {
  tags?: string[];
  category?: string;
}

export interface BulkEditTrackOperation {
  tags?: string | string[];
  tagMode?: BulkTagOperationMode;
  category?: string;
}

/**
 * Normalizes a comma-separated string or array of raw tag inputs into clean lowercase hyphenated tags.
 */
export function normalizeBulkTags(input?: string | string[]): string[] {
  if (!input) return [];
  const rawParts = Array.isArray(input) ? input : input.split(/[,;|/]+/);
  const result: string[] = [];
  for (const part of rawParts) {
    const cleaned = part
      .trim()
      .replace(/^#+/, '')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '');
    if (cleaned && !result.includes(cleaned)) {
      result.push(cleaned);
    }
  }
  return result;
}

/**
 * Applies bulk tag and/or category edits simultaneously to all tracks whose ID is in `selectedIds`.
 */
export function applyBulkTrackEdits(
  tracks: MusicTrack[],
  selectedIds: Iterable<string>,
  operation: BulkEditTrackOperation
): MusicTrack[] {
  const selectedSet = new Set(selectedIds);
  if (selectedSet.size === 0) return tracks;

  const normalizedTags = normalizeBulkTags(operation.tags);
  const tagMode: BulkTagOperationMode = operation.tagMode || 'add';
  const nextCategory = operation.category ? operation.category.trim() : '';

  return tracks.map((track) => {
    if (!selectedSet.has(track.id)) {
      return track;
    }

    let updatedTags = [...track.tags];
    if (normalizedTags.length > 0) {
      if (tagMode === 'replace') {
        updatedTags = [...normalizedTags];
      } else if (tagMode === 'remove') {
        const removeSet = new Set(normalizedTags);
        const remaining = updatedTags.filter((t) => !removeSet.has(t.toLowerCase()));
        updatedTags = remaining.length > 0 ? remaining : updatedTags;
      } else {
        // 'add' mode: append new tags without duplicates
        const existingLower = new Set(updatedTags.map((t) => t.toLowerCase()));
        for (const newTag of normalizedTags) {
          if (!existingLower.has(newTag)) {
            updatedTags.push(newTag);
            existingLower.add(newTag);
          }
        }
      }
    }

    const updatedCategory = nextCategory || track.category;

    return {
      ...track,
      tags: updatedTags,
      category: updatedCategory,
    };
  });
}

/**
 * Computes an updated TrackMetadataOverride dictionary after applying a bulk edit across selected tracks.
 */
export function computeBulkTrackOverrides(
  tracks: MusicTrack[],
  selectedIds: Iterable<string>,
  operation: BulkEditTrackOperation,
  existingOverrides: Record<string, TrackMetadataOverride> = {}
): Record<string, TrackMetadataOverride> {
  const selectedSet = new Set(selectedIds);
  if (selectedSet.size === 0) return existingOverrides;

  const updatedTracks = applyBulkTrackEdits(
    applyTrackOverridesToPool(tracks, existingOverrides),
    selectedSet,
    operation
  );

  const nextOverrides: Record<string, TrackMetadataOverride> = { ...existingOverrides };
  for (const track of updatedTracks) {
    if (selectedSet.has(track.id)) {
      nextOverrides[track.id] = {
        tags: track.tags,
        category: track.category,
      };
    }
  }
  return nextOverrides;
}

/**
 * Applies persisted track metadata overrides (tags and categories) to a pool of MusicTrack items.
 */
export function applyTrackOverridesToPool(
  tracks: MusicTrack[],
  overrides: Record<string, TrackMetadataOverride>
): MusicTrack[] {
  if (!overrides || Object.keys(overrides).length === 0) {
    return tracks;
  }
  return tracks.map((track) => {
    const ov = overrides[track.id];
    if (!ov) return track;
    return {
      ...track,
      tags: ov.tags && ov.tags.length > 0 ? ov.tags : track.tags,
      category: ov.category ? ov.category : track.category,
    };
  });
}

