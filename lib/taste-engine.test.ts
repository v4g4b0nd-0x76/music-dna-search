import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractYouTubeId,
  parseYouTubeFeedInput,
  parseYouTubeFeedInputWithReport,
  filterMusicTracks,
  DEFAULT_NON_MUSIC_KEYWORDS,
  buildTasteProfile,
  rankTracksByTaste,
  generateYtDlpCommand,
  generateM3u8Playlist,
  formatDuration,
  buildYtDlpCookieFlag,
  generateYtDlpFeedFetchCommand,
  normalizeBulkTags,
  applyBulkTrackEdits,
  computeBulkTrackOverrides,
  applyTrackOverridesToPool,
} from './taste-engine';
import {
  CURATED_CATALOG,
  SEED_YOUTUBE_FEED_SAMPLE,
  COOKIE_FEED_SIMULATION_SAMPLES,
} from './music-data';

test('extractYouTubeId parses standard watch and short URLs', () => {
  assert.equal(
    extractYouTubeId('https://www.youtube.com/watch?v=5qap5aO4i9A'),
    '5qap5aO4i9A'
  );
  assert.equal(
    extractYouTubeId('https://youtu.be/2Y6Nne8RvaA?si=123'),
    '2Y6Nne8RvaA'
  );
  assert.equal(extractYouTubeId('No URL here'), undefined);
});

test('parseYouTubeFeedInput extracts tracks and matches known catalog metadata', () => {
  const tracks = parseYouTubeFeedInput(SEED_YOUTUBE_FEED_SAMPLE);
  assert.equal(tracks.length, 7);
  assert.equal(tracks[0].artist, 'Bicep');
  assert.equal(tracks[0].title, 'Glue');
  assert.equal(tracks[0].youtubeId, '5qap5aO4i9A');
  assert.ok(tracks[0].tags.includes('breakbeat'));
});

test('parseYouTubeFeedInput handles custom artist - title lines', () => {
  const customFeed = 'Boards of Canada - Roygbiv [IDM / Ambient]';
  const parsed = parseYouTubeFeedInput(customFeed);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].artist, 'Boards of Canada');
  assert.equal(parsed[0].title, 'Roygbiv');
  assert.ok(parsed[0].tags.includes('idm'));
  assert.ok(parsed[0].ytDlpQuery.includes('Boards of Canada - Roygbiv'));
});

test('filterMusicTracks filters out non-music content with keywords like podcast, news, or update', () => {
  const rawYtDlpOutput = `https://www.youtube.com/watch?v=2Y6Nne8RvaA - Khruangbin - Topic - Time (You and I) [5:42]
https://www.youtube.com/watch?v=pod11111111 - Lex Fridman - AI & Physics Full Podcast [2:48:15]
https://www.youtube.com/watch?v=nws22222222 - Daily Tech - Breaking Tech News & Industry Roundup [4:12]
https://www.youtube.com/watch?v=upd33333333 - DevChannel - Linux Kernel Major Update v6.12 [5:10]
https://www.youtube.com/watch?v=5qap5aO4i9A - Ninja Tune - Bicep - Glue (Official Music Video) [4:29]`;

  const result = filterMusicTracks(rawYtDlpOutput);

  assert.ok(DEFAULT_NON_MUSIC_KEYWORDS.includes('podcast'));
  assert.ok(DEFAULT_NON_MUSIC_KEYWORDS.includes('news'));
  assert.ok(DEFAULT_NON_MUSIC_KEYWORDS.includes('update'));

  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 2);
  assert.equal(result.tracks.length, 2);
  assert.equal(result.filteredOut.length, 3);
  assert.equal(result.keptLines.length, 2);
  assert.ok(!result.filteredText.toLowerCase().includes('podcast'));
  assert.ok(!result.filteredText.toLowerCase().includes('news'));
  assert.ok(!result.filteredText.toLowerCase().includes('update'));
  assert.equal(result[0].artist, 'Khruangbin');
  assert.equal(result[1].artist, 'Bicep');
});

test('parseYouTubeFeedInputWithReport filters out podcasts, tutorials, Shorts, and long non-music videos', () => {
  const mixedFeed = `https://www.youtube.com/watch?v=2Y6Nne8RvaA - Khruangbin - Topic - Time (You and I) [5:42]
https://www.youtube.com/watch?v=pod11111111 - Lex Fridman - Ep #412 - AI & Physics Podcast Interview [2:48:15]
https://www.youtube.com/watch?v=tut22222222 - TechChannel - Linux Full Course & Setup Tutorial [45:10]
https://www.youtube.com/watch?v=sht33333333 - MemeChannel - Funny Cat Clip #shorts [0:18]
https://www.youtube.com/watch?v=5qap5aO4i9A - Ninja Tune - Bicep - Glue (Official Music Video) [4:29]`;

  const report = parseYouTubeFeedInputWithReport(mixedFeed, {
    filterNonMusic: true,
    maxDurationSec: 600,
    minDurationSec: 45,
  });

  assert.equal(report.tracks.length, 2);
  assert.equal(report.filteredOut.length, 3);
  assert.equal(report.tracks[0].artist, 'Khruangbin');
  assert.equal(report.tracks[0].title, 'Time (You and I)');
  assert.equal(report.tracks[1].artist, 'Bicep');
  assert.equal(report.tracks[1].title, 'Glue');
});

