import path from 'node:path';
import { YtDlpOptions } from './music-data';

export interface BinaryDetectionResult {
  installed: boolean;
  binaryPath: string | null;
  version: string | null;
}

export interface DownloadedFileEntry {
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface SystemEnvironmentStatus {
  hasYtDlp: boolean;
  hasFfmpeg: boolean;
  canDirectDownload: boolean;
  ytDlp: BinaryDetectionResult;
  ffmpeg: BinaryDetectionResult;
  downloadsDir: string;
  downloadsDirDisplay: string;
  platform: string;
  recentFiles: DownloadedFileEntry[];
}

export interface DirectDownloadTrackInput {
  id?: string;
  artist: string;
  title: string;
  youtubeUrl?: string;
  youtubeId?: string;
  ytDlpQuery?: string;
}

export interface DirectDownloadRequest {
  tracks: DirectDownloadTrackInput[];
  options?: Partial<YtDlpOptions>;
  customSubfolder?: string;
}

export interface DirectDownloadTrackOutcome {
  artist: string;
  title: string;
  status: 'downloaded' | 'fallback-generated' | 'error';
  outputFilePath: string;
  fileName: string;
  commandUsed: string;
  message: string;
}

/**
 * Parses the raw stdout from `yt-dlp --version` or `ffmpeg -version` into a clean version string.
 */
export function parseBinaryVersionOutput(
  binary: 'yt-dlp' | 'ffmpeg',
  rawStdout: string
): string | null {
  const firstLine = (rawStdout || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!firstLine) return null;

  if (binary === 'yt-dlp') {
    return firstLine.slice(0, 48);
  }

  // e.g. "ffmpeg version 4.4.2-0ubuntu0.22.04.1+esm17 Copyright (c) ..."
  const match = firstLine.match(/ffmpeg\s+version\s+([^\s]+)/i);
  if (match && match[1]) {
    return match[1];
  }
  return firstLine.slice(0, 64);
}

/**
 * Sanitizes an optional subfolder name so downloads always stay inside `~/Downloads`.
 */
export function sanitizeDownloadsSubfolder(subfolder?: string): string {
  if (!subfolder) return '';
  return subfolder
    .trim()
    .replace(/\.\.+/g, '')
    .replace(/^[/\\]+|[/\\]+$/g, '')
    .replace(/[^a-zA-Z0-9-_ /]/g, '')
    .trim();
}

/**
 * Resolves the target `~/Downloads` directory path on the running system safely.
 */
export function resolveSafeDownloadsDirectory(
  homeDir: string,
  customSubfolder?: string
): { fullPath: string; displayPath: string } {
  const baseDownloads = path.join(homeDir || '/tmp', 'Downloads');
  const cleanSub = sanitizeDownloadsSubfolder(customSubfolder);
  if (!cleanSub) {
    return {
      fullPath: baseDownloads,
      displayPath: '~/Downloads',
    };
  }
  const resolved = path.resolve(baseDownloads, cleanSub);
  if (!resolved.startsWith(path.resolve(baseDownloads))) {
    return {
      fullPath: baseDownloads,
      displayPath: '~/Downloads',
    };
  }
  return {
    fullPath: resolved,
    displayPath: `~/Downloads/${cleanSub}`,
  };
}

/**
 * Sanitizes a track filename for safe filesystem storage inside `~/Downloads`.
 */
export function buildSafeTrackFilename(
  artist: string,
  title: string,
  ext: string
): string {
  const safeBase = `${artist || 'Artist'} - ${title || 'Track'}`
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const cleanExt = (ext || 'mp3').replace(/^\.+/, '').toLowerCase();
  return `${safeBase}.${cleanExt}`;
}

/**
 * Builds safe `execFile` argument arrays for `yt-dlp` so tracks download directly into `~/Downloads`
 * without shell interpolation or zsh/bash quoting issues.
 */
export function buildDirectDownloadYtDlpArgs(
  request: DirectDownloadRequest,
  downloadsDir: string,
  ffmpegBinaryPath?: string | null
): {
  jobs: Array<{
    artist: string;
    title: string;
    target: string;
    expectedExt: string;
    args: string[];
    displayCommand: string;
  }>;
} {
  const opts = request.options || {};
  const format = opts.format || 'mp3';
  const audioQuality = opts.audioQuality || '0';
  const isVideo = format === 'mp4-video' || format === 'mkv-video';
  const expectedExt = isVideo
    ? format === 'mkv-video'
      ? 'mkv'
      : 'mp4'
    : format;

  const commonFlags: string[] = [
    '--ignore-config',
    '--no-warnings',
    '--no-playlist',
  ];

  if (ffmpegBinaryPath) {
    commonFlags.push('--ffmpeg-location', path.dirname(ffmpegBinaryPath));
  }

  if (opts.cookieSource === 'browser' && opts.cookieBrowser) {
    const profile = (opts.cookieProfile || '').trim();
    commonFlags.push(
      '--cookies-from-browser',
      profile ? `${opts.cookieBrowser}:${profile}` : opts.cookieBrowser
    );
  } else if (opts.cookieSource === 'file' && opts.cookieFilePath) {
    commonFlags.push('--cookies', opts.cookieFilePath.trim());
  }

  if (isVideo) {
    const res = opts.videoResolution || 'best';
    const mergeContainer = format === 'mkv-video' ? 'mkv' : 'mp4';
    if (res !== 'best') {
      commonFlags.push(
        '-f',
        mergeContainer === 'mp4'
          ? `bestvideo[height<=${res}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${res}][ext=mp4]/best`
          : `bestvideo[height<=${res}]+bestaudio/best[height<=${res}]/best`,
        '--merge-output-format',
        mergeContainer
      );
    } else {
      commonFlags.push(
        '-f',
        mergeContainer === 'mp4'
          ? 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
          : 'bestvideo+bestaudio/best',
        '--merge-output-format',
        mergeContainer
      );
    }
  } else {
    commonFlags.push('-x', '--audio-format', format, '--audio-quality', audioQuality);
  }

  if (opts.embedMetadata !== false) {
    commonFlags.push('--embed-metadata');
  }
  if (opts.embedThumbnail && !isVideo) {
    commonFlags.push('--embed-thumbnail');
  }
  if (opts.sponsorBlock) {
    commonFlags.push('--sponsorblock-remove', 'music_offtopic,intro,outro');
  }

  const outputTemplate = path.join(
    downloadsDir,
    opts.outputTemplate?.trim() || '%(title)s.%(ext)s'
  );
  commonFlags.push('-o', outputTemplate);

  const jobs = (request.tracks || []).map((t) => {
    let target = '';
    if (
      !opts.useSearchFallback &&
      t.youtubeId &&
      t.youtubeId.trim().length === 11
    ) {
      target = `https://www.youtube.com/watch?v=${t.youtubeId.trim()}`;
    } else if (
      !opts.useSearchFallback &&
      t.youtubeUrl &&
      t.youtubeUrl.includes('watch?v=')
    ) {
      target = t.youtubeUrl.trim();
    } else {
      target = `ytsearch1:${t.artist} - ${t.title} Official Audio`;
    }

    const args = [...commonFlags, target];
    const displayCommand = [
      'yt-dlp',
      ...args.map((a) => (a.includes(' ') || a.includes('?') || a.includes('&') ? `"${a}"` : a)),
    ].join(' ');

    return {
      artist: t.artist,
      title: t.title,
      target,
      expectedExt,
      args,
      displayCommand,
    };
  });

  return { jobs };
}
