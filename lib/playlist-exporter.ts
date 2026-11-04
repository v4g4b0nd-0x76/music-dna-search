import { MusicTrack, YtDlpOptions } from './music-data';
import { generateYtDlpCommand } from './taste-engine';

export type PlaylistExportFormat = 'm3u' | 'pls' | 'ytdlp-sh';

export type PlaylistPathMode = 'youtube-url' | 'local-audio';

export interface PlaylistExportOptions {
  playlistName: string;
  format: PlaylistExportFormat;
  pathMode?: PlaylistPathMode;
  audioExtension?: 'mp3' | 'flac' | 'm4a' | 'opus';
  includeExtendedMeta?: boolean;
  ytDlpOptions?: YtDlpOptions;
}

export interface PlaylistExportPayload {
  content: string;
  filename: string;
  mimeType: string;
  extension: 'm3u' | 'pls' | 'sh';
  trackCount: number;
}

const DEFAULT_YTDLP_OPTIONS: YtDlpOptions = {
  format: 'mp3',
  audioQuality: '0',
  embedThumbnail: true,
  embedMetadata: true,
  addSubtitles: false,
  sponsorBlock: true,
  outputTemplate: '%(artist,uploader)s - %(title)s.%(ext)s',
  useSearchFallback: false,
  batchFileMode: true,
  cookieSource: 'browser',
  cookieBrowser: 'firefox',
  cookieProfile: '',
  cookieFilePath: './cookies.txt',
  musicOnlyFilter: true,
  maxDurationSec: 600,
};

/**
 * Converts a playlist name into a clean lowercase slug for download filenames.
 */
export function slugifyPlaylistName(name: string): string {
  const cleaned = (name || 'favorite-crate')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'favorite-crate';
}

/**
 * Resolves the file/stream URI for a track depending on whether the user wants
 * YouTube stream URLs or local downloaded audio filenames (`Artist - Title.mp3`).
 */
export function resolveTrackExportLocation(
  track: MusicTrack,
  pathMode: PlaylistPathMode = 'youtube-url',
  audioExtension: 'mp3' | 'flac' | 'm4a' | 'opus' = 'mp3'
): string {
  if (pathMode === 'local-audio') {
    const safeArtist = track.artist.replace(/[/\\:*?"<>|]/g, '').trim();
    const safeTitle = track.title.replace(/[/\\:*?"<>|]/g, '').trim();
    return `${safeArtist} - ${safeTitle}.${audioExtension}`;
  }
  return track.youtubeUrl;
}

/**
 * Generates an Extended M3U (.m3u) playlist string for the selected tracks.
 */
export function generateM3uPlaylist(
  tracks: MusicTrack[],
  options: Omit<PlaylistExportOptions, 'format'>
): string {
  const playlistTitle = (options.playlistName || 'Favorite Tracks Crate').trim();
  const pathMode = options.pathMode || 'youtube-url';
  const ext = options.audioExtension || 'mp3';
  const includeExtended = options.includeExtendedMeta ?? true;

  const lines: string[] = ['#EXTM3U', `#PLAYLIST:${playlistTitle}`];

  for (const track of tracks) {
    const duration = Math.max(0, Math.round(track.durationSec || 0));
    if (includeExtended && track.category) {
      lines.push(`#EXTGENRE:${track.category}`);
    }
    if (includeExtended && track.album) {
      lines.push(`#EXTALB:${track.album}`);
    }
    lines.push(`#EXTINF:${duration},${track.artist} - ${track.title}`);
    lines.push(resolveTrackExportLocation(track, pathMode, ext));
  }

  return lines.join('\n');
}

/**
 * Generates a standard PLS (.pls) playlist file (supported by VLC, Foobar2000, mpv, Winamp, and Shoutcast).
 */
export function generatePlsPlaylist(
  tracks: MusicTrack[],
  options: Omit<PlaylistExportOptions, 'format'>
): string {
  const playlistTitle = (options.playlistName || 'Favorite Tracks Crate').trim();
  const pathMode = options.pathMode || 'youtube-url';
  const ext = options.audioExtension || 'mp3';

  const lines: string[] = ['[playlist]', `X-GNOME-Title=${playlistTitle}`];

  tracks.forEach((track, idx) => {
    const num = idx + 1;
    const location = resolveTrackExportLocation(track, pathMode, ext);
    const duration = Math.max(-1, Math.round(track.durationSec || -1));
    lines.push(`File${num}=${location}`);
    lines.push(`Title${num}=${track.artist} - ${track.title}`);
    lines.push(`Length${num}=${duration}`);
  });

  lines.push(`NumberOfEntries=${tracks.length}`);
  lines.push('Version=2');

  return lines.join('\n');
}

/**
 * Builds the complete downloadable payload (.m3u, .pls, or yt-dlp .sh script) for a list of selected tracks.
 */
export function buildPlaylistExportPayload(
  tracks: MusicTrack[],
  options: PlaylistExportOptions
): PlaylistExportPayload {
  const slug = slugifyPlaylistName(options.playlistName);

  if (options.format === 'pls') {
    const content = generatePlsPlaylist(tracks, options);
    return {
      content,
      filename: `${slug}.pls`,
      mimeType: 'audio/x-scpls;charset=utf-8',
      extension: 'pls',
      trackCount: tracks.length,
    };
  }

  if (options.format === 'ytdlp-sh') {
    const ytOpts: YtDlpOptions = {
      ...DEFAULT_YTDLP_OPTIONS,
      ...(options.ytDlpOptions || {}),
      batchFileMode: true,
    };
    const content = generateYtDlpCommand(tracks, ytOpts);
    return {
      content,
      filename: `download-${slug}.sh`,
      mimeType: 'text/x-shellscript;charset=utf-8',
      extension: 'sh',
      trackCount: tracks.length,
    };
  }

  const content = generateM3uPlaylist(tracks, options);
  return {
    content,
    filename: `${slug}.m3u`,
    mimeType: 'audio/x-mpegurl;charset=utf-8',
    extension: 'm3u',
    trackCount: tracks.length,
  };
}

/**
 * Filters a pool of tracks to those matching the user's favorite artists, tags, categories, or saved playlist track IDs.
 */
export function getFavoriteMatchedTracks(
  allTracks: MusicTrack[],
  favoriteArtists: string[],
  favoriteTags: string[],
  favoriteCategories: string[],
  savedTrackIds: string[] = []
): MusicTrack[] {
  const favArtistsSet = new Set(favoriteArtists.map((a) => a.toLowerCase()));
  const favTagsSet = new Set(favoriteTags.map((t) => t.toLowerCase()));
  const favCatsSet = new Set(favoriteCategories.map((c) => c.toLowerCase()));
  const savedSet = new Set(savedTrackIds);

  return allTracks.filter((track) => {
    if (savedSet.has(track.id)) return true;
    if (favArtistsSet.has(track.artist.toLowerCase())) return true;
    if (favCatsSet.has(track.category.toLowerCase())) return true;
    if (track.tags.some((t) => favTagsSet.has(t.toLowerCase()))) return true;
    return false;
  });
}