test('parseYouTubeFeedInput parses yt-dlp --dump-json JSONL and - Topic channel lines from cookie feed', () => {
  const jsonlTracks = parseYouTubeFeedInput(COOKIE_FEED_SIMULATION_SAMPLES[':ytrec']);
  assert.equal(jsonlTracks.length, 5);
  assert.equal(jsonlTracks[0].artist, 'Bicep');
  assert.equal(jsonlTracks[0].title, 'Glue');
  assert.equal(jsonlTracks[1].artist, 'Overmono');
  assert.equal(jsonlTracks[1].title, 'Good Lies');

  const topicTracks = parseYouTubeFeedInput(COOKIE_FEED_SIMULATION_SAMPLES[':ytfav']);
  assert.equal(topicTracks.length, 4);
  assert.equal(topicTracks[0].artist, 'Khruangbin');
  assert.equal(topicTracks[0].title, 'Time (You and I)');
});

test('buildYtDlpCookieFlag and generateYtDlpFeedFetchCommand include --ignore-config --no-warnings and song filter', () => {
  assert.equal(
    buildYtDlpCookieFlag({ cookieSource: 'browser', cookieBrowser: 'firefox' }),
    '--cookies-from-browser firefox'
  );
  assert.equal(
    buildYtDlpCookieFlag({
      cookieSource: 'browser',
      cookieBrowser: 'firefox',
      cookieProfile: 'default-release',
    }),
    '--cookies-from-browser "firefox:default-release"'
  );
  assert.equal(
    buildYtDlpCookieFlag({ cookieSource: 'file', cookieFilePath: './cookies.txt' }),
    '--cookies "./cookies.txt"'
  );
  assert.equal(buildYtDlpCookieFlag({ cookieSource: 'none' }), '');

  const feedCmd = generateYtDlpFeedFetchCommand({
    cookieSource: 'browser',
    cookieBrowser: 'firefox',
    cookieProfile: '',
    cookieFilePath: './cookies.txt',
    feedTarget: ':ytfav',
    feedLimit: 35,
    outputMode: 'export-file',
  });
  assert.ok(
    feedCmd.startsWith(
      'yt-dlp --ignore-config --no-warnings --cookies-from-browser firefox --flat-playlist'
    )
  );
  assert.ok(feedCmd.includes('--match-filter "duration >? 60 & duration <? 600 & !is_live"'));
  assert.ok(feedCmd.includes('--playlist-end 35'));
  assert.ok(feedCmd.endsWith(':ytfav > my-youtube-feed.txt'));
});

test('buildTasteProfile aggregates artists, tags, and categories with favorites boost', () => {
  const seed = parseYouTubeFeedInput(SEED_YOUTUBE_FEED_SAMPLE);
  const profile = buildTasteProfile(
    seed,
    ['Overmono'],
    ['breakbeat'],
    ['Electronic']
  );

  assert.ok(profile.extractedTags.length > 0);
  assert.equal(profile.extractedTags[0].name, 'breakbeat');
  assert.equal(profile.extractedCategories[0].name, 'Electronic');
});

test('rankTracksByTaste scores favorite artists and matching tags highest', () => {
  const seed = parseYouTubeFeedInput(SEED_YOUTUBE_FEED_SAMPLE);
  const profile = buildTasteProfile(
    seed,
    ['Overmono', 'Bicep'],
    ['breakbeat', 'uk-garage'],
    ['Electronic']
  );

  const ranked = rankTracksByTaste(
    CURATED_CATALOG,
    profile,
    'hybrid-affinity',
    '',
    'All'
  );

  assert.ok(ranked.length > 10);
  assert.ok((ranked[0].matchScore || 0) >= (ranked[ranked.length - 1].matchScore || 0));
  assert.ok(['Bicep', 'Overmono'].includes(ranked[0].artist));
});

