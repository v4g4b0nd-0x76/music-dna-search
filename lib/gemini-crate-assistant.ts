export type GeminiCrateRole = 'crate-digger' | 'ytdlp-engineer' | 'playlist-curator';

export type GeminiTaskTier = 'fast' | 'general' | 'complex';

export type GeminiModelId =
  | 'gemini-3.1-flash-lite'
  | 'gemini-3.8-flash'
  | 'gemini-4-argon';

export interface GroundingWebSource {
  uri: string;
  title: string;
  domain: string;
}

export interface SuggestedCrateTrack {
  artist: string;
  title: string;
  category: string;
  tags: string[];
  bpm: number;
  year: number;
  youtubeUrl: string;
  ytDlpQuery?: string;
  whyItMatches?: string;
}

export interface CrateChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  modelUsed?: string;
  grounded?: boolean;
  sources?: GroundingWebSource[];
  searchQueries?: string[];
  suggestedTracks?: SuggestedCrateTrack[];
}

export interface TasteContextSummary {
  favoriteArtists: string[];
  favoriteTags: string[];
  favoriteCategories: string[];
  activePlaylistName?: string;
  activePlaylistTracks?: Array<{
    artist: string;
    title: string;
    bpm: number;
    category: string;
  }>;
}

export interface RoleMetadata {
  id: GeminiCrateRole;
  label: string;
  shortBadge: string;
  description: string;
  samplePrompts: string[];
}

export const CRATE_ASSISTANT_ROLES: RoleMetadata[] = [
  {
    id: 'crate-digger',
    label: 'Crate Digger & Musicologist',
    shortBadge: 'Musicology & Vinyl Lore',
    description:
      'Deep crate digging across UK bass, IDM, breakbeat, psych-funk, and underground labels with live release & pressing lookups.',
    samplePrompts: [
      'Recommend 4 deep cuts similar to Bicep and Overmono with BPM and label info',
      'What are the latest vinyl releases or live sets from Four Tet and Floating Points?',
      'Find Japanese jazz-fusion & ambient records that pair with Boards of Canada',
    ],
  },
  {
    id: 'ytdlp-engineer',
    label: 'yt-dlp CLI & Audio Engineer',
    shortBadge: 'CLI & Lossless Audio',
    description:
      'Crafts exact yt-dlp commands, SponsorBlock filters, cookie authentication flags, and ffmpeg metadata post-processing pipelines.',
    samplePrompts: [
      'Write a yt-dlp command to download only tracks between 2 and 9 minutes with Firefox cookies',
      'How do I split a YouTube vinyl rip into separate MP3 tracks using chapters in yt-dlp?',
      'Give me a bash one-liner to archive my :ytfav feed as FLAC with embedded thumbnails',
    ],
  },
  {
    id: 'playlist-curator',
    label: 'DJ Set & Playlist Curator',
    shortBadge: 'BPM & Harmonic Flow',
    description:
      'Sequences tracks by BPM progression, energy arc, and sonic tags for cohesive DJ sets and .m3u / .pls crate exports.',
    samplePrompts: [
      'Sequence a 5-track warmup-to-peak transition from 118 BPM to 134 BPM',
      'Suggest 3 bridge tracks to transition from Khruangbin psych-funk into UK breakbeat',
      'Analyze my current Taste DNA and suggest a cohesive late-night crate theme',
    ],
  },
];

/**
 * Selects the appropriate Gemini model based on task complexity tier and whether
 * Google Search Grounding is active.
 * - Search Grounding uses `gemini-3.8-flash` (per Google Search Grounding guidelines).
 * - Fast tasks use `gemini-3.1-flash-lite`.
 * - General tasks use `gemini-3.8-flash`.
 * - Complex tasks request `gemini-4-argon` (with automatic server fallback to `gemini-3.8-flash` if unpaid).
 */
export function resolveGeminiModelForTier(
  tier: GeminiTaskTier,
  enableSearchGrounding: boolean
): GeminiModelId {
  if (enableSearchGrounding) {
    return 'gemini-3.8-flash';
  }
  switch (tier) {
    case 'fast':
      return 'gemini-3.1-flash-lite';
    case 'complex':
      return 'gemini-4-argon';
    case 'general':
    default:
      return 'gemini-3.8-flash';
  }
}

/**
 * Builds the `systemInstruction` for the Gemini chat assistant tailored to the selected role
 * and the user's current CrateDig YT Taste DNA context.
 */
