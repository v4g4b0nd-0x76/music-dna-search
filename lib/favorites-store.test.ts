import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FAVORITES_STATE,
  favoritesReducer,
  normalizeTagValue,
  serializeFavoritesState,
  deserializeFavoritesState,
} from './favorites-store';

test('normalizeTagValue cleans hash prefixes and normalizes spaces', () => {
  assert.equal(normalizeTagValue('##Ambient Techno '), 'ambient-techno');
  assert.equal(normalizeTagValue('uk-garage'), 'uk-garage');
});

test('favoritesReducer toggles artists, tags, and categories accurately', () => {
  let state = favoritesReducer(DEFAULT_FAVORITES_STATE, {
    type: 'TOGGLE_ARTIST',
    artist: 'Aphex Twin',
  });
  assert.ok(state.favoriteArtists.includes('Aphex Twin'));

  // Toggle again removes it (case-insensitive check)
  state = favoritesReducer(state, {
    type: 'TOGGLE_ARTIST',
    artist: 'aphex twin',
  });
  assert.ok(!state.favoriteArtists.includes('Aphex Twin'));

  // Toggle tag
  state = favoritesReducer(state, {
    type: 'TOGGLE_TAG',
    tag: '#IDM',
  });
  assert.ok(state.favoriteTags.includes('idm'));

  // Toggle category
  state = favoritesReducer(state, {
    type: 'TOGGLE_CATEGORY',
    category: 'Downtempo & Jazz',
  });
  assert.ok(state.favoriteCategories.includes('Downtempo & Jazz'));
});

test('favoritesReducer ADD_SIGNAL prevents duplicates and normalizes values', () => {
  let state = favoritesReducer(DEFAULT_FAVORITES_STATE, {
    type: 'ADD_SIGNAL',
    signalType: 'artist',
    value: 'bicep', // already in default as 'Bicep'
  });
  assert.equal(state.favoriteArtists.length, DEFAULT_FAVORITES_STATE.favoriteArtists.length);

  state = favoritesReducer(state, {
    type: 'ADD_SIGNAL',
    signalType: 'tag',
    value: '#Microhouse Groove',
  });
  assert.ok(state.favoriteTags.includes('microhouse-groove'));
});

test('serializeFavoritesState and deserializeFavoritesState round-trip state for session persistence', () => {
  const customState = {
    favoriteArtists: ['Boards of Canada', 'Four Tet'],
    favoriteTags: ['idm', 'folktronica'],
    favoriteCategories: ['Electronic'],
  };
  const json = serializeFavoritesState(customState);
  const restored = deserializeFavoritesState(json);
  assert.deepEqual(restored, customState);

  const hydrated = favoritesReducer(DEFAULT_FAVORITES_STATE, {
    type: 'HYDRATE',
    payload: restored || {},
  });
  assert.deepEqual(hydrated, customState);
});