test('generateYtDlpCommand builds accurate CLI commands for single and batch playlists with --ignore-config and cookies', () => {
  const sampleTrack = CURATED_CATALOG[0]; // Bicep - Glue
  const cmdSingle = generateYtDlpCommand([sampleTrack], {
    format: 'mp3',
    audioQuality: '0',
    embedThumbnail: true,
    embedMetadata: true,
    addSubtitles: false,
    sponsorBlock: true,
    outputTemplate: '%(artist,uploader)s - %(title)s.%(ext)s',
    useSearchFallback: false,
    batchFileMode: false,
    cookieSource: 'browser',
    cookieBrowser: 'firefox',
  });

  assert.ok(
    cmdSingle.startsWith(
      'yt-dlp --ignore-config --no-warnings --cookies-from-browser firefox'
    )
  );
  assert.ok(cmdSingle.includes('-x --audio-format mp3 --audio-quality 0'));
  assert.ok(cmdSingle.includes('--embed-metadata'));
  assert.ok(cmdSingle.includes('--embed-thumbnail'));
  assert.ok(cmdSingle.includes('--sponsorblock-remove'));
  assert.ok(cmdSingle.includes('https://www.youtube.com/watch?v=5qap5aO4i9A'));

  const cmdBatch = generateYtDlpCommand(CURATED_CATALOG.slice(0, 2), {
    format: 'flac',
    audioQuality: '0',
    embedThumbnail: false,
    embedMetadata: true,
    addSubtitles: false,
    sponsorBlock: false,
    outputTemplate: '%(title)s.%(ext)s',
    useSearchFallback: true,
    batchFileMode: true,
    cookieSource: 'file',
    cookieFilePath: './cookies.txt',
  });

  assert.ok(cmdBatch.includes('#!/usr/bin/env bash'));
  assert.ok(cmdBatch.includes('--ignore-config --no-warnings --cookies "./cookies.txt"'));
  assert.ok(cmdBatch.includes('--audio-format flac'));
  assert.ok(cmdBatch.includes('ytsearch1:"Bicep - Glue Official Audio"'));
});

test('generateM3u8Playlist and formatDuration produce valid outputs', () => {
  assert.equal(formatDuration(269), '4:29');
  const m3u = generateM3u8Playlist('Late Night Crate', CURATED_CATALOG.slice(0, 2));
  assert.ok(m3u.startsWith('#EXTM3U'));
  assert.ok(m3u.includes('#PLAYLIST:Late Night Crate'));
  assert.ok(m3u.includes('#EXTINF:269,Bicep - Glue'));
});

test('normalizeBulkTags cleans, lowercases, hyphenates, and deduplicates tag strings', () => {
  const tags = normalizeBulkTags('#Acid House, Late Night / acid-house,  Warm Analog ');
  assert.deepEqual(tags, ['acid-house', 'late-night', 'warm-analog']);
});

test('applyBulkTrackEdits applies tags and category simultaneously to multiple selected tracks without altering unselected tracks', () => {
  const samplePool = CURATED_CATALOG.slice(0, 3);
  const selectedIds = [samplePool[0].id, samplePool[1].id];

  const edited = applyBulkTrackEdits(samplePool, selectedIds, {
    tags: 'acid-house, late-night-crate',
    tagMode: 'add',
    category: 'Downtempo & Jazz',
  });

  // First two tracks are updated simultaneously
  assert.ok(edited[0].tags.includes('acid-house'));
  assert.ok(edited[0].tags.includes('late-night-crate'));
  assert.equal(edited[0].category, 'Downtempo & Jazz');

  assert.ok(edited[1].tags.includes('acid-house'));
  assert.ok(edited[1].tags.includes('late-night-crate'));
  assert.equal(edited[1].category, 'Downtempo & Jazz');

  // Third track is unselected and remains untouched
  assert.equal(edited[2].category, samplePool[2].category);
  assert.deepEqual(edited[2].tags, samplePool[2].tags);
});

test('applyBulkTrackEdits supports replace and remove tag modes and computeBulkTrackOverrides persists overrides', () => {
  const samplePool = CURATED_CATALOG.slice(0, 2);
  const selectedIds = [samplePool[0].id, samplePool[1].id];

  const replaced = applyBulkTrackEdits(samplePool, selectedIds, {
    tags: ['peak-hour', 'club-ready'],
    tagMode: 'replace',
  });
  assert.deepEqual(replaced[0].tags, ['peak-hour', 'club-ready']);
  assert.deepEqual(replaced[1].tags, ['peak-hour', 'club-ready']);

  const overrides = computeBulkTrackOverrides(
    samplePool,
    selectedIds,
    {
      tags: 'vinyl-rip, deep-cut',
      tagMode: 'add',
      category: 'Synthwave & Chill',
    },
    {}
  );

  const hydratedPool = applyTrackOverridesToPool(samplePool, overrides);
  assert.equal(hydratedPool[0].category, 'Synthwave & Chill');
  assert.equal(hydratedPool[1].category, 'Synthwave & Chill');
  assert.ok(hydratedPool[0].tags.includes('vinyl-rip'));
  assert.ok(hydratedPool[1].tags.includes('deep-cut'));
});

