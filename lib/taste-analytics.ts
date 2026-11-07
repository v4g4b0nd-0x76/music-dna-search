import { MusicTrack, CURATED_CATALOG } from './music-data';

export interface ArtistAnalyticsPoint {
  name: string;
  affinityScore: number;
  catalogTracks: number;
  avgBpm: number;
  isFavorite: boolean;
  primaryCategory: string;
}

export interface TagAnalyticsPoint {
  tag: string;
  label: string;
  weight: number;
  trackCount: number;
  isFavorite: boolean;
}

export interface CategoryAnalyticsPoint {
  category: string;
  score: number;
  sharePct: number;
  trackCount: number;
  isFavorite: boolean;
}

export interface TasteAnalyticsData {
  artistSeries: ArtistAnalyticsPoint[];
  tagSeries: TagAnalyticsPoint[];
  categorySeries: CategoryAnalyticsPoint[];
  summary: {
    totalFavoriteSignals: number;
    topCategory: string;
    topArtist: string;
    topTag: string;
    avgFavoriteBpm: number;
  };
}

/**
 * Computes chart-ready analytics series for Artist Popularity, Tag Weights, and Genre/Category Affinity
 * directly from the user's FavoritesContext state and available track catalog.
 */
export function computeTasteAnalytics(
  favorites: {
    favoriteArtists: string[];
    favoriteTags: string[];
    favoriteCategories: string[];
  },
  catalogPool: MusicTrack[] = CURATED_CATALOG
): TasteAnalyticsData {
  const favArtistsLower = new Map<string, string>();
  for (const a of favorites.favoriteArtists) {
    const clean = a.trim();
    if (clean) favArtistsLower.set(clean.toLowerCase(), clean);
  }

  const favTagsLower = new Set(
    favorites.favoriteTags.map((t) => t.trim().toLowerCase().replace(/^#+/, '')).filter(Boolean)
  );

  const favCatsLower = new Set(
    favorites.favoriteCategories.map((c) => c.trim().toLowerCase()).filter(Boolean)
  );

  // 1. Build Artist Popularity & Affinity Series
  const artistMap = new Map<
    string,
    {
      displayName: string;
      trackCount: number;
      bpmSum: number;
      tagMatches: number;
      catMatches: number;
      isFavorite: boolean;
      primaryCategory: string;
    }
  >();

  // Ensure all explicit favorite artists appear even if they have 0 catalog tracks
  for (const [lower, display] of favArtistsLower.entries()) {
    artistMap.set(lower, {
      displayName: display,
      trackCount: 0,
      bpmSum: 0,
      tagMatches: 0,
      catMatches: 0,
      isFavorite: true,
      primaryCategory: favorites.favoriteCategories[0] || 'Electronic',
    });
  }

  for (const track of catalogPool) {
    const key = track.artist.toLowerCase();
    const existing = artistMap.get(key) || {
      displayName: track.artist,
      trackCount: 0,
      bpmSum: 0,
      tagMatches: 0,
      catMatches: 0,
      isFavorite: favArtistsLower.has(key),
      primaryCategory: track.category,
    };

    existing.trackCount += 1;
    existing.bpmSum += track.bpm || 120;
    existing.primaryCategory = track.category;

    for (const t of track.tags) {
      if (favTagsLower.has(t.toLowerCase())) {
        existing.tagMatches += 1;
      }
    }
    if (favCatsLower.has(track.category.toLowerCase())) {
      existing.catMatches += 1;
    }

    artistMap.set(key, existing);
  }

  const artistSeries: ArtistAnalyticsPoint[] = Array.from(artistMap.values())
    .map((item) => {
      const baseScore = item.isFavorite ? 55 : 20;
      const trackBoost = Math.min(20, item.trackCount * 8);
      const tagBoost = Math.min(18, item.tagMatches * 6);
      const catBoost = item.catMatches > 0 ? 6 : 0;
      const affinityScore = Math.min(99, baseScore + trackBoost + tagBoost + catBoost);
      const avgBpm =
        item.trackCount > 0 ? Math.round(item.bpmSum / item.trackCount) : 124;

      return {
        name: item.displayName,
        affinityScore,
        catalogTracks: item.trackCount,
        avgBpm,
        isFavorite: item.isFavorite,
        primaryCategory: item.primaryCategory,
      };
    })
    .sort(
      (a, b) =>
        Number(b.isFavorite) - Number(a.isFavorite) ||
        b.affinityScore - a.affinityScore ||
        a.name.localeCompare(b.name)
    )
    .slice(0, 8);

  // 2. Build Sonic Tag Weights Series
  const tagMap = new Map<
    string,
    { tag: string; trackCount: number; favArtistOverlap: number; isFavorite: boolean }
  >();

  for (const favTag of favTagsLower) {
    tagMap.set(favTag, {
      tag: favTag,
      trackCount: 0,
      favArtistOverlap: 0,
      isFavorite: true,
    });
  }

  for (const track of catalogPool) {
    const isTrackByFavArtist = favArtistsLower.has(track.artist.toLowerCase());
    for (const rawTag of track.tags) {
      const t = rawTag.toLowerCase();
      const entry = tagMap.get(t) || {
        tag: t,
        trackCount: 0,
        favArtistOverlap: 0,
        isFavorite: favTagsLower.has(t),
      };
      entry.trackCount += 1;
      if (isTrackByFavArtist) {
        entry.favArtistOverlap += 1;
      }
      tagMap.set(t, entry);
    }
  }

  const tagSeries: TagAnalyticsPoint[] = Array.from(tagMap.values())
    .map((item) => {
      const favBoost = item.isFavorite ? 45 : 10;
      const countScore = Math.min(35, item.trackCount * 7);
      const artistOverlapBoost = Math.min(19, item.favArtistOverlap * 8);
      const weight = Math.min(99, favBoost + countScore + artistOverlapBoost);
      return {
        tag: item.tag,
        label: `#${item.tag}`,
        weight,
        trackCount: item.trackCount,
        isFavorite: item.isFavorite,
      };
    })
    .sort(
      (a, b) =>
        Number(b.isFavorite) - Number(a.isFavorite) ||
        b.weight - a.weight ||
        a.tag.localeCompare(b.tag)
    )
    .slice(0, 8);

  // 3. Build Category / Genre Distribution Series
  const standardCategories = [
    'Electronic',
    'Indie & Funk',
    'Psychedelic Rock',
    'Synthwave & Chill',
    'Downtempo & Jazz',
  ];
  const categorySet = new Set<string>([
    ...standardCategories,
    ...favorites.favoriteCategories,
  ]);

  const rawCategoryScores: {
    category: string;
    rawScore: number;
    trackCount: number;
    isFavorite: boolean;
  }[] = [];

  for (const cat of categorySet) {
    const catLower = cat.toLowerCase();
    const isFavorite = favCatsLower.has(catLower);
    const matchingTracks = catalogPool.filter(
      (t) => t.category.toLowerCase() === catLower
    );
    let favSignalHits = 0;
    for (const t of matchingTracks) {
      if (favArtistsLower.has(t.artist.toLowerCase())) favSignalHits += 2;
      for (const tg of t.tags) {
        if (favTagsLower.has(tg.toLowerCase())) favSignalHits += 1;
      }
    }

    const rawScore =
      (isFavorite ? 45 : 12) +
      matchingTracks.length * 5 +
      favSignalHits * 6;

    rawCategoryScores.push({
      category: cat,
      rawScore: Math.min(99, rawScore),
      trackCount: matchingTracks.length,
      isFavorite,
    });
  }

  const totalRawCat =
    rawCategoryScores.reduce((acc, item) => acc + item.rawScore, 0) || 1;

  const categorySeries: CategoryAnalyticsPoint[] = rawCategoryScores
    .map((item) => ({
      category: item.category,
      score: item.rawScore,
      sharePct: Math.round((item.rawScore / totalRawCat) * 100),
      trackCount: item.trackCount,
      isFavorite: item.isFavorite,
    }))
    .sort((a, b) => b.score - a.score);

  // 4. Summary Readout
  const favArtistPoints = artistSeries.filter((a) => a.isFavorite);
  const avgFavoriteBpm =
    favArtistPoints.length > 0
      ? Math.round(
          favArtistPoints.reduce((acc, a) => acc + a.avgBpm, 0) /
            favArtistPoints.length
        )
      : artistSeries[0]?.avgBpm || 124;

  return {
    artistSeries,
    tagSeries,
    categorySeries,
    summary: {
      totalFavoriteSignals:
        favorites.favoriteArtists.length +
        favorites.favoriteTags.length +
        favorites.favoriteCategories.length,
      topCategory: categorySeries[0]?.category || 'Electronic',
      topArtist: artistSeries[0]?.name || 'Bicep',
      topTag: tagSeries[0]?.label || '#breakbeat',
      avgFavoriteBpm,
    },
  };
}

export interface PlaylistDurationBucket {
  bucket: string;
  shortLabel: string;
  minSec: number;
  maxSec: number;
  count: number;
  sharePct: number;
  totalSec: number;
  trackTitles: string[];
}

export interface PlaylistTrackDurationPoint {
  id: string;
  index: number;
  title: string;
  artist: string;
  shortName: string;
  durationSec: number;
  durationMin: number;
  durationFormatted: string;
  genre: string;
  bpm: number;
}

export interface PlaylistGenreBucket {
  genre: string;
  count: number;
  sharePct: number;
  totalDurationSec: number;
  totalDurationFormatted: string;
  avgDurationSec: number;
  avgDurationFormatted: string;
  avgBpm: number;
  color: string;
}

export interface PlaylistDistributionAnalytics {
  durationBuckets: PlaylistDurationBucket[];
  trackDurationSeries: PlaylistTrackDurationPoint[];
  genreDistribution: PlaylistGenreBucket[];
  summary: {
    totalTracks: number;
    totalDurationSec: number;
    totalDurationFormatted: string;
    avgDurationSec: number;
    avgDurationFormatted: string;
    shortestTrack: {
      title: string;
      artist: string;
      durationSec: number;
      durationFormatted: string;
    } | null;
    longestTrack: {
      title: string;
      artist: string;
      durationSec: number;
      durationFormatted: string;
    } | null;
    dominantGenre: string;
    uniqueGenres: number;
  };
}

const GENRE_CHART_COLORS = [
  '#fbbf24', // amber-400
  '#34d399', // emerald-400
  '#38bdf8', // sky-400
  '#a78bfa', // violet-400
  '#fb7185', // rose-400
  '#f97316', // orange-500
  '#2dd4bf', // teal-400
];

function formatSecToMmSs(sec: number): string {
  const safe = Math.max(0, Math.round(sec));
  const mins = Math.floor(safe / 60);
  const rem = safe % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

/**
 * Computes chart-ready distributions of song durations (both histogram buckets and per-track sequence)
 * and genres/categories for the currently generated playlist.
 */
export function computePlaylistDistribution(
  playlistTracks: MusicTrack[]
): PlaylistDistributionAnalytics {
  const bucketDefs: {
    bucket: string;
    shortLabel: string;
    minSec: number;
    maxSec: number;
  }[] = [
    { bucket: '< 3 min (Short)', shortLabel: '< 3m', minSec: 0, maxSec: 179 },
    { bucket: '3–4 min (Standard)', shortLabel: '3–4m', minSec: 180, maxSec: 239 },
    { bucket: '4–5 min (Extended)', shortLabel: '4–5m', minSec: 240, maxSec: 299 },
    { bucket: '5–6 min (Club Mix)', shortLabel: '5–6m', minSec: 300, maxSec: 359 },
    { bucket: '6+ min (Long-Form)', shortLabel: '6m+', minSec: 360, maxSec: Infinity },
  ];

  const totalTracks = playlistTracks.length;

  const durationBuckets: PlaylistDurationBucket[] = bucketDefs.map((def) => {
    const matching = playlistTracks.filter((t) => {
      const d = Math.max(0, t.durationSec || 0);
      return d >= def.minSec && d <= def.maxSec;
    });
    const totalSec = matching.reduce((sum, t) => sum + (t.durationSec || 0), 0);
    return {
      bucket: def.bucket,
      shortLabel: def.shortLabel,
      minSec: def.minSec,
      maxSec: def.maxSec,
      count: matching.length,
      sharePct: totalTracks > 0 ? Math.round((matching.length / totalTracks) * 100) : 0,
      totalSec,
      trackTitles: matching.map((t) => `${t.artist} - ${t.title}`),
    };
  });

  const trackDurationSeries: PlaylistTrackDurationPoint[] = playlistTracks.map(
    (t, idx) => {
      const durationSec = Math.max(0, t.durationSec || 0);
      const rawLabel = `${t.artist} — ${t.title}`;
      const shortName =
        rawLabel.length > 18 ? `${rawLabel.slice(0, 17)}…` : rawLabel;
      return {
        id: t.id,
        index: idx + 1,
        title: t.title,
        artist: t.artist,
        shortName,
        durationSec,
        durationMin: Number((durationSec / 60).toFixed(2)),
        durationFormatted: formatSecToMmSs(durationSec),
        genre: (t.category || 'Uncategorized').trim() || 'Uncategorized',
        bpm: t.bpm || 120,
      };
    }
  );

  const genreMap = new Map<
    string,
    { count: number; totalDurationSec: number; bpmSum: number }
  >();

  for (const t of playlistTracks) {
    const genre = (t.category || 'Uncategorized').trim() || 'Uncategorized';
    const curr = genreMap.get(genre) || {
      count: 0,
      totalDurationSec: 0,
      bpmSum: 0,
    };
    curr.count += 1;
    curr.totalDurationSec += Math.max(0, t.durationSec || 0);
    curr.bpmSum += t.bpm || 120;
    genreMap.set(genre, curr);
  }

  const genreDistribution: PlaylistGenreBucket[] = Array.from(genreMap.entries())
    .sort(
      (a, b) =>
        b[1].count - a[1].count ||
        b[1].totalDurationSec - a[1].totalDurationSec ||
        a[0].localeCompare(b[0])
    )
    .map(([genre, stats], idx) => {
      const avgDurationSec =
        stats.count > 0 ? Math.round(stats.totalDurationSec / stats.count) : 0;
      const avgBpm = stats.count > 0 ? Math.round(stats.bpmSum / stats.count) : 120;
      return {
        genre,
        count: stats.count,
        sharePct:
          totalTracks > 0 ? Math.round((stats.count / totalTracks) * 100) : 0,
        totalDurationSec: stats.totalDurationSec,
        totalDurationFormatted: formatSecToMmSs(stats.totalDurationSec),
        avgDurationSec,
        avgDurationFormatted: formatSecToMmSs(avgDurationSec),
        avgBpm,
        color: GENRE_CHART_COLORS[idx % GENRE_CHART_COLORS.length],
      };
    });

  const totalDurationSec = playlistTracks.reduce(
    (sum, t) => sum + Math.max(0, t.durationSec || 0),
    0
  );
  const avgDurationSec =
    totalTracks > 0 ? Math.round(totalDurationSec / totalTracks) : 0;

  const sortedByDuration = [...playlistTracks].sort(
    (a, b) => (a.durationSec || 0) - (b.durationSec || 0)
  );
  const shortest = sortedByDuration[0];
  const longest = sortedByDuration[sortedByDuration.length - 1];

  return {
    durationBuckets,
    trackDurationSeries,
    genreDistribution,
    summary: {
      totalTracks,
      totalDurationSec,
      totalDurationFormatted: formatSecToMmSs(totalDurationSec),
      avgDurationSec,
      avgDurationFormatted: formatSecToMmSs(avgDurationSec),
      shortestTrack: shortest
        ? {
            title: shortest.title,
            artist: shortest.artist,
            durationSec: shortest.durationSec,
            durationFormatted: formatSecToMmSs(shortest.durationSec),
          }
        : null,
      longestTrack: longest
        ? {
            title: longest.title,
            artist: longest.artist,
            durationSec: longest.durationSec,
            durationFormatted: formatSecToMmSs(longest.durationSec),
          }
        : null,
      dominantGenre: genreDistribution[0]?.genre || 'None',
      uniqueGenres: genreDistribution.length,
    },
  };
}

