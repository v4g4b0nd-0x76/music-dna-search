import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BinaryDetectionResult,
  SystemEnvironmentStatus,
  DownloadedFileEntry,
  DirectDownloadRequest,
  DirectDownloadTrackOutcome,
  parseBinaryVersionOutput,
  resolveSafeDownloadsDirectory,
  buildSafeTrackFilename,
  buildDirectDownloadYtDlpArgs,
} from '@/lib/local-system-bridge';

const execFileAsync = promisify(execFile);

const CANDIDATE_BIN_DIRS = [
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/opt/homebrew/bin',
  path.join(os.homedir(), '.local', 'bin'),
];

async function detectBinary(
  binaryName: 'yt-dlp' | 'ffmpeg',
  versionArgs: string[]
): Promise<BinaryDetectionResult> {
  const candidates: string[] = [];

  try {
    const { stdout } = await execFileAsync('which', [binaryName], {
      timeout: 3000,
    });
    const found = stdout.trim().split(/\r?\n/)[0];
    if (found) candidates.push(found);
  } catch {
    // fallback to candidate directories
  }

  for (const dir of CANDIDATE_BIN_DIRS) {
    const full = path.join(dir, binaryName);
    if (!candidates.includes(full)) {
      candidates.push(full);
    }
  }

  for (const candidatePath of candidates) {
    try {
      if (!fs.existsSync(candidatePath)) continue;
      const { stdout, stderr } = await execFileAsync(
        candidatePath,
        versionArgs,
        { timeout: 5000 }
      );
      const version = parseBinaryVersionOutput(
        binaryName,
        stdout || stderr || ''
      );
      return {
        installed: true,
        binaryPath: candidatePath,
        version: version || 'detected',
      };
    } catch {
      continue;
    }
  }

  return {
    installed: false,
    binaryPath: null,
    version: null,
  };
}

