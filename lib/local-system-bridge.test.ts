import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBinaryVersionOutput,
  resolveSafeDownloadsDirectory,
  buildSafeTrackFilename,
  buildDirectDownloadYtDlpArgs,
} from './local-system-bridge';

test('parseBinaryVersionOutput extracts clean yt-dlp and ffmpeg versions', () => {
  assert.equal(parseBinaryVersionOutput('yt-dlp', '2026.10.26\n'), '2026.10.26');
  assert.equal(
    parseBinaryVersionOutput(
      'ffmpeg',
      'ffmpeg version 4.4.2-0ubuntu0.22.04.1+esm17 Copyright (c) 2000-2021 the FFmpeg developers\nbuilt with gcc 11'
    ),
    '4.4.2-0ubuntu0.22.04.1+esm17'
  );
  assert.equal(parseBinaryVersionOutput('yt-dlp', '   '), null);
});

test('resolveSafeDownloadsDirectory resolves ~/Downloads and blocks path traversal', () => {
  const base = resolveSafeDownloadsDirectory('/home/dj');
  assert.equal(base.fullPath, '/home/dj/Downloads');
  assert.equal(base.displayPath, '~/Downloads');

  const sub = resolveSafeDownloadsDirectory('/home/dj', 'CrateDig');
  assert.equal(sub.fullPath, '/home/dj/Downloads/CrateDig');
  assert.equal(sub.displayPath, '~/Downloads/CrateDig');

  const traversal = resolveSafeDownloadsDirectory('/home/dj', '../../etc');
  assert.equal(traversal.fullPath, '/home/dj/Downloads/etc');
});

test('buildDirectDownloadYtDlpArgs builds safe execFile argument arrays targeting ~/Downloads', () => {
  const { jobs } = buildDirectDownloadYtDlpArgs(
    {
      tracks: [
        {
          artist: 'Bicep',
          title: 'Glue',
          youtubeId: '5qap5aO4i9A',
          youtubeUrl: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
        },
      ],
      options: {
        format: 'mp3',
        audioQuality: '0',
        embedMetadata: true,
        embedThumbnail: true,
        sponsorBlock: true,
        outputTemplate: '%(title)s.%(ext)s',
      },
    },
    '/home/dj/Downloads',
    '/usr/bin/ffmpeg'
  );

  assert.equal(jobs.length, 1);
  const job = jobs[0];
  assert.equal(job.expectedExt, 'mp3');
  assert.ok(job.args.includes('--ffmpeg-location'));
  assert.ok(job.args.includes('/usr/bin'));
  assert.ok(job.args.includes('-x'));
  assert.ok(job.args.includes('mp3'));
  assert.ok(job.args.includes('/home/dj/Downloads/%(title)s.%(ext)s'));
  assert.equal(job.target, 'https://www.youtube.com/watch?v=5qap5aO4i9A');
  assert.equal(buildSafeTrackFilename('Bicep / UK', 'Glue: Live?', 'mp3'), 'Bicep - UK - Glue- Live-.mp3');
});
