import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMockTrackSearch } from './track-search';

test('resolveMockTrackSearch resolves known YouTube URL to catalog metadata', () => {
  const results = resolveMockTrackSearch('https://www.youtube.com/watch?v=5qap5aO4i9A');
  assert.equal(results.length, 1);
  assert.equal(results[0].artist, 'Bicep');
  assert.equal(results[0].title, 'Glue');
  assert.ok(results[0].tags.includes('breakbeat'));
});

test('resolveMockTrackSearch resolves custom YouTube URL with artist and title', () => {
  const results = resolveMockTrackSearch(
    'https://youtu.be/dQw4w9WgXcQ - Rival Consoles - Articulation'
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].youtubeId, 'dQw4w9WgXcQ');
  assert.equal(results[0].artist, 'Rival Consoles');
  assert.equal(results[0].title, 'Articulation');
});

test('resolveMockTrackSearch resolves song name or artist - title query', () => {
  const results = resolveMockTrackSearch('Boards of Canada - Roygbiv');
  assert.ok(results.length >= 1);
  assert.equal(results[0].artist, 'Boards of Canada');
  assert.equal(results[0].title, 'Roygbiv');

  const customResults = resolveMockTrackSearch('Jon Hopkins - Emerald Rush');
  assert.ok(customResults.length >= 1);
  assert.equal(customResults[0].artist, 'Jon Hopkins');
  assert.equal(customResults[0].title, 'Emerald Rush');
});