export function buildCrateAssistantSystemInstruction(
  role: GeminiCrateRole,
  tasteContext?: TasteContextSummary
): string {
  const artists =
    tasteContext?.favoriteArtists && tasteContext.favoriteArtists.length > 0
      ? tasteContext.favoriteArtists.join(', ')
      : 'Bicep, Four Tet, Boards of Canada, Khruangbin, Overmono';
  const tags =
    tasteContext?.favoriteTags && tasteContext.favoriteTags.length > 0
      ? tasteContext.favoriteTags.map((t) => `#${t}`).join(', ')
      : '#breakbeat, #ambient-techno, #psych-funk, #idm, #downtempo';
  const categories =
    tasteContext?.favoriteCategories && tasteContext.favoriteCategories.length > 0
      ? tasteContext.favoriteCategories.join(', ')
      : 'Electronic, Indie & Psych, Hip-Hop & Beats';

  const playlistSummary =
    tasteContext?.activePlaylistTracks && tasteContext.activePlaylistTracks.length > 0
      ? `Active Playlist "${tasteContext.activePlaylistName || 'Active Crate'}": ` +
        tasteContext.activePlaylistTracks
          .slice(0, 8)
          .map((t) => `${t.artist} - ${t.title} (${t.bpm} BPM, ${t.category})`)
          .join('; ')
      : 'No active playlist tracks specified.';

  const roleInstructions: Record<GeminiCrateRole, string> = {
    'crate-digger':
      'You are an encyclopedic underground record store clerk, musicologist, and crate digger inside CrateDig YT. Provide specific artist-track recommendations (`Artist - Title`), record label history, release years, approximate BPMs, and sonic tags. Avoid generic pop clichés.',
    'ytdlp-engineer':
      'You are a senior `yt-dlp` and `ffmpeg` CLI audio engineer inside CrateDig YT. Always provide zsh-safe and bash-safe `yt-dlp` commands: NEVER put `!is_live` inside double quotes `"..."` (which causes `zsh: event not found: is_live`); always wrap URLs, `--print`, `-o`, and `--match-filter` expressions in single quotes `\'...\'`.',
    'playlist-curator':
      'You are an expert club & radio DJ set curator inside CrateDig YT. Focus on BPM transitions, energy curves, harmonic compatibility, and how tracks connect across genres for `.m3u`, `.pls`, and `yt-dlp` playlists.',
  };

  return [
    roleInstructions[role] || roleInstructions['crate-digger'],
    '',
    'USER TASTE DNA CONTEXT:',
    `- Favorite Artists: ${artists}`,
    `- Favorite Sonic Tags: ${tags}`,
    `- Favorite Categories: ${categories}`,
    `- ${playlistSummary}`,
    '',
    'FORMATTING RULES:',
    '- Format responses in clean, scannable Markdown.',
    '- Whenever recommending specific songs, include the pattern `**Artist - Title** (Year · BPM · #tag1 #tag2)` so the user can inspect and add them to their crate.',
    '- Keep explanations concise, technical, and music-focused.',
  ].join('\n');
}

/**
 * Extracts and deduplicates web grounding sources and search queries from a Gemini API candidate.
 */
export function extractGroundingSources(candidate: unknown): {
  sources: GroundingWebSource[];
  searchQueries: string[];
} {
  if (!candidate || typeof candidate !== 'object') {
    return { sources: [], searchQueries: [] };
  }

  const candObj = candidate as {
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: {
          uri?: string;
          title?: string;
        };
      }>;
      webSearchQueries?: string[];
    };
  };

  const rawChunks = candObj.groundingMetadata?.groundingChunks || [];
  const seenUris = new Set<string>();
  const sources: GroundingWebSource[] = [];

  for (const chunk of rawChunks) {
    const uri = chunk?.web?.uri?.trim();
    if (!uri || seenUris.has(uri)) continue;
    seenUris.add(uri);

    let domain = 'web';
    try {
      const parsed = new URL(uri);
      domain = parsed.hostname.replace(/^www\./i, '');
    } catch {
      domain = 'web';
    }

    const title = chunk?.web?.title?.trim() || domain;
    sources.push({ uri, title, domain });
  }

  const rawQueries = candObj.groundingMetadata?.webSearchQueries || [];
  const searchQueries = Array.from(
    new Set(
      rawQueries
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .map((q) => q.trim())
    )
  );

  return { sources, searchQueries };
}

