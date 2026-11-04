import test from 'node:test';
import assert from 'node:assert/strict';
import {
  maskCookieValue,
  parseAndValidateYouTubeCookies,
  fetchAuthenticatedYouTubeMusicFeed,
  generateCookieExportCliCommand,
  generateOneStepFeedDumpCliCommand,
  DEMO_NETSCAPE_COOKIES_TXT,
  DEMO_SESSION_COOKIE_STRING,
} from './youtube-feed-importer';

test('maskCookieValue hides sensitive cookie values while preserving a short suffix', () => {
  assert.equal(maskCookieValue('short'), '••••••');
  assert.equal(maskCookieValue('AFmmF2swRQIhDemoSessionToken9941'), '••••••9941');
});

test('parseAndValidateYouTubeCookies validates Netscape cookies.txt format and masks secrets', () => {
  const result = parseAndValidateYouTubeCookies(DEMO_NETSCAPE_COOKIES_TXT);
  assert.equal(result.isValid, true);
  assert.equal(result.format, 'netscape');
  assert.ok(result.youtubeCookieCount >= 4);
  assert.ok(result.detectedAuthKeys.includes('SAPISID'));
  assert.ok(result.detectedAuthKeys.includes('LOGIN_INFO'));
  assert.ok(result.fingerprintHash.startsWith('yt-session-'));
  for (const entry of result.entries) {
    assert.ok(entry.maskedValue.startsWith('••••••'));
  }
});

test('parseAndValidateYouTubeCookies validates raw Cookie header strings', () => {
  const result = parseAndValidateYouTubeCookies(DEMO_SESSION_COOKIE_STRING);
  assert.equal(result.isValid, true);
  assert.equal(result.format, 'header-string');
  assert.ok(result.detectedAuthKeys.includes('SAPISID'));
  assert.ok(result.detectedAuthKeys.includes('__Secure-3PSID'));
});

test('parseAndValidateYouTubeCookies rejects invalid or non-YouTube cookie strings', () => {
  const emptyResult = parseAndValidateYouTubeCookies('   ');
  assert.equal(emptyResult.isValid, false);

  const unrelatedResult = parseAndValidateYouTubeCookies('theme=dark; lang=en');
  assert.equal(unrelatedResult.isValid, false);
  assert.equal(unrelatedResult.format, 'invalid');
});

test('fetchAuthenticatedYouTubeMusicFeed returns parsed music tracks when session is valid', () => {
  const validSession = parseAndValidateYouTubeCookies(DEMO_NETSCAPE_COOKIES_TXT);
  const { rawFeedText, tracks } = fetchAuthenticatedYouTubeMusicFeed(validSession, ':ytrec');
  assert.ok(rawFeedText.length > 20);
  assert.equal(tracks.length, 7);
  assert.equal(tracks[0].artist, 'Bicep');
  assert.equal(tracks[5].artist, 'Boards of Canada');
});

test('generateCookieExportCliCommand and generateOneStepFeedDumpCliCommand include --ignore-config --no-warnings and song filter', () => {
  const exportCmd = generateCookieExportCliCommand('firefox', '', './cookies.txt');
  assert.ok(exportCmd.startsWith('yt-dlp --ignore-config --no-warnings --cookies-from-browser firefox'));
  assert.ok(exportCmd.includes('--cookies "./cookies.txt"'));
  assert.ok(exportCmd.includes('--skip-download'));

  const dumpCmd = generateOneStepFeedDumpCliCommand({
    browser: 'firefox',
    feedTarget: ':ytfav',
    feedLimit: 35,
    musicOnlyFilter: true,
    maxDurationSec: 600,
  });
  assert.ok(dumpCmd.startsWith('yt-dlp --ignore-config --no-warnings --cookies-from-browser firefox --flat-playlist'));
  assert.ok(dumpCmd.includes('--match-filter "duration >? 60 & duration <? 600 & !is_live"'));
  assert.ok(dumpCmd.includes(':ytfav > my-youtube-feed.txt'));
});
