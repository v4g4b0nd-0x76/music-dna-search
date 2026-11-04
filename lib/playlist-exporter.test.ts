import test from 'node:test';
import assert from 'node:assert/strict';
import {
  slugifyPlaylistName,
  generateM3uPlaylist,
  generatePlsPlaylist,
  generateJsonPlaylist,
  buildPlaylistExportPayload,
  getFavoriteMatchedTracks,
} from './playlist-exporter';
import { CURATED_CATALOG } from './music-data';

test('slugifyPlaylistName creates clean lowercase filenames', () => {
  assert.equal(slugifyPlaylistName('Late Night Analog & Breaks!'), 'late-night-analog-breaks');
  assert.equal(slugifyPlaylistName('   '), 'favorite-crate');
});

test('generateM3uPlaylist produces valid Extended M3U content with YouTube URLs or local filenames', () => {
  const sample = CURATED_CATALOG.slice(0, 2);
  const m3uStream = generateM3uPlaylist(sample, {
    playlistName: 'My Favorite Crate',
    pathMode: 'youtube-url',
    includeExtendedMeta: true,
  });

  assert.ok(m3uStream.startsWith('#EXTM3U'));
  assert.ok(m3uStream.includes('#PLAYLIST:My Favorite Crate'));
  assert.ok(m3uStream.includes('#EXTGENRE:Electronic'));
  assert.ok(m3uStream.includes('#EXTINF:269,Bicep - Glue'));
  assert.ok(m3uStream.includes('https://www.youtube.com/watch?v=5qap5aO4i9A'));

  const m3uLocal = generateM3uPlaylist(sample, {
    playlistName: 'Local Crate',
    pathMode: 'local-audio',
    audioExtension: 'flac',
  });
  assert.ok(m3uLocal.includes('Bicep - Glue.flac'));
});

test('generatePlsPlaylist produces valid PLS v2 playlist entries and footer', () => {
  const sample = CURATED_CATALOG.slice(0, 2);
  const pls = generatePlsPlaylist(sample, {
    playlistName: 'Late Night PLS',
    pathMode: 'youtube-url',
  });

  assert.ok(pls.startsWith('[playlist]'));
  assert.ok(pls.includes('File1=https://www.youtube.com/watch?v=5qap5aO4i9A'));
  assert.ok(pls.includes('Title1=Bicep - Glue'));
  assert.ok(pls.includes('Length1=269'));
  assert.ok(pls.includes(`Title2=${sample[1].artist} - ${sample[1].title}`));
  assert.ok(pls.includes('NumberOfEntries=2'));
  assert.ok(pls.endsWith('Version=2'));
});

test('generateJsonPlaylist serializes playlist metadata with track titles, artist names, and discovery fields', () => {
  const sample = CURATED_CATALOG.slice(0, 2);
  const jsonStr = generateJsonPlaylist(sample, {
    playlistName: 'Late Night Analog & Breaks',
    pathMode: 'youtube-url',
  });

  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.playlistName, 'Late Night Analog & Breaks');
  assert.equal(parsed.slug, 'late-night-analog-breaks');
  assert.equal(parsed.trackCount, 2);
  assert.ok(Array.isArray(parsed.tracks));
  assert.equal(parsed.tracks.length, 2);
  assert.equal(parsed.tracks[0].title, 'Glue');
  assert.equal(parsed.tracks[0].artist, 'Bicep');
  assert.equal(parsed.tracks[0].category, 'Electronic');
  assert.ok(Array.isArray(parsed.tracks[0].tags));
  assert.equal(parsed.tracks[1].title, sample[1].title);
  assert.equal(parsed.tracks[1].artist, sample[1].artist);
});

test('buildPlaylistExportPayload returns .m3u, .pls, .json, and yt-dlp .sh payloads with accurate filenames', () => {
  const sample = CURATED_CATALOG.slice(0, 2);

  const m3uPayload = buildPlaylistExportPayload(sample, {
    playlistName: 'Analog Selections',
    format: 'm3u',
  });
  assert.equal(m3uPayload.filename, 'analog-selections.m3u');
  assert.equal(m3uPayload.extension, 'm3u');
  assert.equal(m3uPayload.trackCount, 2);
  assert.ok(m3uPayload.content.includes('#EXTM3U'));

  const plsPayload = buildPlaylistExportPayload(sample, {
    playlistName: 'Analog Selections',
    format: 'pls',
  });
  assert.equal(plsPayload.filename, 'analog-selections.pls');
  assert.equal(plsPayload.extension, 'pls');
  assert.ok(plsPayload.content.includes('[playlist]'));
  assert.ok(plsPayload.content.includes('NumberOfEntries=2'));

  const jsonPayload = buildPlaylistExportPayload(sample, {
    playlistName: 'Analog Selections',
    format: 'json',
  });
  assert.equal(jsonPayload.filename, 'analog-selections.json');
  assert.equal(jsonPayload.extension, 'json');
  assert.equal(jsonPayload.mimeType, 'application/json;charset=utf-8');
  assert.equal(jsonPayload.trackCount, 2);
  const parsedJson = JSON.parse(jsonPayload.content);
  assert.equal(parsedJson.playlistName, 'Analog Selections');
  assert.equal(parsedJson.tracks[0].artist, 'Bicep');
  assert.equal(parsedJson.tracks[0].title, 'Glue');

  const shPayload = buildPlaylistExportPayload(sample, {
    playlistName: 'Analog Selections',
    format: 'ytdlp-sh',
  });
  assert.equal(shPayload.filename, 'download-analog-selections.sh');
  assert.equal(shPayload.extension, 'sh');
  assert.ok(shPayload.content.includes('#!/usr/bin/env bash'));
  assert.ok(shPayload.content.includes('yt-dlp --ignore-config --no-warnings'));
});

test('getFavoriteMatchedTracks filters tracks matching favorite artists, tags, categories, or saved IDs', () => {
  const matched = getFavoriteMatchedTracks(
    CURATED_CATALOG,
    ['Bicep'],
    ['thai-funk'],
    [],
    ['trk-fp-bias']
  );
  const ids = matched.map((t) => t.id);
  assert.ok(ids.includes('trk-bicep-glue'));
  assert.ok(ids.includes('trk-khruangbin-time'));
  assert.ok(ids.includes('trk-fp-bias'));
});
