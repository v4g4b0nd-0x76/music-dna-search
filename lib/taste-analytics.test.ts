import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTasteAnalytics } from './taste-analytics';
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
