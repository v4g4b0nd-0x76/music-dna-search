import { MusicTrack } from './music-data';
import { inferMetadataFromText } from './taste-engine';

/**
 * Searches the public iTunes Search API (CORS-enabled, zero API key needed, works on GitHub Pages)
 * and enriches results with YouTube watch/search links and yt-dlp search queries.
 */
export async function searchItunesCatalog(query: string, limit = 10): Promise<MusicTrack[]> {
  if (!query.trim()) return [];
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
    query.trim()
  )}&entity=song&limit=${limit}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`iTunes API responded with ${res.status}`);
  }
  const data = await res.json();
  const results = Array.isArray(data.results) ? data.results : [];

  return results.map((item: Record<string, unknown>, idx: number) => {
    const artist = String(item.artistName || 'Unknown Artist');
    const title = String(item.trackName || 'Untitled Track');
    const album = String(item.collectionName || 'Single');
    const genreName = String(item.primaryGenreName || 'Electronic');
    const durationSec = item.trackTimeMillis
      ? Math.round(Number(item.trackTimeMillis) / 1000)
      : 230;
    const releaseYear = item.releaseDate
      ? new Date(String(item.releaseDate)).getFullYear()
      : 2022;

    const { tags, category } = inferMetadataFromText(artist, title, genreName);
    const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      `${artist} - ${title} Official Audio`
    )}`;

    return {
      id: `itunes-${item.trackId || idx}-${Date.now()}`,
      title,
      artist,
      album,
      tags,
      category,
      durationSec,
      bpm: 112 + ((idx * 9) % 24),
      energy: 68 + ((idx * 7) % 25),
      year: isNaN(releaseYear) ? 2022 : releaseYear,
      youtubeUrl: ytSearchUrl,
      ytDlpQuery: `ytsearch1:"${artist} - ${title} Official Audio"`,
      source: 'iTunes Catalog',
      previewAudioUrl: item.previewUrl ? String(item.previewUrl) : undefined,
    };
  });
}

/**
 * Searches the public MusicBrainz Recording API (CORS-enabled, zero API key needed, works on GitHub Pages)
 */
export async function searchMusicBrainzCatalog(query: string, limit = 10): Promise<MusicTrack[]> {
  if (!query.trim()) return [];
  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(
    query.trim()
  )}&fmt=json&limit=${limit}`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`MusicBrainz API responded with ${res.status}`);
  }
  const data = await res.json();
  const recordings = Array.isArray(data.recordings) ? data.recordings : [];

  return recordings.map((rec: Record<string, unknown>, idx: number) => {
    const title = String(rec.title || 'Untitled Recording');
    const artistCredit = Array.isArray(rec['artist-credit']) ? rec['artist-credit'] : [];
    const firstArtist = artistCredit[0] as Record<string, unknown> | undefined;
    const artist = firstArtist?.name ? String(firstArtist.name) : 'Unknown Artist';

    const releases = Array.isArray(rec.releases) ? rec.releases : [];
    const firstRelease = releases[0] as Record<string, unknown> | undefined;
    const album = firstRelease?.title ? String(firstRelease.title) : 'MusicBrainz Recording';

    const rawTags = Array.isArray(rec.tags) ? rec.tags : [];
    const mbTags = rawTags
      .map((t: Record<string, unknown>) => String(t.name || '').toLowerCase().replace(/\s+/g, '-'))
      .filter(Boolean)
      .slice(0, 4);

    const inferred = inferMetadataFromText(artist, title, mbTags.join(','));
    const finalTags = mbTags.length > 0 ? mbTags : inferred.tags;

    const durationSec = rec.length ? Math.round(Number(rec.length) / 1000) : 245;
    const firstReleaseDate = rec['first-release-date'] ? String(rec['first-release-date']) : '';
    const year = firstReleaseDate ? parseInt(firstReleaseDate.slice(0, 4), 10) || 2020 : 2020;

    return {
      id: `mb-${rec.id || idx}-${Date.now()}`,
      title,
      artist,
      album,
      tags: finalTags,
      category: inferred.category,
      durationSec,
      bpm: 115 + ((idx * 11) % 22),
      energy: 66 + ((idx * 8) % 26),
      year,
      youtubeUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(
        `${artist} - ${title}`
      )}`,
      ytDlpQuery: `ytsearch1:"${artist} - ${title} Official Audio"`,
      source: 'MusicBrainz',
    };
  });
}