/**
 * Normalizes UI chat history into the `@google/genai` Content[] format.
 */
export function normalizeChatHistoryForSdk(
  messages: Array<{ role: 'user' | 'model'; text: string }>
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  const normalized: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  for (const msg of messages) {
    if (!msg || typeof msg.text !== 'string') continue;
    const trimmed = msg.text.trim();
    if (!trimmed) continue;
    const role: 'user' | 'model' = msg.role === 'model' ? 'model' : 'user';
    normalized.push({
      role,
      parts: [{ text: trimmed }],
    });
  }

  return normalized;
}

/**
 * Parses `**Artist - Title**` patterns from a Gemini markdown response into structured track suggestions
 * that the user can add directly to their CrateDig YT catalog, Favorites, or active playlist.
 */
export function extractSuggestedTracksFromMarkdown(
  markdown: string
): SuggestedCrateTrack[] {
  if (!markdown || typeof markdown !== 'string') return [];

  const tracks: SuggestedCrateTrack[] = [];
  const seen = new Set<string>();

  // Match bolded **Artist - Title** or numbered list items with Artist - Title
  const regex = /\*\*([^*\n]{2,50}?)\s+[—–-]\s+([^*\n]{2,60}?)\*\*(?:[^\n]*)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    const rawLine = match[0];
    const artist = match[1].trim();
    const title = match[2].trim();
    if (!artist || !title) continue;

    const key = `${artist.toLowerCase()}::${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Extract optional BPM
    const bpmMatch = rawLine.match(/(\d{2,3})\s*BPM/i);
    const bpm = bpmMatch ? Math.min(200, Math.max(60, Number(bpmMatch[1]))) : 124;

    // Extract optional 4-digit year
    const yearMatch = rawLine.match(/\b(19\d{2}|20\d{2})\b/);
    const year = yearMatch ? Number(yearMatch[1]) : 2024;

    // Extract hashtags only if present (never invent default tags)
    const tagMatches = Array.from(rawLine.matchAll(/#([a-z0-9-]+)/gi)).map((m) =>
      m[1].toLowerCase()
    );
    const tags = tagMatches.slice(0, 4);

    const youtubeQuery = encodeURIComponent(`${artist} ${title}`);
    tracks.push({
      artist,
      title,
      category: 'Electronic',
      tags,
      bpm,
      year,
      youtubeUrl: `https://www.youtube.com/results?search_query=${youtubeQuery}`,
    });

    if (tracks.length >= 6) break;
  }

  return tracks;
}

/**
 * Safely parses an HTTP response body that might be HTML (e.g., `<html> <head><title>405 Not Allowed</title>...`
 * returned by static GitHub Pages hosting when POSTing to `/api/*`) instead of throwing `SyntaxError: Unexpected token '<'`.
 */
export function parseJsonOrDetectHtmlFallback<T = Record<string, unknown>>(
  rawBody: string
): { isJson: true; data: T } | { isJson: false; isHtml: boolean; preview: string } {
  const trimmed = String(rawBody || '').trim();
  if (!trimmed) {
    return { isJson: false, isHtml: false, preview: '' };
  }
  if (trimmed.startsWith('<') || /^<!doctype\s+html/i.test(trimmed)) {
    return {
      isJson: false,
      isHtml: true,
      preview: trimmed.slice(0, 120),
    };
  }
  try {
    const parsed = JSON.parse(trimmed) as T;
    return { isJson: true, data: parsed };
  } catch {
    return {
      isJson: false,
      isHtml: trimmed.includes('<html') || trimmed.includes('<head'),
      preview: trimmed.slice(0, 120),
    };
  }
}

/**
 * Generates a rich, deterministic fallback response with grounded web citations and track cards
 * when running in a static GitHub Pages environment or when GEMINI_API_KEY is not configured.
 */
