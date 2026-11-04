'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Disc3,
  Search,
  Terminal,
  Plus,
  Check,
  ExternalLink,
  Copy,
  Trash2,
  Sparkles,
  SlidersHorizontal,
  ListMusic,
  Heart,
  Download,
  RefreshCw,
  FolderGit2,
  Radio,
  Music2,
  Play,
  Square,
  FileCode2,
  Tag,
  Layers,
  CheckSquare,
} from 'lucide-react';
import {
  MusicTrack,
  Playlist,
  YtDlpOptions,
  YtDlpCookieSource,
  YtDlpCookieBrowser,
  AlgorithmMode,
  CURATED_CATALOG,
  SEED_YOUTUBE_FEED_SAMPLE,
} from '@/lib/music-data';
import {
  parseYouTubeFeedInput,
  filterMusicTracks,
  buildTasteProfile,
  rankTracksByTaste,
  generateYtDlpCommand,
  generateM3u8Playlist,
  formatDuration,
  buildYtDlpCookieFlag,
  normalizeBulkTags,
  computeBulkTrackOverrides,
  applyTrackOverridesToPool,
  TrackMetadataOverride,
  BulkTagOperationMode,
} from '@/lib/taste-engine';
import {
  searchItunesCatalog,
  searchMusicBrainzCatalog,
} from '@/lib/external-search';
import { useFavorites } from '@/context/FavoritesContext';
import TrackSearch from '@/components/TrackSearch';
import YouTubeFeedImporter from '@/components/YouTubeFeedImporter';
import TasteAnalytics from '@/components/TasteAnalytics';
import GitHubPagesDeployer from '@/components/GitHubPagesDeployer';

const STORAGE_KEY = 'cratedig_yt_state_v1';

const DEFAULT_PLAYLISTS: Playlist[] = [
  {
    id: 'pl-late-night',
    name: 'Late Night Analog & Breaks',
    description: 'Warm analog synth, breakbeat, and hypnotic grooves ready for yt-dlp.',
    createdAt: '2026-11-04',
    trackIds: ['trk-bicep-glue', 'trk-overmono-goodlies', 'trk-khruangbin-time', 'trk-fp-bias'],
  },
  {
    id: 'pl-psych-funk',
    name: 'Sunlit Psych & Filter Disco',
    description: 'Psychedelic funk, guitar grooves, and downtempo rhythms.',
    createdAt: '2026-11-04',
    trackIds: ['trk-tame-letithappen', 'trk-parcels-overnight', 'trk-locket-crumb'],
  },
];

