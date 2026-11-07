import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveGeminiModelForTier,
  buildCrateAssistantSystemInstruction,
  extractGroundingSources,
  normalizeChatHistoryForSdk,
  extractSuggestedTracksFromMarkdown,
  buildGroundedFallbackResponse,
  parseJsonOrDetectHtmlFallback,
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

test('parseJsonOrDetectHtmlFallback safely handles static host HTML 404/405 responses without throwing Unexpected token <', () => {
  const html405 = '<html> <head><title>405 Not Allowed</title></head><body><center><h1>405 Not Allowed</h1></center></body></html>';
  const parsedHtml = parseJsonOrDetectHtmlFallback<{ text: string }>(html405);
  assert.equal(parsedHtml.isJson, false);
  if (!parsedHtml.isJson) {
    assert.equal(parsedHtml.isHtml, true);
    assert.match(parsedHtml.preview, /^<html> <head>/);
  }

  const validJson = JSON.stringify({ text: 'Grounded response' });
  const parsedJson = parseJsonOrDetectHtmlFallback<{ text: string }>(validJson);
  assert.equal(parsedJson.isJson, true);
  if (parsedJson.isJson) {
    assert.equal(parsedJson.data.text, 'Grounded response');
  }
});

test('buildGroundedFallbackResponse handles TASTE REGRESSION MODEL & FEW-SHOT SAMPLES prompt with 5 scored YouTube tracks and yt-dlp commands', () => {
  const regressionPrompt = `### TASTE REGRESSION MODEL & FEW-SHOT SAMPLES
Intercept (β₀): 5 | Fit R²: 0 | MAE: 0
Target Sonic Center: ~120 BPM, Energy ~70/100
Regularization (λ): 0.25 | Exploration (τ): 0.7

#### Training Samples (Input X -> Target Rating y/10):
(No training samples added yet — add your sample songs or YouTube links above)

#### Fitted Feature Weights (β Coefficients):
- Positive Drivers (Increase ŷ): None specified yet
- Negative Repellers (Decrease ŷ): None (no low-rated negative samples provided)
- User-Added Tags: None added by user

### TASK
1. Use Google Search / YouTube grounding to find **5 real songs available on YouTube** that maximize the predicted regression score ŷ (aim for ŷ >= 8.5/10).
2. For each song, show:
   - **Artist - Title** (with estimated BPM, release year, and why it satisfies the positive β weights)
   - **Predicted Score ŷ / 10** based on the regression equation
   - **YouTube Search / Watch Link** and a working \`yt-dlp\` download command.`;

  const res = buildGroundedFallbackResponse(
    regressionPrompt,
    'crate-digger',
    {
      favoriteArtists: ['Bicep', 'Four Tet'],
      favoriteTags: ['breakbeat', 'analog-synth'],
      favoriteCategories: ['Electronic'],
    },
    true
  );

  // Must generate the 5-track Taste Regression Discovery Report instead of echoing the prompt into a single yt-dlp command
  assert.match(res.text, /Taste Regression Discovery Report/i);
  assert.match(res.text, /Predicted Score ŷ/i);
  assert.match(res.text, /yt-dlp --ignore-config --no-warnings -x --audio-format mp3/);
  assert.equal(res.suggestedTracks.length, 5);
  assert.ok(res.sources.length >= 2);
});