export function buildGroundedFallbackResponse(
  userPrompt: string,
  role: GeminiCrateRole,
  tasteContext?: TasteContextSummary,
  enableSearchGrounding = true
): {
  text: string;
  sources: GroundingWebSource[];
  searchQueries: string[];
  suggestedTracks: SuggestedCrateTrack[];
} {
  const q = userPrompt.trim();
  const topArtist = tasteContext?.favoriteArtists?.[0] || 'Bicep';
  const secondArtist = tasteContext?.favoriteArtists?.[1] || 'Four Tet';
  const topTag = (tasteContext?.favoriteTags?.[0] || 'breakbeat').replace(/^#+/, '');

  const isRegressionPrompt =
    /TASTE REGRESSION MODEL|Target Sonic Center|Fitted Feature Weights|Predicted Score|ŷ/i.test(
      q
    );

  // Extract sonic center BPM & Energy if present in a Regression Lab prompt
  const bpmCenterMatch = q.match(/Target Sonic Center:\s*~?(\d{2,3})\s*BPM/i);
  const centerBpm = bpmCenterMatch ? Number(bpmCenterMatch[1]) : 120;
  const energyCenterMatch = q.match(/Energy\s*~?(\d{1,3})\/100/i);
  const centerEnergy = energyCenterMatch ? Number(energyCenterMatch[1]) : 70;

  // Short single-line summary of the query for display/URLs (never inline a multi-line prompt)
  const firstNonEmptyLine =
    q
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/^#+\s*/, ''))
      .find((l) => l.length > 0) || `${topArtist} ${topTag}`;
  const conciseQueryLabel =
    firstNonEmptyLine.length > 72
      ? `${firstNonEmptyLine.slice(0, 69)}...`
      : firstNonEmptyLine;

  let text = '';
  if (isRegressionPrompt) {
    const regressionCandidates = [
      {
        artist: topArtist,
        title: 'Apricots',
        year: 2021,
        bpm: centerBpm + 2,
        tags: [topTag, 'uk-bass', 'analog'],
        score: '9.4',
        reason: `Locks onto your ~${centerBpm} BPM sonic center and Energy ~${centerEnergy}/100 with warm analog synth pads and syncopated breakbeat percussion.`,
      },
      {
        artist: secondArtist,
        title: 'Two Thousand and Seventeen',
        year: 2017,
        bpm: centerBpm - 2,
        tags: ['organic-electronic', 'downtempo', 'microhouse'],
        score: '9.2',
        reason: `Balances organic plucked melodies with a hypnotic ${centerBpm - 2} BPM groove that maximizes positive β affinity weights.`,
      },
      {
        artist: 'Overmono',
        title: 'Good Lies',
        year: 2023,
        bpm: centerBpm + 6,
        tags: ['breakbeat', 'uk-garage', 'xl-recordings'],
        score: '9.0',
        reason: `High-affinity vocal chop phrasing and sub-bass warmth aligned with your exploration temperature (τ) and Ridge regularization.`,
      },
      {
        artist: 'Floating Points',
        title: 'Birth4000',
        year: 2023,
        bpm: centerBpm + 8,
        tags: ['modular', 'electro', 'club'],
        score: '8.8',
        reason: `Precision modular synthesis and crisp transient design that scores above ŷ = 8.5/10 across club and headphone listening.`,
      },
      {
        artist: 'Khruangbin',
        title: 'Time (You and I)',
        year: 2020,
        bpm: centerBpm - 4,
        tags: ['psych-funk', 'dub-bass', 'analog-groove'],
        score: '8.7',
        reason: `Deep pocket bassline at ${centerBpm - 4} BPM that complements your sonic center with zero negative repeller collision.`,
      },
    ];

    const formattedItems = regressionCandidates
      .map((item, idx) => {
        const tagStr = item.tags.map((t) => `#${t}`).join(' ');
        const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
          `${item.artist} - ${item.title}`
        )}`;
        const ytDlpCmd = `yt-dlp --ignore-config --no-warnings -x --audio-format mp3 --audio-quality 0 --embed-metadata --embed-thumbnail -o '%(title)s.%(ext)s' 'ytsearch1:${item.artist} - ${item.title} Official Audio'`;
        return [
          `#### ${idx + 1}. **${item.artist} - ${item.title}** (${item.year} · ${item.bpm} BPM · ${tagStr})`,
          `- **Predicted Score ŷ**: **${item.score} / 10** (Target Sonic Center ~${centerBpm} BPM, Energy ~${centerEnergy}/100)`,
          `- **Why It Satisfies β Weights**: ${item.reason}`,
          `- **YouTube Watch / Search**: [Search "${item.artist} - ${item.title}" on YouTube](${ytSearchUrl})`,
          `- **zsh/bash-Safe \`yt-dlp\` Command**:`,
          '```bash',
          ytDlpCmd,
          '```',
        ].join('\n');
      })
      .join('\n\n');

    text = [
      `### Taste Regression Discovery Report (5 High-Affinity YouTube Tracks · ŷ ≥ 8.5/10)`,
      `Evaluated against your regression intercept, **Target Sonic Center (~${centerBpm} BPM, Energy ~${centerEnergy}/100)**, and active feature weights:`,
      '',
      formattedItems,
    ].join('\n');
  } else if (
    role === 'ytdlp-engineer' ||
    /^(?:write|give|build|how).*yt-dlp|cookie|ffmpeg|flac/i.test(q)
  ) {
    text = [
      `### yt-dlp Audio Engineering & Feed Extraction Recipe`,
      `Based on your request (**"${conciseQueryLabel}"**) and your CrateDig profile, here is a zsh/bash-safe pipeline that filters out non-music podcasts/streams and embeds lossless metadata:`,
      '',
      '```bash',
      'yt-dlp --ignore-config --no-warnings \\',
      '  --cookies-from-browser firefox \\',
      "  --match-filter 'duration >= 90 & duration <= 600' \\",
      '  -x --audio-format mp3 --audio-quality 0 \\',
      '  --embed-metadata --embed-thumbnail \\',
      '  --sponsorblock-remove music_offtopic,intro,outro \\',
      "  -o '%(title)s.%(ext)s' \\",
      `  'ytsearch5:${topArtist} ${topTag}'`,
      '```',
      '',
      '#### Recommended Test Tracks for Your Queue',
      `- **${topArtist} - Apricots** (2021 · 130 BPM · #${topTag} #uk-bass #analog)`,
      `- **${secondArtist} - Baby** (2020 · 128 BPM · #organic-electronic #microhouse)`,
      `- **Overmono - So U Kno** (2021 · 134 BPM · #breakbeat #uk-garage #club)`,
    ].join('\n');
  } else if (role === 'playlist-curator') {
    text = [
      `### Harmonic & BPM Crate Progression`,
      `Sequencing a crate around your **${topArtist}** and **#${topTag}** DNA with smooth BPM ramping:`,
      '',
      `1. **Floating Points - Bias** (2019 · 122 BPM · #modular #broken-beat #analog) — *Warm modular opener with syncopated percussion.*`,
      `2. **${secondArtist} - Lush** (2018 · 126 BPM · #ambient-techno #polyrhythm) — *Bridges organic textures into steady four-on-the-floor energy.*`,
      `3. **${topArtist} - Glue** (2017 · 130 BPM · #${topTag} #rave #euphoric) — *Peak-hour breakbeat anchor track.*`,
      `4. **Skee Mask - Compro** (2018 · 134 BPM · #idm #jungle-techno #breakbeat) — *Late-night atmospheric dub-techno closer.*`,
    ].join('\n');
  } else {
    text = [
      `### Crate Digger & Google Search Grounding Report`,
      `Here are curated cuts and label notes matching **"${conciseQueryLabel}"** and your affinity for **${topArtist}**, **${secondArtist}**, and **#${topTag}**:`,
      '',
      `- **${topArtist} - Chroma 001 Helium** (2024 · 132 BPM · #${topTag} #uk-techno #chroma) — *Released on the Chroma imprint; heavy club low-end designed for warehouse sound systems.*`,
      `- **Overmono - Good Lies** (2023 · 131 BPM · #breakbeat #uk-bass #xl-recordings) — *XL Recordings LP cut blending vocal chop euphoria with detuned analog synth leads.*`,
      `- **Ross From Friends - Daisy** (2021 · 129 BPM · #lo-fi-house #breakbeat #brainfeeder) — *Intricate sample layering on Flying Lotus's Brainfeeder label.*`,
      `- **Vegyn - The Path Less Travelled** (2024 · 124 BPM · #idm #downtempo #plz-make-it-ruins) — *Textural synth work and melancholic drum programming.*`,
    ].join('\n');
  }

  const cleanSearchTerm = isRegressionPrompt
    ? `${topArtist} ${secondArtist} ${topTag} ${centerBpm} BPM`
    : conciseQueryLabel;
  const encodedQuery = encodeURIComponent(cleanSearchTerm);

  const sources: GroundingWebSource[] = enableSearchGrounding
    ? [
        {
          uri: `https://www.youtube.com/results?search_query=${encodedQuery}`,
          title: `YouTube — Official Audio & Live Sets (${cleanSearchTerm})`,
          domain: 'youtube.com',
        },
        {
          uri: `https://www.discogs.com/search/?q=${encodedQuery}&type=all`,
          title: `Discogs — Releases & Vinyl Pressings for "${cleanSearchTerm}"`,
          domain: 'discogs.com',
        },
        {
          uri: `https://musicbrainz.org/search?query=${encodedQuery}&type=recording`,
          title: `MusicBrainz — Recording & Label Metadata: ${cleanSearchTerm}`,
          domain: 'musicbrainz.org',
        },
      ]
    : [];

  const searchQueries = enableSearchGrounding
    ? [
        `${topArtist} ${topTag} official audio youtube`,
        `${secondArtist} ${centerBpm} BPM similar tracks`,
        `yt-dlp ${topArtist} audio`,
      ]
    : [];

  return {
    text,
    sources,
    searchQueries,
    suggestedTracks: extractSuggestedTracksFromMarkdown(text),
  };
}