export default function CrateDigWorkbench() {
  // Navigation & Active Section
  const [activeSection, setActiveSection] = useState<'feed' | 'discover' | 'playlists' | 'ytdlp' | 'deploy'>('discover');
  const [showCookiePanelInDiscover, setShowCookiePanelInDiscover] = useState<boolean>(true);

  // YouTube Feed Input State
  const [feedText, setFeedText] = useState<string>(SEED_YOUTUBE_FEED_SAMPLE);
  const [feedTracks, setFeedTracks] = useState<MusicTrack[]>(() =>
    parseYouTubeFeedInput(SEED_YOUTUBE_FEED_SAMPLE)
  );
  const [customCatalogTracks, setCustomCatalogTracks] = useState<MusicTrack[]>([]);

  // Favorites State via React Context (persisted across sessionStorage & localStorage)
  const {
    favoriteArtists,
    favoriteTags,
    favoriteCategories,
    toggleFavoriteArtist,
    toggleFavoriteTag,
    toggleFavoriteCategory,
    addFavoriteSignal,
    hydrateFavorites,
    resetFavoritesToDefault,
  } = useFavorites();

  // Custom Add Inputs for Favorites
  const [newFavType, setNewFavType] = useState<'artist' | 'tag' | 'category'>('artist');
  const [newFavValue, setNewFavValue] = useState<string>('');

  // Discovery & Algorithm Controls
  const [algorithmMode, setAlgorithmMode] = useState<AlgorithmMode>('hybrid-affinity');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [externalSource, setExternalSource] = useState<'itunes' | 'musicbrainz'>('itunes');
  const [isSearchingExternal, setIsSearchingExternal] = useState<boolean>(false);
  const [externalStatusMsg, setExternalStatusMsg] = useState<string>('');

  // Playlists State
  const [playlists, setPlaylists] = useState<Playlist[]>(DEFAULT_PLAYLISTS);
  const [activePlaylistId, setActivePlaylistId] = useState<string>('pl-late-night');
  const [newPlaylistName, setNewPlaylistName] = useState<string>('');

  // yt-dlp Configuration State (including Cookie Authentication)
  const [ytDlpOptions, setYtDlpOptions] = useState<YtDlpOptions>({
    format: 'mp3',
    audioQuality: '0',
    embedThumbnail: true,
    embedMetadata: true,
    addSubtitles: false,
    sponsorBlock: true,
    outputTemplate: '%(artist,uploader)s - %(title)s.%(ext)s',
    useSearchFallback: false,
    batchFileMode: true,
    cookieSource: 'browser',
    cookieBrowser: 'firefox',
    cookieProfile: '',
    cookieFilePath: './cookies.txt',
    musicOnlyFilter: true,
    maxDurationSec: 600,
  });

  const activeCookieFlag = useMemo(
    () => buildYtDlpCookieFlag(ytDlpOptions),
    [ytDlpOptions]
  );

  // Clipboard & Preview State
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [playingPreviewTrackId, setPlayingPreviewTrackId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Bulk-Edit & Track Metadata Overrides State
  const [trackOverrides, setTrackOverrides] = useState<Record<string, TrackMetadataOverride>>({});
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [bulkTagInput, setBulkTagInput] = useState<string>('');
  const [bulkTagMode, setBulkTagMode] = useState<BulkTagOperationMode>('add');
  const [bulkCategoryInput, setBulkCategoryInput] = useState<string>('');
  const [bulkSyncToFavorites, setBulkSyncToFavorites] = useState<boolean>(true);
  const [bulkEditStatusMessage, setBulkEditStatusMessage] = useState<string | null>(null);
  const [showDiscoverBulkBar, setShowDiscoverBulkBar] = useState<boolean>(false);

  // Load persisted playlists, feedText, ytDlpOptions, and trackOverrides from sessionStorage / localStorage
  useEffect(() => {
    try {
      const saved =
        sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.playlists && parsed.playlists.length > 0) {
          setPlaylists(parsed.playlists);
          setActivePlaylistId(parsed.playlists[0].id);
        }
        if (parsed.feedText) {
          setFeedText(parsed.feedText);
          setFeedTracks(parseYouTubeFeedInput(parsed.feedText));
        }
        if (parsed.ytDlpOptions) {
          setYtDlpOptions((prev) => ({ ...prev, ...parsed.ytDlpOptions }));
        }
        if (parsed.trackOverrides && typeof parsed.trackOverrides === 'object') {
          setTrackOverrides(parsed.trackOverrides);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  // Save state to sessionStorage & localStorage on changes
  useEffect(() => {
    try {
      const payload = JSON.stringify({
        favoriteArtists,
        favoriteTags,
        favoriteCategories,
        playlists,
        feedText,
        ytDlpOptions,
        trackOverrides,
      });
      sessionStorage.setItem(STORAGE_KEY, payload);
      localStorage.setItem(STORAGE_KEY, payload);
    } catch {
      // ignore storage errors
    }
  }, [
    favoriteArtists,
    favoriteTags,
    favoriteCategories,
    playlists,
    feedText,
    ytDlpOptions,
    trackOverrides,
  ]);

  // Combine Curated Catalog + Feed Tracks + External API Tracks (deduplicated by id or artist+title) + Bulk Metadata Overrides
  const allTracksPool = useMemo(() => {
    const map = new Map<string, MusicTrack>();
    for (const t of CURATED_CATALOG) {
      map.set(`${t.artist.toLowerCase()}::${t.title.toLowerCase()}`, t);
    }
    for (const t of feedTracks) {
      const key = `${t.artist.toLowerCase()}::${t.title.toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, t);
      }
    }
    for (const t of customCatalogTracks) {
      const key = `${t.artist.toLowerCase()}::${t.title.toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, t);
      }
    }
    return applyTrackOverridesToPool(Array.from(map.values()), trackOverrides);
  }, [feedTracks, customCatalogTracks, trackOverrides]);

  const activePlaylist = useMemo(() => {
    return playlists.find((p) => p.id === activePlaylistId) || playlists[0];
  }, [playlists, activePlaylistId]);

  const activePlaylistTracks = useMemo(() => {
    if (!activePlaylist) return [];
    const byId = new Map(allTracksPool.map((t) => [t.id, t]));
    return activePlaylist.trackIds
      .map((id) => byId.get(id))
      .filter((t): t is MusicTrack => Boolean(t));
  }, [activePlaylist, allTracksPool]);

  // Compute Taste Profile (incorporating feedTracks + saved playlist tracks with any bulk overrides applied)
  const tasteProfile = useMemo(() => {
    const overriddenFeed = applyTrackOverridesToPool(feedTracks, trackOverrides);
    const seedMap = new Map<string, MusicTrack>();
    for (const t of overriddenFeed) seedMap.set(t.id, t);
    for (const t of activePlaylistTracks) seedMap.set(t.id, t);
    return buildTasteProfile(
      Array.from(seedMap.values()),
      favoriteArtists,
      favoriteTags,
      favoriteCategories
    );
  }, [feedTracks, trackOverrides, activePlaylistTracks, favoriteArtists, favoriteTags, favoriteCategories]);

  // Compute Ranked Discovery Tracks
  const rankedTracks = useMemo(() => {
    return rankTracksByTaste(
      allTracksPool,
      tasteProfile,
      algorithmMode,
      searchQuery,
      categoryFilter
    );
  }, [allTracksPool, tasteProfile, algorithmMode, searchQuery, categoryFilter]);

  const generatedPlaylistCommand = useMemo(() => {
    return generateYtDlpCommand(activePlaylistTracks, ytDlpOptions);
  }, [activePlaylistTracks, ytDlpOptions]);

  // Handlers
  const handleAnalyzeFeed = () => {
    const filtered = filterMusicTracks(feedText);
    if (filtered.filteredText) {
      setFeedText(filtered.filteredText);
    }
    setFeedTracks(filtered.tracks);
    setActiveSection('discover');
  };

  const handleCleanFeedTextWithFilter = () => {
    const filtered = filterMusicTracks(feedText);
    setFeedText(filtered.filteredText);
    setFeedTracks(filtered.tracks);
  };

  const handleLoadPresetFeed = (preset: 'electronic' | 'psych' | 'synth') => {
    if (preset === 'electronic') {
      setFeedText(SEED_YOUTUBE_FEED_SAMPLE);
      setFeedTracks(parseYouTubeFeedInput(SEED_YOUTUBE_FEED_SAMPLE));
    } else if (preset === 'psych') {
      const sample = `https://www.youtube.com/watch?v=2Y6Nne8RvaA - Khruangbin - Time (You and I) [Psychedelic Funk]
https://www.youtube.com/watch?v=pFptt7Cargc - Tame Impala - Let It Happen [Psychedelic Rock]
https://www.youtube.com/watch?v=BqnG_Ei35JE - Crumb - Locket [Psychedelic Pop / Indie]
https://www.youtube.com/watch?v=IJrKlSkxRHA - Unknown Mortal Orchestra - Hunnybee [Psychedelic Funk]`;
      setFeedText(sample);
      setFeedTracks(parseYouTubeFeedInput(sample));
    } else {
      const sample = `https://www.youtube.com/watch?v=8GW6sLrK40k - HOME - Resonance [Synthwave / Chillwave]
https://www.youtube.com/watch?v=yergWdn968o - Com Truise - Brokendate [Synthwave / Analog]
https://www.youtube.com/watch?v=ziAqB9nb_To - Tycho - Awake [Chillwave / Downtempo]`;
      setFeedText(sample);
      setFeedTracks(parseYouTubeFeedInput(sample));
    }
  };

  const handleAddCustomFavorite = (e: React.FormEvent) => {
    e.preventDefault();
    const val = newFavValue.trim();
    if (!val) return;
    addFavoriteSignal(newFavType, val);
    setNewFavValue('');
  };

  const handleExternalCatalogSearch = async () => {
    const q = searchQuery.trim() || favoriteArtists[0] || 'Bicep';
    setIsSearchingExternal(true);
    setExternalStatusMsg(`Querying ${externalSource === 'itunes' ? 'iTunes API' : 'MusicBrainz API'} for "${q}"...`);
    try {
      const results =
        externalSource === 'itunes'
          ? await searchItunesCatalog(q, 8)
          : await searchMusicBrainzCatalog(q, 8);
      if (results.length > 0) {
        setCustomCatalogTracks((prev) => [...results, ...prev]);
        setExternalStatusMsg(`Added ${results.length} tracks from ${externalSource === 'itunes' ? 'iTunes' : 'MusicBrainz'} with YouTube & yt-dlp links.`);
      } else {
        setExternalStatusMsg(`No external tracks found for "${q}". Try another artist or song title.`);
      }
    } catch {
      setExternalStatusMsg(`External API unavailable in current network; displaying local taste-matched catalog.`);
    } finally {
      setIsSearchingExternal(false);
    }
  };

  const toggleTrackInPlaylist = (trackId: string, playlistId = activePlaylistId) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const exists = pl.trackIds.includes(trackId);
        return {
          ...pl,
          trackIds: exists
            ? pl.trackIds.filter((id) => id !== trackId)
            : [...pl.trackIds, trackId],
        };
      })
    );
  };

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPlaylistName.trim();
    if (!name) return;
    const newPl: Playlist = {
      id: `pl-${Date.now()}`,
      name,
      description: `Custom crate created for yt-dlp batch downloading`,
      createdAt: new Date().toISOString().slice(0, 10),
      trackIds: [],
    };
    setPlaylists((prev) => [...prev, newPl]);
    setActivePlaylistId(newPl.id);
    setNewPlaylistName('');
  };

  const handleDeletePlaylist = (id: string) => {
    if (playlists.length <= 1) return;
    const remaining = playlists.filter((p) => p.id !== id);
    setPlaylists(remaining);
    if (activePlaylistId === id) {
      setActivePlaylistId(remaining[0].id);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
  };

  const downloadFile = (filename: string, content: string, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePlayPreview = (track: MusicTrack) => {
    if (!track.previewAudioUrl) return;
    if (playingPreviewTrackId === track.id && audioElement) {
      audioElement.pause();
      setPlayingPreviewTrackId(null);
      return;
    }
    if (audioElement) {
      audioElement.pause();
    }
    const audio = new Audio(track.previewAudioUrl);
    audio.play().catch(() => {});
    audio.onended = () => setPlayingPreviewTrackId(null);
    setAudioElement(audio);
    setPlayingPreviewTrackId(track.id);
  };

  // Bulk-Selection & Bulk-Edit Handlers
  const toggleSelectTrack = (trackId: string) => {
    setSelectedTrackIds((prev) =>
      prev.includes(trackId)
        ? prev.filter((id) => id !== trackId)
        : [...prev, trackId]
    );
    setBulkEditStatusMessage(null);
  };

  const selectTracksScope = (trackList: MusicTrack[]) => {
    const scopeIds = trackList.map((t) => t.id);
    const allAlreadySelected =
      scopeIds.length > 0 && scopeIds.every((id) => selectedTrackIds.includes(id));
    if (allAlreadySelected) {
      setSelectedTrackIds((prev) => prev.filter((id) => !scopeIds.includes(id)));
    } else {
      setSelectedTrackIds((prev) => Array.from(new Set([...prev, ...scopeIds])));
    }
    setBulkEditStatusMessage(null);
  };

  const appendQuickBulkTag = (tag: string) => {
    const clean = tag.replace(/^#+/, '').trim();
    const current = normalizeBulkTags(bulkTagInput);
    if (!current.includes(clean)) {
      setBulkTagInput([...current, clean].join(', '));
    }
  };

  const handleApplyBulkEdits = (scopeTracks?: MusicTrack[]) => {
    const activeIds = scopeTracks
      ? scopeTracks.map((t) => t.id).filter((id) => selectedTrackIds.includes(id))
      : selectedTrackIds;
    const targetIds = activeIds.length > 0 ? activeIds : selectedTrackIds;

    if (targetIds.length === 0) {
      setBulkEditStatusMessage('Select at least one track using the checkboxes first.');
      return;
    }

    const parsedTags = normalizeBulkTags(bulkTagInput);
    const nextCat = bulkCategoryInput.trim();

    if (parsedTags.length === 0 && !nextCat) {
      setBulkEditStatusMessage('Enter at least one tag or choose a category to apply.');
      return;
    }

    setTrackOverrides((prev) =>
      computeBulkTrackOverrides(
        allTracksPool,
        targetIds,
        {
          tags: parsedTags,
          tagMode: bulkTagMode,
          category: nextCat || undefined,
        },
        prev
      )
    );

    if (bulkSyncToFavorites) {
      if (bulkTagMode !== 'remove') {
        for (const t of parsedTags) {
          addFavoriteSignal('tag', t);
        }
      }
      if (nextCat) {
        addFavoriteSignal('category', nextCat);
      }
    }

    const summaryParts: string[] = [];
    if (parsedTags.length > 0) {
      const verb =
        bulkTagMode === 'replace'
          ? 'replaced tags with'
          : bulkTagMode === 'remove'
          ? 'removed tags'
          : 'added tags';
      summaryParts.push(`${verb} ${parsedTags.map((t) => `#${t}`).join(', ')}`);
    }
    if (nextCat) {
      summaryParts.push(`set category to "${nextCat}"`);
    }

    setBulkEditStatusMessage(
      `Updated ${targetIds.length} track${targetIds.length === 1 ? '' : 's'}: ${summaryParts.join(' and ')}.`
    );
    setBulkTagInput('');
  };

  const handleBulkRemoveFromPlaylist = () => {
    if (!activePlaylist) return;
    const savedSelected = activePlaylist.trackIds.filter((id) =>
      selectedTrackIds.includes(id)
    );
    if (savedSelected.length === 0) return;
    const removeSet = new Set(savedSelected);
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === activePlaylist.id
          ? { ...pl, trackIds: pl.trackIds.filter((id) => !removeSet.has(id)) }
          : pl
      )
    );
    setSelectedTrackIds((prev) => prev.filter((id) => !removeSet.has(id)));
    setBulkEditStatusMessage(
      `Removed ${savedSelected.length} selected track${savedSelected.length === 1 ? '' : 's'} from "${activePlaylist.name}".`
    );
  };

  const baseCategories = [
    'Electronic',
    'Indie & Funk',
    'Psychedelic Rock',
    'Synthwave & Chill',
    'Downtempo & Jazz',
    'Leftfield & IDM',
    'UK Bass & Breaks',
  ];

  const categoriesList = useMemo(() => {
    const set = new Set<string>(['All', ...baseCategories]);
    for (const t of allTracksPool) {
      if (t.category) set.add(t.category);
    }
    return Array.from(set);
  }, [allTracksPool]);

  const renderBulkEditToolbar = (scopeTracks: MusicTrack[], scopeLabel: string) => {
    const scopeIds = scopeTracks.map((t) => t.id);
    const selectedInScope = scopeIds.filter((id) => selectedTrackIds.includes(id));
    const allInScopeSelected =
      scopeIds.length > 0 && selectedInScope.length === scopeIds.length;
    const effectiveSelectedCount =
      selectedInScope.length > 0 ? selectedInScope.length : selectedTrackIds.length;

    return (
      <div
        role="region"
        aria-label={`Bulk Edit ${scopeLabel}`}
        className="bg-zinc-950/90 border border-amber-500/35 rounded-xl p-4 space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-400/15 text-amber-300 border border-amber-400/30 text-xs font-semibold">
              <Layers className="w-3.5 h-3.5" />
              Bulk Edit {scopeLabel}
            </span>
            <span className="text-xs font-mono text-zinc-300">
              {selectedInScope.length} of {scopeIds.length} selected
              {selectedTrackIds.length > selectedInScope.length
                ? ` (${selectedTrackIds.length} total across crate)`
                : ''}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => selectTracksScope(scopeTracks)}
              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
              {allInScopeSelected
                ? `Deselect All (${scopeIds.length})`
                : `Select All ${scopeLabel} (${scopeIds.length})`}
            </button>

            {selectedTrackIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTrackIds([]);
                  setBulkEditStatusMessage(null);
                }}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-lg text-xs transition-colors cursor-pointer"
              >
                Clear Selection
              </button>
            )}

            {activeSection === 'playlists' && selectedInScope.length > 0 && (
              <button
                type="button"
                onClick={handleBulkRemoveFromPlaylist}
                className="px-2.5 py-1 bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 rounded-lg text-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                Remove Selected ({selectedInScope.length})
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          {/* Tag Mode & Tag Input */}
          <div className="lg:col-span-6 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-medium text-zinc-300 flex items-center gap-1">
                <Tag className="w-3 h-3 text-amber-400" />
                Bulk Tags (comma-separated)
              </label>
              <div className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-md p-0.5 text-[11px]">
                {(
                  [
                    { id: 'add', label: 'Add Tags' },
                    { id: 'replace', label: 'Replace' },
                    { id: 'remove', label: 'Remove' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setBulkTagMode(mode.id)}
                    className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                      bulkTagMode === mode.id
                        ? 'bg-amber-400 text-zinc-950 font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <input
              type="text"
              value={bulkTagInput}
              onChange={(e) => setBulkTagInput(e.target.value)}
              aria-label={`Bulk tags for ${scopeLabel}`}
              placeholder="e.g. acid-house, late-night, vinyl-rip"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
            />

            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="text-[11px] text-zinc-500">Quick tags:</span>
              {['acid-house', 'late-night', 'vinyl-rip', 'deep-cut', 'warm-analog'].map(
                (presetTag) => (
                  <button
                    key={presetTag}
                    type="button"
                    onClick={() => appendQuickBulkTag(presetTag)}
                    className="px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-amber-300 border border-zinc-800 rounded text-[11px] font-mono transition-colors cursor-pointer"
                  >
                    +#{presetTag}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Bulk Category Selector */}
          <div className="lg:col-span-3 space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-300 block">
              Bulk Category Assignment
            </label>
            <select
              aria-label={`Bulk category for ${scopeLabel}`}
              value={bulkCategoryInput}
              onChange={(e) => setBulkCategoryInput(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-400"
            >
              <option value="">Keep existing category</option>
              {baseCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer select-none pt-0.5">
              <input
                type="checkbox"
                checked={bulkSyncToFavorites}
                onChange={(e) => setBulkSyncToFavorites(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-amber-400 focus:ring-amber-400"
              />
              Sync applied tags/category to Favorites
            </label>
          </div>

          {/* Apply Button */}
          <div className="lg:col-span-3 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => handleApplyBulkEdits(scopeTracks)}
              disabled={effectiveSelectedCount === 0}
              className={`w-full py-2.5 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                effectiveSelectedCount > 0
                  ? 'bg-amber-400 hover:bg-amber-300 text-zinc-950 cursor-pointer shadow-sm'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              {effectiveSelectedCount > 0
                ? `Apply Bulk Edit (${effectiveSelectedCount})`
                : 'Select Tracks to Edit'}
            </button>
          </div>
        </div>

        {bulkEditStatusMessage && (
          <div
            role="status"
            className="text-xs font-mono text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 rounded-lg px-3 py-2 flex items-center justify-between gap-2"
          >
            <span>{bulkEditStatusMessage}</span>
            <button
              type="button"
              onClick={() => setBulkEditStatusMessage(null)}
              className="text-zinc-400 hover:text-zinc-200 text-[11px] cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top Bar Contract: Zone 1 (Wordmark) — Zone 2 (4-5 Nav Links) — Zone 3 (1 Primary CTA) */}
      <header className="sticky top-0 z-30 bg-zinc-950/95 backdrop-blur border-b border-zinc-800/80 px-6 py-3.5 flex items-center justify-between gap-8">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('discover');
          }}
          className="text-lg font-display font-bold tracking-tight text-zinc-100 whitespace-nowrap shrink-0"
        >
          CrateDig YT
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-400" aria-label="Main Navigation">
          <button
            type="button"
            onClick={() => setActiveSection('discover')}
            className={`hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'discover' ? 'text-amber-400 border-amber-400' : 'border-transparent'
            }`}
          >
            Taste Discovery
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('feed')}
            className={`hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'feed' ? 'text-amber-400 border-amber-400' : 'border-transparent'
            }`}
          >
            Cookies &amp; Feed Guide
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('playlists')}
            className={`hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'playlists' ? 'text-amber-400 border-amber-400' : 'border-transparent'
            }`}
          >
            Playlists ({activePlaylist?.trackIds.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('ytdlp')}
            className={`hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'ytdlp' ? 'text-amber-400 border-amber-400' : 'border-transparent'
            }`}
          >
            yt-dlp Generator
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('deploy')}
            className={`hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeSection === 'deploy' ? 'text-amber-400 border-amber-400' : 'border-transparent'
            }`}
          >
            GitHub Pages CI/CD
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSection('ytdlp')}
            className="px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5" />
            Export yt-dlp Script
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar: Taste DNA, Favorites Manager & Playlists */}
        <aside className="lg:col-span-3 space-y-6">
          {/* Taste Profile Summary & Favorites Manager */}
          <section
            aria-label="Taste DNA and Favorites"
            className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-4 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-sm font-display font-semibold text-zinc-100">
                  Taste DNA & Favorites
                </h2>
                <p className="text-xs text-zinc-400 font-mono tabular-nums mt-0.5">
                  {tasteProfile.targetBpmRange[0]}–{tasteProfile.targetBpmRange[1]} BPM · {feedTracks.length} Feed Seeds
                </p>
              </div>
              <button
                type="button"
                onClick={resetFavoritesToDefault}
                title="Reset favorites to default seed profile"
                className="text-[11px] text-zinc-400 hover:text-amber-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Reset Defaults
              </button>
            </div>

            {/* Add Favorite Artist / Tag / Category Form */}
            <form onSubmit={handleAddCustomFavorite} className="space-y-2">
              <label htmlFor="fav-input" className="block text-xs font-medium text-zinc-300">
                Add Favorite Signal
              </label>
              <div className="flex gap-1.5">
                <select
                  aria-label="Favorite Signal Type"
                  value={newFavType}
                  onChange={(e) => setNewFavType(e.target.value as 'artist' | 'tag' | 'category')}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-400"
                >
                  <option value="artist">Artist</option>
                  <option value="tag">Tag</option>
                  <option value="category">Category</option>
                </select>
                <input
                  id="fav-input"
                  type="text"
                  value={newFavValue}
                  onChange={(e) => setNewFavValue(e.target.value)}
                  placeholder={
                    newFavType === 'artist'
                      ? 'e.g. Aphex Twin'
                      : newFavType === 'tag'
                      ? 'e.g. idm'
                      : 'e.g. Electronic'
                  }
                  className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="submit"
                  aria-label="Add Favorite"
                  className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-xs font-medium transition-colors shrink-0 cursor-pointer"
                >
                  Add
                </button>
              </div>
            </form>

            {/* Favorite Artists */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Favorite Artists</span>
                <span className="font-mono tabular-nums">{favoriteArtists.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {favoriteArtists.map((artist) => (
                  <button
                    key={artist}
                    type="button"
                    onClick={() => toggleFavoriteArtist(artist)}
                    title="Click to remove from favorite artists"
                    className="px-2 py-1 text-xs bg-zinc-950 hover:bg-zinc-800 text-amber-300 border border-zinc-800 rounded-md transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <span>{artist}</span>
                    <span className="text-zinc-500 text-[10px]">×</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Favorite Tags */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Favorite Tags</span>
                <span className="font-mono tabular-nums">{favoriteTags.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {favoriteTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleFavoriteTag(tag)}
                    title="Click to remove from favorite tags"
                    className="px-2 py-1 text-xs bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-md transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <span>#{tag}</span>
                    <span className="text-zinc-500 text-[10px]">×</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Favorite Categories */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Favorite Categories</span>
                <span className="font-mono tabular-nums">{favoriteCategories.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {favoriteCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleFavoriteCategory(cat)}
                    title="Click to remove from favorite categories"
                    className="px-2 py-1 text-xs bg-zinc-950 hover:bg-zinc-800 text-emerald-300 border border-zinc-800 rounded-md transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <span>{cat}</span>
                    <span className="text-zinc-500 text-[10px]">×</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Playlists Crate Selector */}
          <section
            aria-label="Playlists Manager"
            className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-4 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-sm font-display font-semibold text-zinc-100">
                Active Playlists
              </h2>
              <ListMusic className="w-4 h-4 text-zinc-400" />
            </div>

            <div className="space-y-1.5">
              {playlists.map((pl) => {
                const isSelected = pl.id === activePlaylistId;
                return (
                  <div
                    key={pl.id}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors border ${
                      isSelected
                        ? 'bg-zinc-800/90 border-amber-400/50 text-zinc-100'
                        : 'bg-zinc-950/60 border-zinc-800/60 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActivePlaylistId(pl.id)}
                      className="flex-1 text-left truncate font-medium cursor-pointer"
                    >
                      {pl.name}
                    </button>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="font-mono tabular-nums text-[11px] text-amber-400">
                        {pl.trackIds.length} trk
                      </span>
                      {playlists.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeletePlaylist(pl.id)}
                          aria-label={`Delete playlist ${pl.name}`}
                          className="text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleCreatePlaylist} className="flex gap-1.5 pt-1">
              <input
                type="text"
                aria-label="New playlist name"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="New playlist name..."
                className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold rounded-lg text-xs transition-colors shrink-0 cursor-pointer whitespace-nowrap"
              >
                Create
              </button>
            </form>
          </section>

          {/* Live yt-dlp Dock Preview */}
          <section
            aria-label="Quick yt-dlp Command Preview"
            className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-display font-semibold text-zinc-200">
                yt-dlp Queue ({activePlaylistTracks.length} tracks)
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(generatedPlaylistCommand, 'sidebar-cmd')}
                className="px-2.5 py-1 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-amber-300 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {copiedId === 'sidebar-cmd' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy CLI
                  </>
                )}
              </button>
            </div>
            <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-36 leading-relaxed">
              {generatedPlaylistCommand}
            </pre>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  downloadFile(
                    `${activePlaylist.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-ytdlp.sh`,
                    generatedPlaylistCommand
                  )
                }
                className="flex-1 py-1.5 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Download .sh
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadFile(
                    `${activePlaylist.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.m3u8`,
                    generateM3u8Playlist(activePlaylist.name, activePlaylistTracks)
                  )
                }
                className="flex-1 py-1.5 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                Export .m3u8
              </button>
            </div>
          </section>
        </aside>

        {/* Main Center & Right Workbench Area */}
        <div className="lg:col-span-9 space-y-6">
          {/* Compact Hero / Workbench Header Banner */}
          <section className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-100 tracking-tight">
                YouTube Feed Taste Analyzer & yt-dlp Crate Builder
              </h1>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Sample your YouTube watch feed, rank recommendations across MusicBrainz & iTunes catalogs, bookmark favorite artists or tags, and export ready-to-run{' '}
                <code className="font-mono text-amber-300 text-xs">yt-dlp</code> scripts. Runs 100% client-side for zero-config GitHub Pages hosting.
              </p>
            </div>

            {/* Mobile / Quick Mode Switcher */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveSection('feed');
                  setShowCookiePanelInDiscover(true);
                }}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeSection === 'feed'
                    ? 'bg-amber-400 text-zinc-950 font-semibold'
                    : 'bg-zinc-800 text-amber-300 border border-amber-400/40 hover:bg-zinc-700'
                }`}
              >
                1. Cookies &amp; CLI Guide ({feedTracks.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('discover')}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeSection === 'discover'
                    ? 'bg-amber-400 text-zinc-950 font-semibold'
                    : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                }`}
              >
                2. Taste Discovery ({rankedTracks.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('playlists')}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeSection === 'playlists'
                    ? 'bg-amber-400 text-zinc-950 font-semibold'
                    : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                }`}
              >
                3. Playlist ({activePlaylistTracks.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('ytdlp')}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeSection === 'ytdlp'
                    ? 'bg-amber-400 text-zinc-950 font-semibold'
                    : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                }`}
              >
                4. yt-dlp CLI
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('deploy')}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeSection === 'deploy'
                    ? 'bg-amber-400 text-zinc-950 font-semibold'
                    : 'bg-zinc-800 text-emerald-300 border border-emerald-500/30 hover:bg-zinc-700'
                }`}
              >
                5. GitHub CI/CD
              </button>
            </div>
          </section>

          {/* SECTION 1: YOUTUBE FEED SAMPLE INGESTION */}
          {activeSection === 'feed' && (
            <section className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                <div>
                  <h2 className="text-base font-display font-semibold text-zinc-100">
                    YouTube Watch Feed & History Sample
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Extract your own personal YouTube feed with <code className="font-mono text-amber-300">yt-dlp</code> cookies, or paste URLs, video titles (<code className="font-mono text-zinc-300">Artist - Track</code>), or JSONL dumps below.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleLoadPresetFeed('electronic')}
                    className="px-2.5 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Preset: UK Electronic
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadPresetFeed('psych')}
                    className="px-2.5 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Preset: Psych Funk
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadPresetFeed('synth')}
                    className="px-2.5 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Preset: Synthwave
                  </button>
                </div>
              </div>

              <YouTubeFeedImporter
                cookieSource={ytDlpOptions.cookieSource || 'browser'}
                cookieBrowser={ytDlpOptions.cookieBrowser || 'chrome'}
                cookieProfile={ytDlpOptions.cookieProfile || ''}
                cookieFilePath={ytDlpOptions.cookieFilePath || './cookies.txt'}
                onUpdateCookieSettings={(settings) =>
                  setYtDlpOptions((prev) => ({ ...prev, ...settings }))
                }
                onImportAuthenticatedFeed={(rawOutput, tracks) => {
                  setFeedText(rawOutput);
                  setFeedTracks(tracks);
                }}
              />

              <div className="space-y-3">
                <label htmlFor="youtube-feed-textarea" className="block text-xs font-medium text-zinc-300">
                  Feed Input (1 URL, Artist - Title, or yt-dlp JSONL object per line)
                </label>
                <textarea
                  id="youtube-feed-textarea"
                  rows={8}
                  value={feedText}
                  onChange={(e) => setFeedText(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-400 leading-relaxed"
                  placeholder="https://www.youtube.com/watch?v=... - Artist - Title [Genre]"
                />
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <p className="text-xs text-zinc-400 font-mono tabular-nums">
                    Kept {filterMusicTracks(feedText).tracks.length} music songs · Filtered out{' '}
                    <span className="text-amber-300">
                      {filterMusicTracks(feedText).filteredOut.length} non-music items (&apos;podcast&apos;, &apos;news&apos;, &apos;update&apos;)
                    </span>{' '}
                    · Extracted {tasteProfile.extractedTags.length} sonic tags
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCleanFeedTextWithFilter}
                      className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700 font-medium text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Run filterMusicTracks
                    </button>
                    <button
                      type="button"
                      onClick={handleAnalyzeFeed}
                      className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Analyze Feed &amp; Update Taste Engine
                    </button>
                  </div>
                </div>
              </div>

              {/* Extracted Signals Table */}
              <div className="pt-4 border-t border-zinc-800 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3.5 space-y-2">
                  <h3 className="text-xs font-semibold text-zinc-300">
                    01. Top Artists in Sample
                  </h3>
                  <div className="space-y-1.5">
                    {tasteProfile.extractedArtists.slice(0, 6).map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <button
                          type="button"
                          onClick={() => toggleFavoriteArtist(item.name)}
                          className="text-zinc-200 hover:text-amber-300 transition-colors cursor-pointer truncate"
                        >
                          {item.name}
                        </button>
                        <span className="font-mono tabular-nums text-zinc-500">weight {item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3.5 space-y-2">
                  <h3 className="text-xs font-semibold text-zinc-300">
                    02. Sonic Tag Clusters
                  </h3>
                  <div className="space-y-1.5">
                    {tasteProfile.extractedTags.slice(0, 6).map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <button
                          type="button"
                          onClick={() => toggleFavoriteTag(item.name)}
                          className="text-zinc-200 hover:text-amber-300 transition-colors cursor-pointer truncate"
                        >
                          #{item.name}
                        </button>
                        <span className="font-mono tabular-nums text-zinc-500">weight {item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3.5 space-y-2">
                  <h3 className="text-xs font-semibold text-zinc-300">
                    03. Category Distribution
                  </h3>
                  <div className="space-y-1.5">
                    {tasteProfile.extractedCategories.map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <button
                          type="button"
                          onClick={() => toggleFavoriteCategory(item.name)}
                          className="text-zinc-200 hover:text-amber-300 transition-colors cursor-pointer truncate"
                        >
                          {item.name}
                        </button>
                        <span className="font-mono tabular-nums text-zinc-500">weight {item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* SECTION 2: TASTE DISCOVERY & EXTERNAL CATALOG SEARCH */}
          {activeSection === 'discover' && (
            <>
              {/* Prominent Above-the-Fold YouTubeFeedImporter (Cookies & CLI Quick Guide) */}
              {showCookiePanelInDiscover ? (
                <div className="space-y-2">
                  <YouTubeFeedImporter
                    cookieSource={ytDlpOptions.cookieSource || 'browser'}
                    cookieBrowser={ytDlpOptions.cookieBrowser || 'chrome'}
                    cookieProfile={ytDlpOptions.cookieProfile || ''}
                    cookieFilePath={ytDlpOptions.cookieFilePath || './cookies.txt'}
                    onUpdateCookieSettings={(settings) =>
                      setYtDlpOptions((prev) => ({ ...prev, ...settings }))
                    }
                    onImportAuthenticatedFeed={(rawOutput, tracks) => {
                      setFeedText(rawOutput);
                      setFeedTracks(tracks);
                    }}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowCookiePanelInDiscover(false)}
                      className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                    >
                      Minimize Cookie &amp; CLI Guide
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-900/90 border-2 border-amber-400/40 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-zinc-300 flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 bg-amber-400 text-zinc-950 font-mono text-[10px] font-bold rounded">
                      STEP 1
                    </span>
                    <span className="font-semibold text-zinc-100">yt-dlp Cookie Mode:</span>
                    <code className="font-mono text-amber-300">
                      {activeCookieFlag || 'Public (No Cookies)'}
                    </code>
                    <span className="text-zinc-500">·</span>
                    <span className="text-zinc-400">
                      {feedTracks.length} personal feed tracks loaded
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCookiePanelInDiscover(true)}
                    className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Open Cookies &amp; CLI Guide
                  </button>
                </div>
              )}

              <TasteAnalytics catalogTracks={allTracksPool} />

              <TrackSearch
                cookieFlag={activeCookieFlag}
                onAddTrackToCatalog={(track) => {
                  setCustomCatalogTracks((prev) => {
                    const exists = prev.some(
                      (p) =>
                        p.id === track.id ||
                        (p.artist.toLowerCase() === track.artist.toLowerCase() &&
                          p.title.toLowerCase() === track.title.toLowerCase())
                    );
                    return exists ? prev : [track, ...prev];
                  });
                }}
                onToggleTrackInPlaylist={(trackId) => toggleTrackInPlaylist(trackId)}
                activePlaylistName={activePlaylist?.name}
                activePlaylistTrackIds={activePlaylist?.trackIds || []}
              />

              <section className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 space-y-4">
              {/* Search, External Catalog Query & Algorithm Controls */}
              <div className="flex flex-col xl:flex-row gap-3 justify-between">
                {/* Search Bar + Live External Catalog Fetch */}
                <div className="flex flex-1 flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      aria-label="Search tracks, artists, or tags"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter or query external catalogs (e.g. Four Tet, Boards of Canada, breakbeat)..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <select
                      aria-label="External Music Database"
                      value={externalSource}
                      onChange={(e) => setExternalSource(e.target.value as 'itunes' | 'musicbrainz')}
                      className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-400"
                    >
                      <option value="itunes">iTunes API</option>
                      <option value="musicbrainz">MusicBrainz API</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleExternalCatalogSearch}
                      disabled={isSearchingExternal}
                      className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-amber-300 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSearchingExternal ? 'animate-spin' : ''}`} />
                      Fetch Live Catalog
                    </button>
                  </div>
                </div>

                {/* Algorithm Selector */}
                <div className="flex items-center gap-2 shrink-0">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="text-xs text-zinc-400 whitespace-nowrap">Algorithm:</span>
                  <div className="flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-lg">
                    {(
                      [
                        { id: 'hybrid-affinity', label: 'Hybrid Affinity' },
                        { id: 'deep-cuts', label: 'Deep Cuts' },
                        { id: 'tag-cluster', label: 'Tag Cluster' },
                        { id: 'high-tempo-sonic', label: 'Sonic Tempo' },
                      ] as const
                    ).map((alg) => (
                      <button
                        key={alg.id}
                        type="button"
                        onClick={() => setAlgorithmMode(alg.id)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                          algorithmMode === alg.id
                            ? 'bg-amber-400 text-zinc-950 font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {alg.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Category Filter Bar & Bulk Edit Trigger */}
              <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-1 flex-wrap">
                  {categoriesList.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        categoryFilter === cat
                          ? 'bg-zinc-800 text-amber-300 border border-zinc-700'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      selectTracksScope(activePlaylistTracks);
                      setShowDiscoverBulkBar(true);
                    }}
                    className="px-2.5 py-1 bg-zinc-950 hover:bg-zinc-800 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    Select Saved Tracks ({activePlaylistTracks.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDiscoverBulkBar((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer border ${
                      showDiscoverBulkBar || selectedTrackIds.length > 0
                        ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                        : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Bulk Edit ({selectedTrackIds.length})
                  </button>
                  {externalStatusMsg && (
                    <span className="text-xs text-amber-300/90 font-mono">
                      {externalStatusMsg}
                    </span>
                  )}
                </div>
              </div>

              {(showDiscoverBulkBar || selectedTrackIds.length > 0) &&
                renderBulkEditToolbar(rankedTracks, 'Tracks')}

              {/* High-Density Discovery Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-[11px] font-medium text-zinc-400">
                      <th className="py-2.5 px-2.5 w-8">
                        <input
                          type="checkbox"
                          aria-label="Select all visible tracks"
                          checked={
                            rankedTracks.length > 0 &&
                            rankedTracks.every((t) => selectedTrackIds.includes(t.id))
                          }
                          onChange={() => selectTracksScope(rankedTracks)}
                          className="rounded border-zinc-700 bg-zinc-900 text-amber-400 focus:ring-amber-400 cursor-pointer"
                        />
                      </th>
                      <th className="py-2.5 px-3">Match</th>
                      <th className="py-2.5 px-3">Track & Artist</th>
                      <th className="py-2.5 px-3 hidden md:table-cell">Category & Tags (Click to Favorite)</th>
                      <th className="py-2.5 px-3 hidden sm:table-cell text-right">BPM / Time</th>
                      <th className="py-2.5 px-3 text-right">YouTube & yt-dlp Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-xs">
                    {rankedTracks.map((track) => {
                      const inPlaylist = activePlaylist?.trackIds.includes(track.id);
                      const isSelected = selectedTrackIds.includes(track.id);
                      const isFavArtist = favoriteArtists.includes(track.artist);
                      const singleYtDlpCmd = generateYtDlpCommand([track], ytDlpOptions);

                      return (
                        <tr
                          key={track.id}
                          className={`hover:bg-zinc-800/40 transition-colors group ${
                            isSelected ? 'bg-amber-400/5' : ''
                          }`}
                        >
                          {/* Multi-Select Checkbox */}
                          <td className="py-3 px-2.5 align-middle">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectTrack(track.id)}
                              aria-label={`Select ${track.artist} - ${track.title}`}
                              className="rounded border-zinc-700 bg-zinc-900 text-amber-400 focus:ring-amber-400 cursor-pointer"
                            />
                          </td>

                          {/* Match Score */}
                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <div className="font-mono tabular-nums font-semibold text-amber-400 text-sm">
                              {track.matchScore}%
                            </div>
                            <div className="text-[11px] text-zinc-500 truncate max-w-[130px]">
                              {track.matchReasons?.[0] || track.source}
                            </div>
                          </td>

                          {/* Track Title & Artist */}
                          <td className="py-3 px-3 align-middle">
                            <div className="flex items-center gap-2">
                              {track.previewAudioUrl && (
                                <button
                                  type="button"
                                  onClick={() => handlePlayPreview(track)}
                                  aria-label={
                                    playingPreviewTrackId === track.id
                                      ? `Stop preview for ${track.title}`
                                      : `Play audio preview for ${track.title}`
                                  }
                                  className="w-6 h-6 rounded-full bg-amber-400/20 text-amber-300 flex items-center justify-center hover:bg-amber-400 hover:text-zinc-950 transition-colors shrink-0 cursor-pointer"
                                >
                                  {playingPreviewTrackId === track.id ? (
                                    <Square className="w-3 h-3" />
                                  ) : (
                                    <Play className="w-3 h-3" />
                                  )}
                                </button>
                              )}
                              <div className="min-w-[160px]">
                                <div className="font-medium text-zinc-100 leading-snug">
                                  {track.title}
                                </div>
                                <div className="flex items-center gap-1.5 text-zinc-400 mt-0.5 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => toggleFavoriteArtist(track.artist)}
                                    title={
                                      isFavArtist
                                        ? 'Remove artist from favorites'
                                        : 'Add artist to favorites'
                                    }
                                    className={`hover:text-amber-300 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                                      isFavArtist ? 'text-amber-300 font-medium' : ''
                                    }`}
                                  >
                                    {track.artist} {isFavArtist ? '★' : '☆'}
                                  </button>
                                  <span aria-hidden="true" className="text-zinc-600">·</span>
                                  <span className="text-zinc-500 whitespace-nowrap">{track.source}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Unboxed Metadata: Category & Interactive Tag Links */}
                          <td className="py-3 px-3 align-middle hidden md:table-cell">
                            <div className="text-zinc-300 text-xs">
                              <button
                                type="button"
                                onClick={() => toggleFavoriteCategory(track.category)}
                                className="hover:text-amber-300 transition-colors cursor-pointer font-medium"
                              >
                                {track.category}
                              </button>
                              <span aria-hidden="true" className="mx-1.5 text-zinc-600">
                                ·
                              </span>
                              <span className="text-zinc-400">
                                {track.tags.map((t, idx) => {
                                  const isFavTag = favoriteTags.includes(t.toLowerCase());
                                  return (
                                    <React.Fragment key={t}>
                                      {idx > 0 && (
                                        <span aria-hidden="true" className="mx-1 text-zinc-600">
                                          /
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => toggleFavoriteTag(t)}
                                        className={`hover:text-amber-300 transition-colors cursor-pointer ${
                                          isFavTag ? 'text-amber-300 font-medium' : ''
                                        }`}
                                      >
                                        #{t}
                                      </button>
                                    </React.Fragment>
                                  );
                                })}
                              </span>
                            </div>
                          </td>

                          {/* BPM & Duration */}
                          <td className="py-3 px-3 align-middle hidden sm:table-cell text-right font-mono tabular-nums text-zinc-400 whitespace-nowrap">
                            <div>{track.bpm} BPM</div>
                            <div className="text-[11px] text-zinc-500">
                              {formatDuration(track.durationSec)} · {track.year}
                            </div>
                          </td>

                          {/* YouTube Link, Copy yt-dlp, Add to Playlist */}
                          <td className="py-3 px-3 align-middle text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <a
                                href={track.youtubeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open ${track.artist} - ${track.title} on YouTube`}
                                className="px-2.5 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1"
                              >
                                <span>YouTube</span>
                                <ExternalLink className="w-3 h-3 text-zinc-400" />
                              </a>

                              <button
                                type="button"
                                onClick={() => copyToClipboard(singleYtDlpCmd, `cmd-${track.id}`)}
                                aria-label={`Copy yt-dlp command for ${track.title}`}
                                className="px-2.5 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-amber-300 border border-zinc-800 rounded-lg text-xs font-mono transition-colors inline-flex items-center gap-1 cursor-pointer"
                              >
                                {copiedId === `cmd-${track.id}` ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Terminal className="w-3 h-3" />
                                    <span>yt-dlp</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => toggleTrackInPlaylist(track.id)}
                                aria-label={
                                  inPlaylist
                                    ? `Remove ${track.title} from ${activePlaylist?.name}`
                                    : `Add ${track.title} to ${activePlaylist?.name}`
                                }
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1 cursor-pointer ${
                                  inPlaylist
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold'
                                }`}
                              >
                                {inPlaylist ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    <span>Saved</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3" />
                                    <span>Playlist</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {rankedTracks.length === 0 && (
                  <div className="py-12 text-center space-y-3">
                    <Music2 className="w-8 h-8 text-zinc-600 mx-auto" />
                    <p className="text-sm text-zinc-300 font-medium">
                      No tracks match your current filter or search query.
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setCategoryFilter('All');
                        }}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-lg cursor-pointer"
                      >
                        Reset Filters
                      </button>
                      <button
                        type="button"
                        onClick={handleExternalCatalogSearch}
                        className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg cursor-pointer"
                      >
                        Search External Catalogs for &ldquo;{searchQuery}&rdquo;
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
            </>
          )}

          {/* SECTION 3: PLAYLIST CRATE VIEW (SAVED TRACKS LIST + BULK EDITOR) */}
          {activeSection === 'playlists' && activePlaylist && (
            <section className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                <div>
                  <h2 className="text-base font-display font-semibold text-zinc-100">
                    Saved Tracks Crate: {activePlaylist.name}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {activePlaylist.description} · {activePlaylistTracks.length} saved tracks queued for yt-dlp
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveSection('ytdlp')}
                    className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    Open in yt-dlp Generator
                  </button>
                </div>
              </div>

              {activePlaylistTracks.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <Disc3 className="w-8 h-8 text-zinc-600 mx-auto" />
                  <p className="text-sm text-zinc-300">This playlist is currently empty.</p>
                  <button
                    type="button"
                    onClick={() => setActiveSection('discover')}
                    className="px-4 py-2 bg-amber-400 text-zinc-950 font-semibold text-xs rounded-lg cursor-pointer"
                  >
                    Browse Taste Discovery to Add Tracks
                  </button>
                </div>
              ) : (
                <>
                  {/* Bulk Edit Toolbar for Saved Tracks */}
                  {renderBulkEditToolbar(activePlaylistTracks, 'Saved Tracks')}

                  <div className="divide-y divide-zinc-800/70">
                    {activePlaylistTracks.map((track, idx) => {
                      const isSelected = selectedTrackIds.includes(track.id);
                      return (
                        <div
                          key={track.id}
                          className={`py-3 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-800/30 rounded-lg transition-colors ${
                            isSelected
                              ? 'bg-amber-400/10 border border-amber-400/30'
                              : 'border border-transparent'
                          }`}
                        >
                          <div className="flex items-start sm:items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectTrack(track.id)}
                              aria-label={`Select ${track.artist} - ${track.title}`}
                              className="mt-1 sm:mt-0 rounded border-zinc-700 bg-zinc-900 text-amber-400 focus:ring-amber-400 cursor-pointer"
                            />
                            <span className="font-mono tabular-nums text-xs text-zinc-500 w-6">
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <div className="space-y-1">
                              <div className="text-xs font-semibold text-zinc-100">
                                {track.artist} — {track.title}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                                <button
                                  type="button"
                                  onClick={() => toggleFavoriteCategory(track.category)}
                                  className="px-2 py-0.5 rounded bg-zinc-800 text-amber-300 border border-zinc-700 font-medium hover:border-amber-400/50 transition-colors cursor-pointer"
                                >
                                  {track.category}
                                </button>
                                <div className="flex items-center gap-1 flex-wrap">
                                  {track.tags.map((t) => (
                                    <button
                                      key={t}
                                      type="button"
                                      onClick={() => toggleFavoriteTag(t)}
                                      className="px-1.5 py-0.5 rounded bg-zinc-950 text-zinc-300 hover:text-amber-300 border border-zinc-800 font-mono text-[11px] transition-colors cursor-pointer"
                                    >
                                      #{t}
                                    </button>
                                  ))}
                                </div>
                                <span className="text-zinc-500 font-mono">
                                  · {formatDuration(track.durationSec)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <a
                              href={track.youtubeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-md text-xs inline-flex items-center gap-1"
                            >
                              YouTube <ExternalLink className="w-3 h-3" />
                            </a>
                            <button
                              type="button"
                              onClick={() => toggleTrackInPlaylist(track.id)}
                              className="px-2.5 py-1 bg-zinc-950 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-300 border border-zinc-800 rounded-md text-xs cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          )}

          {/* SECTION 4: YT-DLP COMMAND & BATCH SCRIPT GENERATOR */}
          {activeSection === 'ytdlp' && (
            <section className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                <div>
                  <h2 className="text-base font-display font-semibold text-zinc-100">
                    yt-dlp Command & Batch Script Workbench
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Configure audio extraction flags, metadata embedding, and SponsorBlock music trimming for{' '}
                    <span className="text-amber-300 font-medium">{activePlaylist?.name}</span> ({activePlaylistTracks.length} tracks).
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedPlaylistCommand, 'main-ytdlp')}
                    className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {copiedId === 'main-ytdlp' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copied Script!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Full Command
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Configuration Controls Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="ytdlp-cookie-source" className="block text-xs font-medium text-zinc-300">
                    YouTube Cookie Authentication
                  </label>
                  <select
                    id="ytdlp-cookie-source"
                    value={ytDlpOptions.cookieSource || 'browser'}
                    onChange={(e) =>
                      setYtDlpOptions((prev) => ({
                        ...prev,
                        cookieSource: e.target.value as YtDlpCookieSource,
                      }))
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
                  >
                    <option value="browser">Browser Cookies (--cookies-from-browser)</option>
                    <option value="file">Netscape File (--cookies cookies.txt)</option>
                    <option value="none">No Cookies (Public Only)</option>
                  </select>
                </div>

                {ytDlpOptions.cookieSource === 'file' ? (
                  <div className="space-y-1.5">
                    <label htmlFor="ytdlp-cookie-file" className="block text-xs font-medium text-zinc-300">
                      Cookie File Path (--cookies)
                    </label>
                    <input
                      id="ytdlp-cookie-file"
                      type="text"
                      value={ytDlpOptions.cookieFilePath || './cookies.txt'}
                      onChange={(e) =>
                        setYtDlpOptions((prev) => ({ ...prev, cookieFilePath: e.target.value }))
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label htmlFor="ytdlp-cookie-browser" className="block text-xs font-medium text-zinc-300">
                      Cookie Browser (--cookies-from-browser)
                    </label>
                    <select
                      id="ytdlp-cookie-browser"
                      disabled={ytDlpOptions.cookieSource === 'none'}
                      value={ytDlpOptions.cookieBrowser || 'chrome'}
                      onChange={(e) =>
                        setYtDlpOptions((prev) => ({
                          ...prev,
                          cookieSource: 'browser',
                          cookieBrowser: e.target.value as YtDlpCookieBrowser,
                        }))
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 disabled:opacity-50 focus:outline-none focus:border-amber-400"
                    >
                      <option value="chrome">Chrome (chrome)</option>
                      <option value="firefox">Firefox (firefox)</option>
                      <option value="brave">Brave (brave)</option>
                      <option value="edge">Edge (edge)</option>
                      <option value="safari">Safari (safari)</option>
                      <option value="chromium">Chromium (chromium)</option>
                      <option value="vivaldi">Vivaldi (vivaldi)</option>
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="ytdlp-format" className="block text-xs font-medium text-zinc-300">
                    Target Audio / Video Format
                  </label>
                  <select
                    id="ytdlp-format"
                    value={ytDlpOptions.format}
                    onChange={(e) =>
                      setYtDlpOptions((prev) => ({
                        ...prev,
                        format: e.target.value as YtDlpOptions['format'],
                      }))
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
                  >
                    <option value="mp3">MP3 Audio (-x --audio-format mp3)</option>
                    <option value="flac">FLAC Lossless (-x --audio-format flac)</option>
                    <option value="opus">Opus High Efficiency (-x --audio-format opus)</option>
                    <option value="m4a">M4A / AAC (-x --audio-format m4a)</option>
                    <option value="mp4-video">MP4 Best Video + Audio</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="ytdlp-quality" className="block text-xs font-medium text-zinc-300">
                    Audio Quality (--audio-quality)
                  </label>
                  <select
                    id="ytdlp-quality"
                    value={ytDlpOptions.audioQuality}
                    onChange={(e) =>
                      setYtDlpOptions((prev) => ({
                        ...prev,
                        audioQuality: e.target.value as YtDlpOptions['audioQuality'],
                      }))
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
                  >
                    <option value="0">0 (Best VBR Quality)</option>
                    <option value="320K">320K CBR</option>
                    <option value="192K">192K Standard</option>
                    <option value="5">5 (Medium VBR)</option>
                  </select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="ytdlp-template" className="block text-xs font-medium text-zinc-300">
                    Output Filename Template (-o)
                  </label>
                  <input
                    id="ytdlp-template"
                    type="text"
                    value={ytDlpOptions.outputTemplate}
                    onChange={(e) =>
                      setYtDlpOptions((prev) => ({ ...prev, outputTemplate: e.target.value }))
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Checkboxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ytDlpOptions.embedMetadata}
                    onChange={(e) =>
                      setYtDlpOptions((p) => ({ ...p, embedMetadata: e.target.checked }))
                    }
                    className="rounded border-zinc-700 bg-zinc-950 text-amber-400 focus:ring-amber-400"
                  />
                  <span>Embed ID3 Metadata (--embed-metadata)</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ytDlpOptions.embedThumbnail}
                    onChange={(e) =>
                      setYtDlpOptions((p) => ({ ...p, embedThumbnail: e.target.checked }))
                    }
                    className="rounded border-zinc-700 bg-zinc-950 text-amber-400 focus:ring-amber-400"
                  />
                  <span>Embed Album Cover Art (--embed-thumbnail)</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ytDlpOptions.sponsorBlock}
                    onChange={(e) =>
                      setYtDlpOptions((p) => ({ ...p, sponsorBlock: e.target.checked }))
                    }
                    className="rounded border-zinc-700 bg-zinc-950 text-amber-400 focus:ring-amber-400"
                  />
                  <span>Trim Non-Music Intros (--sponsorblock-remove)</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ytDlpOptions.useSearchFallback}
                    onChange={(e) =>
                      setYtDlpOptions((p) => ({ ...p, useSearchFallback: e.target.checked }))
                    }
                    className="rounded border-zinc-700 bg-zinc-950 text-amber-400 focus:ring-amber-400"
                  />
                  <span>Force ytsearch1:&quot;Artist - Title&quot; Queries</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ytDlpOptions.batchFileMode}
                    onChange={(e) =>
                      setYtDlpOptions((p) => ({ ...p, batchFileMode: e.target.checked }))
                    }
                    className="rounded border-zinc-700 bg-zinc-950 text-amber-400 focus:ring-amber-400"
                  />
                  <span>Generate Multi-Line Shell Script (.sh)</span>
                </label>
              </div>

              {/* Output Terminal Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-mono">Generated Terminal Output</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        downloadFile(
                          `download-${activePlaylist.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.sh`,
                          generatedPlaylistCommand
                        )
                      }
                      className="text-amber-300 hover:underline cursor-pointer"
                    >
                      Download .sh Script
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() =>
                        downloadFile(
                          `${activePlaylist.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.m3u8`,
                          generateM3u8Playlist(activePlaylist.name, activePlaylistTracks)
                        )
                      }
                      className="text-amber-300 hover:underline cursor-pointer"
                    >
                      Download .m3u8 Playlist
                    </button>
                  </div>
                </div>
                <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs font-mono text-amber-200/95 overflow-x-auto leading-relaxed">
                  {generatedPlaylistCommand}
                </pre>
              </div>
            </section>
          )}

          {/* SECTION 5: GITHUB REMOTE & PAGES CI/CD AUTO-DEPLOY */}
          {activeSection === 'deploy' && (
            <GitHubPagesDeployer
              tasteProfileSnapshot={{
                favoriteArtists,
                favoriteTags,
                favoriteCategories,
                playlists,
                feedText,
              }}
              onImportTasteBackup={(parsed) => {
                hydrateFavorites({
                  favoriteArtists: Array.isArray(parsed.favoriteArtists)
                    ? (parsed.favoriteArtists as string[])
                    : undefined,
                  favoriteTags: Array.isArray(parsed.favoriteTags)
                    ? (parsed.favoriteTags as string[])
                    : undefined,
                  favoriteCategories: Array.isArray(parsed.favoriteCategories)
                    ? (parsed.favoriteCategories as string[])
                    : undefined,
                });
                if (Array.isArray(parsed.playlists) && parsed.playlists.length > 0) {
                  setPlaylists(parsed.playlists as Playlist[]);
                  setActivePlaylistId((parsed.playlists[0] as Playlist).id);
                }
                if (typeof parsed.feedText === 'string') {
                  setFeedText(parsed.feedText);
                  setFeedTracks(parseYouTubeFeedInput(parsed.feedText));
                }
              }}
            />
          )}
        </div>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-zinc-900 py-4 px-6 text-center text-xs text-zinc-500">
        CrateDig YT · Client-side Music Taste & yt-dlp Playlist Workbench · Ready for GitHub Pages
      </footer>
    </div>
  );
}
