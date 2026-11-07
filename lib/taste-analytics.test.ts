import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTasteAnalytics,
  computePlaylistDistribution,
} from './taste-analytics';
import { CURATED_CATALOG } from './music-data';

test('computeTasteAnalytics prioritizes favorite artists, tags, and categories from FavoritesContext', () => {
  const analytics = computeTasteAnalytics(
    {
      favoriteArtists: ['Bicep', 'Khruangbin', 'Custom Underground Artist'],
      favoriteTags: ['breakbeat', 'psychedelic-funk'],
      favoriteCategories: ['Electronic', 'Indie & Funk'],
    },
    CURATED_CATALOG
  );

  // Favorite artists should lead the artistSeries
  assert.ok(analytics.artistSeries.length >= 3);
  assert.equal(analytics.artistSeries[0].isFavorite, true);
  assert.ok(
    analytics.artistSeries.some(
      (a) => a.name === 'Custom Underground Artist' && a.isFavorite
    )
  );

  // Favorite tags should lead the tagSeries
  assert.ok(analytics.tagSeries.length >= 2);
  assert.equal(analytics.tagSeries[0].isFavorite, true);
  assert.ok(['#breakbeat', '#psychedelic-funk'].includes(analytics.tagSeries[0].label));

  // Favorite categories should have top scores in categorySeries
  assert.ok(analytics.categorySeries.length >= 5);
  assert.equal(analytics.categorySeries[0].isFavorite, true);
  assert.equal(analytics.summary.totalFavoriteSignals, 7);
});

test('computeTasteAnalytics handles empty favorites gracefully using catalog baseline', () => {
  const analytics = computeTasteAnalytics(
    {
      favoriteArtists: [],
      favoriteTags: [],
      favoriteCategories: [],
    },
    CURATED_CATALOG
  );

  assert.equal(analytics.summary.totalFavoriteSignals, 0);
  assert.ok(analytics.artistSeries.length > 0);
  assert.ok(analytics.tagSeries.length > 0);
  assert.ok(analytics.categorySeries.length > 0);
});

test('computePlaylistDistribution computes accurate song duration buckets, per-track durations, and genre distribution', () => {
  const samplePlaylist = CURATED_CATALOG.slice(0, 4);
  const dist = computePlaylistDistribution(samplePlaylist);

  assert.equal(dist.summary.totalTracks, 4);
  assert.equal(dist.durationBuckets.length, 5);
  const bucketTrackSum = dist.durationBuckets.reduce((acc, b) => acc + b.count, 0);
  assert.equal(bucketTrackSum, 4);

  assert.equal(dist.trackDurationSeries.length, 4);
  assert.ok(dist.trackDurationSeries[0].durationMin > 0);
  assert.ok(dist.trackDurationSeries[0].durationFormatted.includes(':'));

  assert.ok(dist.genreDistribution.length >= 1);
  const genreTrackSum = dist.genreDistribution.reduce((acc, g) => acc + g.count, 0);
  assert.equal(genreTrackSum, 4);
  assert.ok(dist.summary.shortestTrack !== null);
  assert.ok(dist.summary.longestTrack !== null);
  assert.ok(
    dist.summary.longestTrack!.durationSec >= dist.summary.shortestTrack!.durationSec
  );
});

test('computePlaylistDistribution handles empty playlist gracefully', () => {
  const dist = computePlaylistDistribution([]);
  assert.equal(dist.summary.totalTracks, 0);
  assert.equal(dist.summary.totalDurationSec, 0);
  assert.equal(dist.summary.totalDurationFormatted, '0:00');
  assert.equal(dist.genreDistribution.length, 0);
  assert.equal(dist.summary.shortestTrack, null);
  assert.equal(dist.summary.longestTrack, null);
});