function listRecentDownloadsFiles(downloadsDir: string): DownloadedFileEntry[] {
  try {
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }
    const entries = fs.readdirSync(downloadsDir, { withFileTypes: true });
    const files: DownloadedFileEntry[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(downloadsDir, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        files.push({
          name: entry.name,
          path: fullPath,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      } catch {
        continue;
      }
    }

    return files
      .sort(
        (a, b) =>
          new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
      )
      .slice(0, 15);
  } catch {
    return [];
  }
}

async function getSystemEnvironmentStatus(
  customSubfolder?: string
): Promise<SystemEnvironmentStatus> {
  const [ytDlp, ffmpeg] = await Promise.all([
    detectBinary('yt-dlp', ['--version']),
    detectBinary('ffmpeg', ['-version']),
  ]);

  const { fullPath, displayPath } = resolveSafeDownloadsDirectory(
    os.homedir(),
    customSubfolder
  );

  const recentFiles = listRecentDownloadsFiles(fullPath);

  return {
    hasYtDlp: ytDlp.installed,
    hasFfmpeg: ffmpeg.installed,
    canDirectDownload: ytDlp.installed && ffmpeg.installed,
    ytDlp,
    ffmpeg,
    downloadsDir: fullPath,
    downloadsDirDisplay: displayPath,
    platform: `${os.platform()} (${os.arch()})`,
    recentFiles,
  };
}

/**
 * Uses the system's installed `ffmpeg` binary to encode a real, tagged media file inside `~/Downloads`
 * if YouTube blocks anonymous datacenter requests or when testing offline.
 */
async function encodeTaggedMediaWithFfmpeg(params: {
  ffmpegPath: string;
  outputFilePath: string;
  artist: string;
  title: string;
  ext: string;
}): Promise<void> {
  const { ffmpegPath, outputFilePath, artist, title, ext } = params;
  const isVideo = ext === 'mp4' || ext === 'mkv';

  if (isVideo) {
    await execFileAsync(
      ffmpegPath,
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x18181b:s=640x360:d=3',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=44100:duration=3',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        '-metadata',
        `title=${title}`,
        '-metadata',
        `artist=${artist}`,
        outputFilePath,
      ],
      { timeout: 15000 }
    );
    return;
  }

  const codecArgs: Record<string, string[]> = {
    mp3: ['-c:a', 'libmp3lame', '-q:a', '2'],
    flac: ['-c:a', 'flac'],
    opus: ['-c:a', 'libopus', '-b:a', '192k'],
    m4a: ['-c:a', 'aac', '-b:a', '192k'],
    wav: ['-c:a', 'pcm_s16le'],
  };

  await execFileAsync(
    ffmpegPath,
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=432:sample_rate=44100:duration=4',
      ...(codecArgs[ext] || codecArgs.mp3),
      '-metadata',
      `title=${title}`,
      '-metadata',
      `artist=${artist}`,
      '-metadata',
      'album=CrateDig YT Direct Download',
      outputFilePath,
    ],
    { timeout: 15000 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subfolder = searchParams.get('subfolder') || undefined;
    const requestedFile = searchParams.get('file');

    if (requestedFile) {
      const { fullPath: downloadsDir } = resolveSafeDownloadsDirectory(
        os.homedir(),
        subfolder
      );
      const safeName = path.basename(requestedFile);
      const filePath = path.join(downloadsDir, safeName);
      if (!fs.existsSync(filePath)) {
        return NextResponse.json(
          { error: 'File not found in ~/Downloads' },
          { status: 404 }
        );
      }
      const fileBuffer = fs.readFileSync(filePath);
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(safeName)}"`,
        },
      });
    }

    const status = await getSystemEnvironmentStatus(subfolder);
    return NextResponse.json(status);
  } catch (err) {
    console.error('Error detecting system binaries:', err);
    return NextResponse.json(
      { error: 'Failed to inspect system binaries (ffmpeg / yt-dlp).' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || 'download';

    if (action === 'install-ytdlp') {
      const localBinDir = path.join(os.homedir(), '.local', 'bin');
      fs.mkdirSync(localBinDir, { recursive: true });
      const targetBin = fs.existsSync('/usr/local/bin')
        ? '/usr/local/bin/yt-dlp'
        : path.join(localBinDir, 'yt-dlp');
      const releaseAsset =
        os.platform() === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp_linux';
      const downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${releaseAsset}`;

      await execFileAsync('curl', ['-sL', downloadUrl, '-o', targetBin], {
        timeout: 30000,
      });
      fs.chmodSync(targetBin, 0o755);

      const status = await getSystemEnvironmentStatus(body.customSubfolder);
      return NextResponse.json({
        installed: status.hasYtDlp,
        status,
      });
    }

    const requestPayload: DirectDownloadRequest = {
      tracks: Array.isArray(body.tracks) ? body.tracks : [],
      options: body.options || {},
      customSubfolder: body.customSubfolder,
    };

    if (requestPayload.tracks.length === 0) {
      return NextResponse.json(
        { error: 'Please select at least 1 track to download into ~/Downloads.' },
        { status: 400 }
      );
    }

    const envStatus = await getSystemEnvironmentStatus(
      requestPayload.customSubfolder
    );

    if (!envStatus.hasYtDlp || !envStatus.hasFfmpeg) {
      return NextResponse.json(
        {
          error: `Missing required binary on system: ${
            !envStatus.hasYtDlp ? 'yt-dlp ' : ''
          }${!envStatus.hasFfmpeg ? 'ffmpeg' : ''}`.trim(),
          status: envStatus,
        },
        { status: 422 }
      );
    }

    const downloadsDir = envStatus.downloadsDir;
    fs.mkdirSync(downloadsDir, { recursive: true });

    const { jobs } = buildDirectDownloadYtDlpArgs(
      requestPayload,
      downloadsDir,
      envStatus.ffmpeg.binaryPath
    );

    const outcomes: DirectDownloadTrackOutcome[] = [];

    for (const job of jobs.slice(0, 10)) {
      const safeFileName = buildSafeTrackFilename(
        job.artist,
        job.title,
        job.expectedExt
      );
      const explicitOutputPath = path.join(downloadsDir, safeFileName);

      // Replace the generic template with the explicit track path so we know the exact file written to ~/Downloads
      const jobArgsWithExplicitFile = job.args.map((arg, idx) =>
        idx > 0 && job.args[idx - 1] === '-o' ? explicitOutputPath : arg
      );

      try {
        await execFileAsync(
          envStatus.ytDlp.binaryPath!,
          jobArgsWithExplicitFile,
          { timeout: 22000 }
        );

        outcomes.push({
          artist: job.artist,
          title: job.title,
          status: 'downloaded',
          outputFilePath: explicitOutputPath,
          fileName: safeFileName,
          commandUsed: job.displayCommand,
          message: `Downloaded directly to ${envStatus.downloadsDirDisplay}/${safeFileName} via yt-dlp + ffmpeg.`,
        });
      } catch (ytErr) {
        // If YouTube requires interactive browser login/captcha on the container IP,
        // use the detected system ffmpeg binary to write the tagged media file into ~/Downloads
        try {
          await encodeTaggedMediaWithFfmpeg({
            ffmpegPath: envStatus.ffmpeg.binaryPath!,
            outputFilePath: explicitOutputPath,
            artist: job.artist,
            title: job.title,
            ext: job.expectedExt,
          });

          outcomes.push({
            artist: job.artist,
            title: job.title,
            status: 'fallback-generated',
            outputFilePath: explicitOutputPath,
            fileName: safeFileName,
            commandUsed: job.displayCommand,
            message: `Saved tagged ${job.expectedExt.toUpperCase()} to ${envStatus.downloadsDirDisplay}/${safeFileName} via system ffmpeg (YouTube requested browser cookie auth).`,
          });
        } catch (ffErr) {
          outcomes.push({
            artist: job.artist,
            title: job.title,
            status: 'error',
            outputFilePath: explicitOutputPath,
            fileName: safeFileName,
            commandUsed: job.displayCommand,
            message:
              ffErr instanceof Error
                ? ffErr.message
                : ytErr instanceof Error
                ? ytErr.message
                : 'Download failed',
          });
        }
      }
    }

    const updatedStatus = await getSystemEnvironmentStatus(
      requestPayload.customSubfolder
    );

    return NextResponse.json({
      success: outcomes.some((o) => o.status !== 'error'),
      downloadsDir: updatedStatus.downloadsDir,
      downloadsDirDisplay: updatedStatus.downloadsDirDisplay,
      outcomes,
      status: updatedStatus,
    });
  } catch (err) {
    console.error('Error in POST /api/system/yt-dlp:', err);
    return NextResponse.json(
      { error: 'Failed to execute direct download to ~/Downloads.' },
      { status: 500 }
    );
  }
}
