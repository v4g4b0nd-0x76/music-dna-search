import { MusicTrack, CURATED_CATALOG } from './music-data';
import { extractYouTubeId, inferMetadataFromText } from './taste-engine';

const EXTRA_MOCK_TRACKS: MusicTrack[] = [
  {
    id: 'mock-boc-roygbiv',
    title: 'Roygbiv',
    artist: 'Boards of Canada',
    album: 'Music Has the Right to Children',
    tags: ['idm', 'ambient-techno', 'analog-synth', 'nostalgic'],
    category: 'Electronic',
    durationSec: 151,
    bpm: 84,
    energy: 56,
    year: 1998,
    youtubeId: 'yT0gRc2c2wQ',
    youtubeUrl: 'https://www.youtube.com/watch?v=yT0gRc2c2wQ',
    ytDlpQuery: 'ytsearch1:"Boards of Canada - Roygbiv"',
    source: 'Taste Engine',
  },
  {
    id: 'mock-burial-archangel',
    title: 'Archangel',
    artist: 'Burial',
    album: 'Untrue',
    tags: ['uk-garage', 'future-garage', 'breakbeat', 'rave-nostalgia'],
    category: 'Electronic',
    durationSec: 238,
    bpm: 136,
    energy: 69,
    year: 2007,
    youtubeId: 'IlEkvbRmfrA',
    youtubeUrl: 'https://www.youtube.com/watch?v=IlEkvbRmfrA',
    ytDlpQuery: 'ytsearch1:"Burial - Archangel"',
    source: 'Taste Engine',
  },
  {
    id: 'mock-daftpunk-veridis',
    title: 'Veridis Quo',
    artist: 'Daft Punk',
    album: 'Discovery',
    tags: ['synthwave', 'filter-disco', 'analog-synth', 'melodic-electronic'],
    category: 'Synthwave & Chill',
    durationSec: 345,
    bpm: 112,
    energy: 62,
    year: 2001,
    youtubeId: 'TCd6PfxOy0Y',
    youtubeUrl: 'https://www.youtube.com/watch?v=TCd6PfxOy0Y',
    ytDlpQuery: 'ytsearch1:"Daft Punk - Veridis Quo"',
    source: 'Taste Engine',
  },
  {
    id: 'mock-kaytranada-10percent',
    title: '10%',
    artist: 'KAYTRANADA',
    album: 'BUBBA',
    tags: ['filter-disco', 'groovy', 'nu-jazz', 'uk-electronic'],
    category: 'Indie & Funk',
    durationSec: 186,
    bpm: 108,
    energy: 78,
    year: 2019,
    youtubeId: 'kaytra10pct',
    youtubeUrl: 'https://www.youtube.com/results?search_query=KAYTRANADA+-+10%25',
    ytDlpQuery: 'ytsearch1:"KAYTRANADA - 10%"',
    source: 'Taste Engine',
  },
];

const MOCK_LOOKUP_POOL: MusicTrack[] = [...CURATED_CATALOG, ...EXTRA_MOCK_TRACKS];

/**
 * Resolves a YouTube URL or song/artist search query into deterministic mock MusicTrack results.
 */
export function resolveMockTrackSearch(rawInput: string): MusicTrack[] {
  const query = rawInput.trim();
  if (!query) return [];

  const ytId = extractYouTubeId(query);

  // 1. If a YouTube URL or 11-char video ID was provided, check exact ID match first
  if (ytId) {
    const exactMatch = MOCK_LOOKUP_POOL.find((t) => t.youtubeId === ytId);
    if (exactMatch) {
      return [exactMatch];
    }

    // Check if the input also contains "Artist - Title" alongside the URL
    const cleanText = query
      .replace(/https?:\/\/[^\s]+/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/^[\s\-–—:•]+|[\s\-–—:•]+$/g, '')
      .trim();

    let artist = 'YouTube Upload';
    let title = `YouTube Track (${ytId})`;

    if (cleanText) {
      const parts = cleanText.split(/\s+[-–—]\s+/);
      if (parts.length >= 2) {
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      } else {
        title = cleanText;
      }
    }

    const inferred = inferMetadataFromText(artist, title);
    const watchUrl = `https://www.youtube.com/watch?v=${ytId}`;

    return [
      {
        id: `yt-lookup-${ytId}`,
        title,
        artist,
        album: 'YouTube Direct Lookup',
        tags: inferred.tags,
        category: inferred.category,
        durationSec: 234,
        bpm: 122,
        energy: 74,
        year: 2024,
        youtubeId: ytId,
        youtubeUrl: watchUrl,
        ytDlpQuery: watchUrl,
        source: 'Custom Seed',
      },
    ];
  }

  // 2. Song name or Artist - Song query lookup against the pool
  const qLower = query.toLowerCase();
  const matches = MOCK_LOOKUP_POOL.filter(
    (t) =>
      t.title.toLowerCase().includes(qLower) ||
      t.artist.toLowerCase().includes(qLower) ||
      `${t.artist} - ${t.title}`.toLowerCase().includes(qLower) ||
      t.tags.some((tag) => tag.toLowerCase().includes(qLower))
  );

  // Also synthesize a custom match if the user typed an explicit song/artist not in the pool
  const dashParts = query.split(/\s+[-–—]\s+/);
  const customArtist = dashParts.length >= 2 ? dashParts[0].trim() : query;
  const customTitle =
    dashParts.length >= 2 ? dashParts.slice(1).join(' - ').trim() : `${query} (Original Mix)`;

  const exactExists = matches.some(
    (m) =>
      m.title.toLowerCase() === query.toLowerCase() ||
      `${m.artist} - ${m.title}`.toLowerCase() === query.toLowerCase()
  );

  if (!exactExists) {
    const inferred = inferMetadataFromText(customArtist, customTitle);
    const synthesized: MusicTrack = {
      id: `synth-${query.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 18)}`,
      title: dashParts.length >= 2 ? customTitle : query,
      artist: dashParts.length >= 2 ? customArtist : 'Featured Artist',
      album: 'Resolved Track Lookup',
      tags: inferred.tags,
      category: inferred.category,
      durationSec: 248,
      bpm: 120,
      energy: 75,
      year: 2023,
      youtubeUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(
        dashParts.length >= 2 ? `${customArtist} - ${customTitle}` : query
      )}`,
      ytDlpQuery: `ytsearch1:"${
        dashParts.length >= 2 ? `${customArtist} - ${customTitle}` : query
      } Official Audio"`,
      source: 'Custom Seed',
    };
    return [synthesized, ...matches].slice(0, 4);
  }

  return matches.slice(0, 4);
}
