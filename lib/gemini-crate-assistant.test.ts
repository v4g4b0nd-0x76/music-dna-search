import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveGeminiModelForTier,
  buildCrateAssistantSystemInstruction,
  extractGroundingSources,
  normalizeChatHistoryForSdk,
  extractSuggestedTracksFromMarkdown,
  buildGroundedFallbackResponse,
} from './gemini-crate-assistant';

test('resolveGeminiModelForTier selects the right model for fast, general, complex, and grounded modes', () => {
  // When Google Search Grounding is disabled, respect the tier directly
  assert.equal(resolveGeminiModelForTier('fast', false), 'gemini-3.1-flash-lite');
  assert.equal(resolveGeminiModelForTier('general', false), 'gemini-3.8-flash');
  assert.equal(resolveGeminiModelForTier('complex', false), 'gemini-4-argon');

  // When Google Search Grounding is enabled, use gemini-3.8-flash
  assert.equal(resolveGeminiModelForTier('fast', true), 'gemini-3.8-flash');
  assert.equal(resolveGeminiModelForTier('general', true), 'gemini-3.8-flash');
  assert.equal(resolveGeminiModelForTier('complex', true), 'gemini-3.8-flash');
});

test('buildCrateAssistantSystemInstruction embeds role persona and user Taste DNA context', () => {
  const instruction = buildCrateAssistantSystemInstruction('ytdlp-engineer', {
    favoriteArtists: ['Aphex Twin', 'Burial'],
    favoriteTags: ['idm', 'uk-garage'],
    favoriteCategories: ['Electronic'],
    activePlaylistName: 'Warehouse Dubs',
    activePlaylistTracks: [
      { artist: 'Burial', title: 'Archangel', bpm: 130, category: 'Electronic' },
    ],
  });

  assert.match(instruction, /yt-dlp/i);
  assert.match(instruction, /Aphex Twin, Burial/);
  assert.match(instruction, /#idm, #uk-garage/);
  assert.match(instruction, /Warehouse Dubs/);
  assert.match(instruction, /Burial - Archangel/);
});

test('extractGroundingSources deduplicates web URIs and extracts search queries', () => {
  const mockCandidate = {
    groundingMetadata: {
      groundingChunks: [
        {
          web: {
            uri: 'https://www.discogs.com/artist/123-Bicep',
            title: 'Bicep Discography | Discogs',
          },
        },
        {
          web: {
            uri: 'https://www.discogs.com/artist/123-Bicep',
            title: 'Duplicate Link',
          },
        },
        {
          web: {
            uri: 'https://pitchfork.com/reviews/albums/overmono-good-lies/',
            title: 'Overmono: Good Lies Album Review',
          },
        },
      ],
      webSearchQueries: ['Bicep Chroma releases 2024', 'Overmono Good Lies review', 'Bicep Chroma releases 2024'],
    },
  };

  const { sources, searchQueries } = extractGroundingSources(mockCandidate);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].domain, 'discogs.com');
  assert.equal(sources[0].title, 'Bicep Discography | Discogs');
  assert.equal(sources[1].domain, 'pitchfork.com');
  assert.deepEqual(searchQueries, ['Bicep Chroma releases 2024', 'Overmono Good Lies review']);
});

test('normalizeChatHistoryForSdk filters blank entries and maps to SDK Content format', () => {
  const history = normalizeChatHistoryForSdk([
    { role: 'user', text: '  Recommend breakbeat tracks  ' },
    { role: 'model', text: '' },
    { role: 'model', text: 'Try **Overmono - So U Kno** (2021 · 134 BPM · #breakbeat)' },
  ]);

  assert.equal(history.length, 2);
  assert.deepEqual(history[0], {
    role: 'user',
    parts: [{ text: 'Recommend breakbeat tracks' }],
  });
  assert.deepEqual(history[1], {
    role: 'model',
    parts: [{ text: 'Try **Overmono - So U Kno** (2021 · 134 BPM · #breakbeat)' }],
  });
});

test('extractSuggestedTracksFromMarkdown parses bold Artist - Title lines with BPM, year, and tags', () => {
  const md = [
    'Here are two tracks:',
    '- **Bicep - Apricots** (2021 · 130 BPM · #breakbeat #uk-bass)',
    '- **Four Tet - Baby** (2020 · 128 BPM · #microhouse)',
  ].join('\n');

  const tracks = extractSuggestedTracksFromMarkdown(md);
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].artist, 'Bicep');
  assert.equal(tracks[0].title, 'Apricots');
  assert.equal(tracks[0].bpm, 130);
  assert.equal(tracks[0].year, 2021);
  assert.deepEqual(tracks[0].tags, ['breakbeat', 'uk-bass']);
});

test('buildGroundedFallbackResponse returns grounded sources and structured track suggestions', () => {
  const res = buildGroundedFallbackResponse(
    'Latest UK breakbeat vinyl releases',
    'crate-digger',
    {
      favoriteArtists: ['Bicep', 'Overmono'],
      favoriteTags: ['breakbeat'],
      favoriteCategories: ['Electronic'],
    },
    true
  );

  assert.ok(res.text.length > 40);
  assert.ok(res.sources.length >= 2);
  assert.ok(res.searchQueries.length >= 1);
  assert.ok(res.suggestedTracks.length >= 2);
});