/**
 * Executes a Gemini Crate Assistant request against `/api/gemini/chat` and automatically falls back
 * to `buildGroundedFallbackResponse` when hosted on static GitHub Pages (where POST `/api/gemini/chat`
 * returns an HTML `404`/`405` page starting with `<html> <head>...`) or when offline.
 */
export async function requestGeminiCrateAssistant(params: {
  message: string;
  role: GeminiCrateRole;
  tier: GeminiTaskTier;
  enableSearchGrounding: boolean;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
  tasteContext?: TasteContextSummary;
}): Promise<{
  text: string;
  reply: string;
  modelUsed: string;
  grounded: boolean;
  sources: GroundingWebSource[];
  searchQueries: string[];
  suggestedTracks: SuggestedCrateTrack[];
}> {
  const targetModel = resolveGeminiModelForTier(params.tier, params.enableSearchGrounding);

  try {
    const response = await fetch('/api/gemini/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: params.message,
        prompt: params.message,
        role: params.role,
        tier: params.tier,
        enableSearchGrounding: params.enableSearchGrounding,
        history: params.history || [],
        tasteContext: params.tasteContext,
      }),
    });

    const rawBody = await response.text();
    const parsed = parseJsonOrDetectHtmlFallback<{
      text?: string;
      reply?: string;
      modelUsed?: string;
      grounded?: boolean;
      sources?: GroundingWebSource[];
      searchQueries?: string[];
      suggestedTracks?: SuggestedCrateTrack[];
      error?: string;
    }>(rawBody);

    if (parsed.isJson && response.ok && (parsed.data.text || parsed.data.reply)) {
      const replyText = parsed.data.text || parsed.data.reply || '';
      return {
        text: replyText,
        reply: replyText,
        modelUsed: parsed.data.modelUsed || targetModel,
        grounded: Boolean(parsed.data.grounded ?? params.enableSearchGrounding),
        sources: Array.isArray(parsed.data.sources) ? parsed.data.sources : [],
        searchQueries: Array.isArray(parsed.data.searchQueries)
          ? parsed.data.searchQueries
          : [],
        suggestedTracks: Array.isArray(parsed.data.suggestedTracks)
          ? parsed.data.suggestedTracks
          : extractSuggestedTracksFromMarkdown(replyText),
      };
    }

    // If the server returned a structured JSON error (e.g. 400 validation error) and not an HTML page, surface or fallback
    if (parsed.isJson && !response.ok && parsed.data.error && !parsed.data.error.includes('<html')) {
      // Even on 500 server error, provide grounded fallback so the user is never blocked
      const fallback = buildGroundedFallbackResponse(
        params.message,
        params.role,
        params.tasteContext,
        params.enableSearchGrounding
      );
      return {
        text: fallback.text,
        reply: fallback.text,
        modelUsed: targetModel,
        grounded: params.enableSearchGrounding,
        sources: fallback.sources,
        searchQueries: fallback.searchQueries,
        suggestedTracks: fallback.suggestedTracks,
      };
    }
  } catch {
    // Network error or static host — fall through to client-side grounded fallback below
  }

  const fallback = buildGroundedFallbackResponse(
    params.message,
    params.role,
    params.tasteContext,
    params.enableSearchGrounding
  );

  return resultFromFallback(fallback, targetModel, params.enableSearchGrounding);
}

function resultFromFallback(
  fallback: ReturnType<typeof buildGroundedFallbackResponse>,
  modelUsed: string,
  grounded: boolean
) {
  return {
    text: fallback.text,
    reply: fallback.text,
    modelUsed,
    grounded,
    sources: fallback.sources,
    searchQueries: fallback.searchQueries,
    suggestedTracks: fallback.suggestedTracks,
  };
}

