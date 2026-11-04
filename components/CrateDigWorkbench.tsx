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
  Download,
  RefreshCw,
  Music2,
  Play,
  Square,
  FileCode2,
  Tag,
  Layers,
  CheckSquare,
  ChevronRight,
  ChevronLeft,
  BarChart3,
  Compass,
  Settings,
  ArrowLeft,
  Video,
  Headphones,
} from 'lucide-react';
import {
  MusicTrack,
  Playlist,
  YtDlpOptions,
  YtDlpCookieSource,
  YtDlpCookieBrowser,
  YtDlpVideoResolution,
  YtDlpGuiPresetId,
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
  YT_DLP_GUI_PRESETS,
  applyYtDlpGuiPreset,
  summarizeYtDlpActiveFlags,
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
import PlaylistExporter from '@/components/PlaylistExporter';
import GeminiCrateChatbot from '@/components/GeminiCrateChatbot';
import TasteRegressionLab from '@/components/TasteRegressionLab';
import {
  generatePlsPlaylist,
  buildPlaylistExportPayload,
} from '@/lib/playlist-exporter';

const STORAGE_KEY = 'cratedig_yt_state_v2';

export type PipelineStepId = 'cookies' | 'feed' | 'search' | 'assistant' | 'export';

interface PipelineStepMeta {
  id: PipelineStepId;
  stepNumber: string;
  title: string;
  shortTitle: string;
  guideTitle: string;
  guideDescription: string;
  whatYouNeed: string;
  nextLabel?: string;
}

const PIPELINE_STEPS: PipelineStepMeta[] = [
  {
    id: 'cookies',
    stepNumber: '01',
    title: '1. YouTube & yt-dlp Setup',
    shortTitle: 'yt-dlp Setup',
    guideTitle: 'Step 01 · Zsh/Bash-Safe yt-dlp Commands & Direct YouTube Import',
    guideDescription:
      'Pick your browser to copy a zsh-safe yt-dlp command (or direct MP3 download command), or paste YouTube links / song titles directly without needing a .txt file.',
    whatYouNeed: 'Input: Pick Browser or Paste YouTube Links / Songs Directly',
    nextLabel: 'Next: Add & Filter Songs',
  },
  {
    id: 'feed',
    stepNumber: '02',
    title: '2. Add & Filter Songs',
    shortTitle: 'Add & Filter',
    guideTitle: 'Step 02 · Add Your Songs or Filter Pasted YouTube Lines',
    guideDescription:
      'Add individual songs with your own custom #tags, or paste raw yt-dlp output and run filterMusicTracks to strip out podcasts, news, and updates.',
    whatYouNeed: 'Input: Add Artist - Song + Your Own #Tags (Zero Default Tags)',
    nextLabel: 'Next: Search Music & Taste DNA',
  },
  {
    id: 'search',
    stepNumber: '03',
    title: '3. Search Music & DNA',
    shortTitle: 'Search & DNA',
    guideTitle: 'Step 03 · Inspect Songs, Add Custom #Tags & Build Taste DNA',
    guideDescription:
      'Search any Artist - Song or YouTube URL, run Google Search Grounding, and add your own custom Favorite Artists, #Tags, and Categories.',
    whatYouNeed: 'Input: Only User-Added Artists, #Tags & Categories',
    nextLabel: 'Next: Regression & Prompt Lab',
  },
  {
    id: 'assistant',
    stepNumber: '04',
    title: '4. Regression & Prompt Lab',
    shortTitle: 'Regression AI',
    guideTitle: 'Step 04 · Taste Regression Training & Gemini Prompt Engineering System',
    guideDescription:
      'Feed sample songs with target ratings (y = 0..10) and your own #tags to fit a Ridge Regression model (β weights) and engineer custom Gemini YouTube discovery prompts.',
    whatYouNeed: 'System: OLS/Ridge Taste Regression + Custom Gemini YouTube Prompts',
    nextLabel: 'Next: Ranked Crate & Export',
  },
  {
    id: 'export',
    stepNumber: '05',
    title: '5. Crate & Export',
    shortTitle: 'Crate & Export',
    guideTitle: 'Step 05 · Ranked Music Crate, Bulk Tag Editor & Playlist Export',
    guideDescription:
      'Browse your Taste-Ranked recommendations, bulk-edit tags on saved tracks, view Taste Analytics charts, and export .json metadata, .m3u, .pls, or yt-dlp .sh scripts.',
    whatYouNeed: 'Output: Downloadable .json, .m3u, .pls, or yt-dlp .sh batch script',
  },
];

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
  // Top-level mode: 'pipeline' (the 5-step music workflow) vs 'settings' (GitHub CI/CD & App Settings)
  const [activeView, setActiveView] = useState<'pipeline' | 'settings'>('pipeline');

  // Active Pipeline Stage (Steps 01 -> 05)
  const [activeStep, setActiveStep] = useState<PipelineStepId>('cookies');

  // Sub-tabs inside Step 04 (Regression Prompt Lab vs Conversational Chat)
  const [aiLabMode, setAiLabMode] = useState<'regression' | 'chat'>('regression');

  // Sub-tabs inside Step 05 (Crate & Export) so only one clean view is displayed at a time
  const [exportSubTab, setExportSubTab] = useState<'ranked' | 'saved' | 'exporter' | 'ytdlp-gui' | 'analytics'>('ranked');

  // Active preset tracker for the GUI yt-dlp Command Builder
  const [activeYtDlpPreset, setActiveYtDlpPreset] = useState<YtDlpGuiPresetId>('audio-best-mp3');
  const [guiCommandScope, setGuiCommandScope] = useState<'crate' | 'single' | 'custom'>('single');

  // YouTube Feed Input State (Starts clean — no pre-filled default feed suggestions)
  const [feedText, setFeedText] = useState<string>('');
  const [feedTracks, setFeedTracks] = useState<MusicTrack[]>([]);
  const [customCatalogTracks, setCustomCatalogTracks] = useState<MusicTrack[]>([]);

  // Quick manual song adder state in Step 02
  const [manualArtist, setManualArtist] = useState<string>('');
  const [manualTitle, setManualTitle] = useState<string>('');
  const [manualUrl, setManualUrl] = useState<string>('');
  const [manualTags, setManualTags] = useState<string>('');

  // Favorites State via React Context
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

  // yt-dlp Configuration State
  const [ytDlpOptions, setYtDlpOptions] = useState<YtDlpOptions>({
    format: 'mp3',
    audioQuality: '0',
    videoResolution: '1080',
    embedThumbnail: true,
    embedMetadata: true,
    addSubtitles: false,
    sponsorBlock: true,
    outputTemplate: '%(title)s.%(ext)s',
    useSearchFallback: false,
    batchFileMode: true,
    cookieSource: 'browser',
    cookieBrowser: 'firefox',
    cookieProfile: '',
    cookieFilePath: './cookies.txt',
    musicOnlyFilter: true,
    maxDurationSec: 600,
    customTargetUrl: '',
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

  // Load persisted state from sessionStorage / localStorage
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

  // Save state on changes
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

  // Combine Curated Catalog + Feed Tracks + External API Tracks + Bulk Overrides
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

  const currentStepIndex = PIPELINE_STEPS.findIndex((s) => s.id === activeStep);
  const currentStepMeta = PIPELINE_STEPS[currentStepIndex] || PIPELINE_STEPS[0];
  const prevStepMeta = currentStepIndex > 0 ? PIPELINE_STEPS[currentStepIndex - 1] : null;
  const nextStepMeta =
    currentStepIndex < PIPELINE_STEPS.length - 1 ? PIPELINE_STEPS[currentStepIndex + 1] : null;

  // Handlers
  const handleAnalyzeFeed = () => {
    const filtered = filterMusicTracks(feedText);
    if (filtered.filteredText) {
      setFeedText(filtered.filteredText);
    }
    setFeedTracks(filtered.tracks);
    setActiveStep('search');
  };

  const handleCleanFeedTextWithFilter = () => {
    const filtered = filterMusicTracks(feedText);
    setFeedText(filtered.filteredText);
    setFeedTracks(filtered.tracks);
  };

  const handleAddManualSong = (e: React.FormEvent) => {
    e.preventDefault();
    const artist = manualArtist.trim();
    const title = manualTitle.trim();
    if (!artist || !title) return;

    const userTags = normalizeBulkTags(manualTags);
    const bracketPart = userTags.length > 0 ? ` [${userTags.join(' / ')}]` : '';
    const urlPart = manualUrl.trim() ? `${manualUrl.trim()} - ` : '';
    const line = `${urlPart}${artist} - ${title}${bracketPart}`;

    const nextText = feedText.trim() ? `${feedText.trim()}\n${line}` : line;
    setFeedText(nextText);
    const filtered = filterMusicTracks(nextText);
    setFeedTracks(filtered.tracks);

    userTags.forEach((t) => addFavoriteSignal('tag', t));
    setManualArtist('');
    setManualTitle('');
    setManualUrl('');
    setManualTags('');
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
        setExternalStatusMsg(`Added ${results.length} tracks from ${externalSource === 'itunes' ? 'iTunes' : 'MusicBrainz'}.`);
      } else {
        setExternalStatusMsg(`No external tracks found for "${q}".`);
      }
    } catch {
      setExternalStatusMsg(`Showing local taste-matched catalog.`);
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

  const addTrackToPlaylistIfAbsent = (trackId: string, playlistId = activePlaylistId) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        if (pl.trackIds.includes(trackId)) return pl;
        return {
          ...pl,
          trackIds: [...pl.trackIds, trackId],
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
            <span className="inline-flex items-center gap-1.5 text-amber-300 text-xs font-semibold">
              <Layers className="w-3.5 h-3.5" />
              Bulk Edit {scopeLabel}
            </span>
            <span className="text-xs font-mono text-zinc-400">
              · {selectedInScope.length} of {scopeIds.length} selected
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

            {exportSubTab === 'saved' && selectedInScope.length > 0 && (
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
              placeholder="Type your own tags (comma-separated, e.g. breakbeat, vinyl-rip)..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
            />
          </div>

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

  /**
   * Renders the interactive GUI yt-dlp Command & Quality Builder section.
   * Allows users to visually construct custom yt-dlp CLI arguments using presets for
   * Audio-Only vs Video, format selectors, quality/bitrate/resolution toggles, and post-processing flags.
   */
  const renderYtDlpGuiBuilderSection = () => {
    const isVideoMode =
      ytDlpOptions.format === 'mp4-video' || ytDlpOptions.format === 'mkv-video';
    const activeFlags = summarizeYtDlpActiveFlags(ytDlpOptions);

    const previewTargetTracks =
      guiCommandScope === 'single'
        ? activePlaylistTracks.slice(0, 1).length > 0
          ? activePlaylistTracks.slice(0, 1)
          : CURATED_CATALOG.slice(0, 1)
        : activePlaylistTracks.length > 0
        ? activePlaylistTracks
        : CURATED_CATALOG.slice(0, 2);

    const effectiveOptionsForPreview: YtDlpOptions = {
      ...ytDlpOptions,
      batchFileMode: guiCommandScope === 'crate' ? ytDlpOptions.batchFileMode : false,
      customTargetUrl:
        guiCommandScope === 'custom' ? ytDlpOptions.customTargetUrl : '',
    };

    const constructedCliCommand = generateYtDlpCommand(
      previewTargetTracks,
      effectiveOptionsForPreview
    );

    const handleSelectPreset = (presetId: YtDlpGuiPresetId) => {
      setActiveYtDlpPreset(presetId);
      setYtDlpOptions((prev) => applyYtDlpGuiPreset(prev, presetId));
    };

    const handleSwitchMediaMode = (mode: 'audio' | 'video') => {
      if (mode === 'video') {
        setActiveYtDlpPreset('video-1080p-mp4');
        setYtDlpOptions((prev) => ({
          ...prev,
          format:
            prev.format === 'mp4-video' || prev.format === 'mkv-video'
              ? prev.format
              : 'mp4-video',
          videoResolution: prev.videoResolution || '1080',
        }));
      } else {
        setActiveYtDlpPreset('audio-best-mp3');
        setYtDlpOptions((prev) => ({
          ...prev,
          format:
            prev.format === 'mp4-video' || prev.format === 'mkv-video'
              ? 'mp3'
              : prev.format,
        }));
      }
    };

    const audioPresets = YT_DLP_GUI_PRESETS.filter((p) => p.category === 'audio');
    const videoPresets = YT_DLP_GUI_PRESETS.filter((p) => p.category === 'video');

    return (
      <section
        aria-label="GUI yt-dlp Command & Quality Builder"
        className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 space-y-5"
      >
        {/* Section Header + Audio-Only vs Video Mode Switcher */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-amber-400/15 text-amber-300 border border-amber-400/30 rounded">
                GUI YT-DLP COMMAND BUILDER
              </span>
              <span className="text-xs font-mono text-emerald-400">
                No Raw Terminal Typing Required · Zsh &amp; Bash Safe
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-display font-bold text-zinc-100">
              Visual yt-dlp Command Constructor — Audio-Only vs Video Presets &amp; Quality Toggles
            </h2>
            <p className="text-xs text-zinc-400">
              Click a preset or toggle audio/video formats, bitrates, resolutions, and metadata flags below to build your exact <code className="font-mono text-zinc-300">yt-dlp</code> command.
            </p>
          </div>

          {/* Primary Audio-Only vs Video Mode Toggle */}
          <div
            role="group"
            aria-label="Media Extraction Mode"
            className="inline-flex items-center p-1 bg-zinc-950 border border-zinc-800 rounded-xl shrink-0 self-start lg:self-auto"
          >
            <button
              type="button"
              onClick={() => handleSwitchMediaMode('audio')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                !isVideoMode
                  ? 'bg-amber-400 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>Audio-Only Mode (-x)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMediaMode('video')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                isVideoMode
                  ? 'bg-amber-400 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Video + Audio Mode (-f)</span>
            </button>
          </div>
        </div>

        {/* Row 1: Quick Presets for Audio-Only vs Video */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Audio-Only Presets Column */}
          <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Headphones className="w-3.5 h-3.5" />
                Audio-Only Presets
              </span>
              <span className="text-[11px] font-mono text-zinc-500">Extracts pure audio stream</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {audioPresets.map((preset) => {
                const isSelected = activeYtDlpPreset === preset.id && !isVideoMode;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer flex flex-col justify-between gap-1.5 ${
                      isSelected
                        ? 'bg-amber-400/15 border-amber-400 text-zinc-100'
                        : 'bg-zinc-900/70 hover:bg-zinc-900 border-zinc-800 text-zinc-300'
                    }`}
                  >
                    <div className="text-xs font-semibold leading-snug text-zinc-100">
                      {preset.label.replace('Audio Only · ', '')}
                    </div>
                    <div className="text-[10px] font-mono text-amber-300/90 truncate">
                      {preset.badge}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Video + Audio Presets Column */}
          <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5" />
                Video + Audio Presets
              </span>
              <span className="text-[11px] font-mono text-zinc-500">Merges video + audio streams</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {videoPresets.map((preset) => {
                const isSelected = activeYtDlpPreset === preset.id && isVideoMode;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer flex flex-col justify-between gap-1.5 ${
                      isSelected
                        ? 'bg-emerald-400/15 border-emerald-400 text-zinc-100'
                        : 'bg-zinc-900/70 hover:bg-zinc-900 border-zinc-800 text-zinc-300'
                    }`}
                  >
                    <div className="text-xs font-semibold leading-snug text-zinc-100">
                      {preset.label.replace('Video + Audio · ', '')}
                    </div>
                    <div className="text-[10px] font-mono text-emerald-300/90 truncate">
                      {preset.badge}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Row 2: Format & Quality Toggles + Post-Processing GUI Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left 7 cols: Container Format & Quality / Bitrate / Resolution Toggles */}
          <div className="lg:col-span-7 bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-4">
            {!isVideoMode ? (
              <>
                {/* Audio Container Format Selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-200">
                      1. Audio Container Format (<code className="font-mono text-amber-300">--audio-format</code>)
                    </label>
                    <span className="text-[11px] font-mono text-zinc-400">
                      Active: -x --audio-format {ytDlpOptions.format}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    {(
                      [
                        { id: 'mp3', label: 'MP3', sub: 'Universal' },
                        { id: 'flac', label: 'FLAC', sub: 'Lossless' },
                        { id: 'opus', label: 'Opus', sub: 'High Efficiency' },
                        { id: 'm4a', label: 'M4A / AAC', sub: 'Apple / DJ' },
                        { id: 'wav', label: 'WAV', sub: 'Uncompressed' },
                      ] as const
                    ).map((fmt) => (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() =>
                          setYtDlpOptions((prev) => ({ ...prev, format: fmt.id }))
                        }
                        className={`px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                          ytDlpOptions.format === fmt.id
                            ? 'bg-amber-400 text-zinc-950 border-amber-400 font-semibold'
                            : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                        }`}
                      >
                        <div className="text-xs">{fmt.label}</div>
                        <div
                          className={`text-[10px] font-mono ${
                            ytDlpOptions.format === fmt.id ? 'text-zinc-900' : 'text-zinc-500'
                          }`}
                        >
                          {fmt.sub}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Audio Quality / Bitrate Toggles */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-200">
                      2. Audio Quality / Bitrate Toggle (<code className="font-mono text-amber-300">--audio-quality</code>)
                    </label>
                    <span className="text-[11px] font-mono text-zinc-400">
                      --audio-quality {ytDlpOptions.audioQuality}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: '0', label: 'Best VBR (0)', desc: 'Max V0 quality' },
                        { id: '320K', label: '320K CBR', desc: 'Club / DJ standard' },
                        { id: '256K', label: '256K Bitrate', desc: 'High quality' },
                        { id: '192K', label: '192K Bitrate', desc: 'Balanced size' },
                        { id: '128K', label: '128K Compact', desc: 'Fast mobile' },
                        { id: '2', label: 'High VBR (2)', desc: ' ~190-210 kbps' },
                        { id: '5', label: 'Medium VBR (5)', desc: '~130 kbps' },
                      ] as const
                    ).map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() =>
                          setYtDlpOptions((prev) => ({ ...prev, audioQuality: q.id }))
                        }
                        className={`px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                          ytDlpOptions.audioQuality === q.id
                            ? 'bg-amber-400 text-zinc-950 border-amber-400 font-semibold'
                            : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                        }`}
                      >
                        <div className="text-xs">{q.label}</div>
                        <div
                          className={`text-[10px] font-mono ${
                            ytDlpOptions.audioQuality === q.id ? 'text-zinc-900' : 'text-zinc-500'
                          }`}
                        >
                          {q.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Video Container Format Selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-200">
                      1. Video Container Format (<code className="font-mono text-emerald-300">--merge-output-format</code>)
                    </label>
                    <span className="text-[11px] font-mono text-zinc-400">
                      Active: {ytDlpOptions.format === 'mkv-video' ? 'MKV Container' : 'MP4 Container'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(
                      [
                        {
                          id: 'mp4-video',
                          label: 'MP4 Video + M4A Audio',
                          sub: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]',
                        },
                        {
                          id: 'mkv-video',
                          label: 'MKV Best Stream Merge',
                          sub: 'bestvideo+bestaudio --merge-output-format mkv',
                        },
                      ] as const
                    ).map((vfmt) => (
                      <button
                        key={vfmt.id}
                        type="button"
                        onClick={() =>
                          setYtDlpOptions((prev) => ({ ...prev, format: vfmt.id }))
                        }
                        className={`px-3 py-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                          ytDlpOptions.format === vfmt.id
                            ? 'bg-emerald-400 text-zinc-950 border-emerald-400 font-semibold'
                            : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                        }`}
                      >
                        <div className="text-xs">{vfmt.label}</div>
                        <div
                          className={`text-[10px] font-mono ${
                            ytDlpOptions.format === vfmt.id ? 'text-zinc-900' : 'text-zinc-500'
                          }`}
                        >
                          {vfmt.sub}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Video Resolution / Quality Toggle Buttons */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-200">
                      2. Video Resolution &amp; Quality Ceiling (<code className="font-mono text-emerald-300">-f height&lt;=N</code>)
                    </label>
                    <span className="text-[11px] font-mono text-zinc-400">
                      Resolution: {ytDlpOptions.videoResolution || 'best'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'best', label: 'Best Available', desc: 'Unrestricted Max' },
                        { id: '2160', label: '4K Ultra HD', desc: 'height<=2160' },
                        { id: '1440', label: '1440p QHD', desc: 'height<=1440' },
                        { id: '1080', label: '1080p Full HD', desc: 'height<=1080' },
                        { id: '720', label: '720p HD', desc: 'height<=720' },
                        { id: '480', label: '480p Compact', desc: 'height<=480' },
                      ] as { id: YtDlpVideoResolution; label: string; desc: string }[]
                    ).map((res) => {
                      const currentRes = ytDlpOptions.videoResolution || 'best';
                      const isSelected = currentRes === res.id;
                      return (
                        <button
                          key={res.id}
                          type="button"
                          onClick={() =>
                            setYtDlpOptions((prev) => ({ ...prev, videoResolution: res.id }))
                          }
                          className={`px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-400 text-zinc-950 border-emerald-400 font-semibold'
                              : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                          }`}
                        >
                          <div className="text-xs">{res.label}</div>
                          <div
                            className={`text-[10px] font-mono ${
                              isSelected ? 'text-zinc-900' : 'text-zinc-500'
                            }`}
                          >
                            {res.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Output Filename Template Selector Pills */}
            <div className="space-y-2 pt-2 border-t border-zinc-800/80">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label
                  htmlFor="gui-ytdlp-output-template"
                  className="text-xs font-semibold text-zinc-200"
                >
                  3. Output Filename Pattern (<code className="font-mono text-amber-300">-o</code>)
                </label>
                <div className="flex items-center gap-1 flex-wrap">
                  {(
                    [
                      { label: 'Title Only', tpl: '%(title)s.%(ext)s' },
                      { label: 'Artist - Title', tpl: '%(artist,uploader)s - %(title)s.%(ext)s' },
                      { label: '# - Title', tpl: '%(playlist_index)s - %(title)s.%(ext)s' },
                      { label: 'By Channel Folder', tpl: 'crates/%(uploader)s/%(title)s.%(ext)s' },
                    ] as const
                  ).map((presetTpl) => (
                    <button
                      key={presetTpl.label}
                      type="button"
                      onClick={() =>
                        setYtDlpOptions((prev) => ({ ...prev, outputTemplate: presetTpl.tpl }))
                      }
                      className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                        ytDlpOptions.outputTemplate === presetTpl.tpl
                          ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border-zinc-800'
                      }`}
                    >
                      {presetTpl.label}
                    </button>
                  ))}
                </div>
              </div>
              <input
                id="gui-ytdlp-output-template"
                type="text"
                value={ytDlpOptions.outputTemplate}
                onChange={(e) =>
                  setYtDlpOptions((prev) => ({ ...prev, outputTemplate: e.target.value }))
                }
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Right 5 cols: Post-Processing Toggles & Target Scope */}
          <div className="lg:col-span-5 bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="text-xs font-semibold text-zinc-200">
                4. Post-Processing, Metadata &amp; SponsorBlock Toggles
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ytDlpOptions.embedMetadata}
                    onChange={(e) =>
                      setYtDlpOptions((prev) => ({ ...prev, embedMetadata: e.target.checked }))
                    }
                    className="mt-0.5 rounded border-zinc-700 bg-zinc-950 text-amber-400 focus:ring-amber-400"
                  />
                  <div>
                    <div className="text-xs font-medium text-zinc-200">Embed Metadata</div>
                    <div className="text-[10px] font-mono text-zinc-500">--embed-metadata</div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-2 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 select-none ${
                    isVideoMode ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={isVideoMode}
                    checked={ytDlpOptions.embedThumbnail && !isVideoMode}
                    onChange={(e) =>
                      setYtDlpOptions((prev) => ({ ...prev, embedThumbnail: e.target.checked }))
                    }
                    className="mt-0.5 rounded border-zinc-700 bg-zinc-950 text-amber-400 focus:ring-amber-400"
                  />
                  <div>
                    <div className="text-xs font-medium text-zinc-200">Embed Cover Art</div>
                    <div className="text-[10px] font-mono text-zinc-500">--embed-thumbnail</div>
                  </div>
                </label>

                <label className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ytDlpOptions.sponsorBlock}
                    onChange={(e) =>
                      setYtDlpOptions((prev) => ({ ...prev, sponsorBlock: e.target.checked }))
                    }
                    className="mt-0.5 rounded border-zinc-700 bg-zinc-950 text-amber-400 focus:ring-amber-400"
                  />
                  <div>
                    <div className="text-xs font-medium text-zinc-200">SponsorBlock Trim</div>
                    <div className="text-[10px] font-mono text-zinc-500">Skip intro/outro/non-music</div>
                  </div>
                </label>

                <label className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ytDlpOptions.addSubtitles}
                    onChange={(e) =>
                      setYtDlpOptions((prev) => ({ ...prev, addSubtitles: e.target.checked }))
                    }
                    className="mt-0.5 rounded border-zinc-700 bg-zinc-950 text-amber-400 focus:ring-amber-400"
                  />
                  <div>
                    <div className="text-xs font-medium text-zinc-200">Auto Subtitles</div>
                    <div className="text-[10px] font-mono text-zinc-500">--write-auto-subs</div>
                  </div>
                </label>

                <label className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ytDlpOptions.useSearchFallback}
                    onChange={(e) =>
                      setYtDlpOptions((prev) => ({ ...prev, useSearchFallback: e.target.checked }))
                    }
                    className="mt-0.5 rounded border-zinc-700 bg-zinc-950 text-amber-400 focus:ring-amber-400"
                  />
                  <div>
                    <div className="text-xs font-medium text-zinc-200">ytsearch1 Fallback</div>
                    <div className="text-[10px] font-mono text-zinc-500">Search by Artist - Title</div>
                  </div>
                </label>

                <label className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ytDlpOptions.batchFileMode}
                    onChange={(e) =>
                      setYtDlpOptions((prev) => ({ ...prev, batchFileMode: e.target.checked }))
                    }
                    className="mt-0.5 rounded border-zinc-700 bg-zinc-950 text-amber-400 focus:ring-amber-400"
                  />
                  <div>
                    <div className="text-xs font-medium text-zinc-200">Bash Script Header</div>
                    <div className="text-[10px] font-mono text-zinc-500">#!/usr/bin/env bash</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Target Scope Selector (Single Track vs Full Crate vs Custom URL) */}
            <div className="space-y-2 pt-2 border-t border-zinc-800/80">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">5. Command Target</span>
                <div className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-[11px]">
                  {(
                    [
                      { id: 'single', label: 'Single Track' },
                      { id: 'crate', label: `Active Crate (${activePlaylistTracks.length})` },
                      { id: 'custom', label: 'Custom URL / Song' },
                    ] as const
                  ).map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => setGuiCommandScope(sc.id)}
                      className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                        guiCommandScope === sc.id
                          ? 'bg-amber-400 text-zinc-950 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
              </div>

              {guiCommandScope === 'custom' && (
                <input
                  type="text"
                  aria-label="Custom target YouTube URL or song query"
                  value={ytDlpOptions.customTargetUrl || ''}
                  onChange={(e) =>
                    setYtDlpOptions((prev) => ({ ...prev, customTargetUrl: e.target.value }))
                  }
                  placeholder="Paste https://www.youtube.com/watch?v=... or Artist - Song"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-400"
                />
              )}
            </div>
          </div>
        </div>

        {/* Row 3: Visual CLI Argument Chips + Live Command Output & Actions */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-mono text-zinc-400 mr-1">
                Constructed Flags:
              </span>
              {activeFlags.map((chip) => (
                <span
                  key={chip.flag}
                  className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-amber-300"
                  title={chip.label}
                >
                  {chip.flag}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => copyToClipboard(constructedCliCommand, 'gui-ytdlp-cmd')}
                className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                {copiedId === 'gui-ytdlp-cmd' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied yt-dlp Command!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Constructed Command</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  downloadFile(
                    `cratedig-${isVideoMode ? 'video' : ytDlpOptions.format}-download.sh`,
                    constructedCliCommand,
                    'text/x-shellscript;charset=utf-8'
                  )
                }
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 font-medium text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>Download .sh</span>
              </button>
            </div>
          </div>

          <pre
            aria-label="Constructed yt-dlp CLI command preview"
            className="p-3 bg-zinc-900/90 border border-zinc-800/90 rounded-lg text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed select-all"
          >
            {constructedCliCommand}
          </pre>
        </div>
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Minimal Top Bar: Zone 1 (Brand) — Zone 2 (5 Pipeline Steps) — Zone 3 (Settings & Export) */}
      <header className="sticky top-0 z-30 bg-zinc-950/95 backdrop-blur border-b border-zinc-800/80 px-6 py-3.5 flex items-center justify-between gap-6">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('pipeline');
            setActiveStep('cookies');
          }}
          className="text-lg font-display font-bold tracking-tight text-zinc-100 whitespace-nowrap shrink-0"
        >
          CrateDig YT
        </a>

        <nav
          className="hidden lg:flex items-center gap-6 text-sm font-medium text-zinc-400"
          aria-label="Pipeline Navigation"
        >
          {PIPELINE_STEPS.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={() => {
                setActiveView('pipeline');
                setActiveStep(step.id);
              }}
              className={`hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
                activeView === 'pipeline' && activeStep === step.id
                  ? 'text-amber-400 border-amber-400'
                  : 'border-transparent'
              }`}
            >
              {step.title}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Dedicated Settings & GitHub CI/CD View Toggle (Outside Pipeline) */}
          <button
            type="button"
            onClick={() =>
              setActiveView((prev) => (prev === 'settings' ? 'pipeline' : 'settings'))
            }
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
              activeView === 'settings'
                ? 'bg-amber-400 text-zinc-950 border-amber-400 font-semibold'
                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-800'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings &amp; GitHub CI/CD</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveView('pipeline');
              setActiveStep('export');
              setExportSubTab('exporter');
            }}
            className="px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Crate ({activePlaylistTracks.length})</span>
          </button>
        </div>
      </header>

      {/* Main Centered Container */}
      <main className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* =====================================================================
            SETTINGS VIEW (GitHub Pages CI/CD, yt-dlp Defaults & Taste DNA Backup)
            Completely outside the 5-step music pipeline!
           ===================================================================== */}
        {activeView === 'settings' ? (
          <div className="space-y-6">
            <div className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-mono text-amber-400">
                  SETTINGS &amp; DEPLOYMENT
                </div>
                <h1 className="text-lg sm:text-xl font-display font-bold text-zinc-100">
                  GitHub Pages CI/CD, Default yt-dlp Flags &amp; Taste Backup
                </h1>
                <p className="text-xs sm:text-sm text-zinc-400">
                  Configure automatic GitHub Pages deployment, default audio extraction format, or reset your Taste DNA.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveView('pipeline')}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Music Pipeline</span>
              </button>
            </div>

            {/* Default yt-dlp Audio/Video & Cookie Settings Card + Full GUI Builder */}
            {renderYtDlpGuiBuilderSection()}

            {/* GitHub Pages CI/CD Deployer */}
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
          </div>
        ) : (
          /* =====================================================================
             MAIN 5-STEP MUSIC PIPELINE VIEW
             Each data requirement and search stage is a separate step with its own guide
             ===================================================================== */
          <>
            {/* Interactive 5-Stage Pipeline Stepper & Step Guidance Card */}
            <section
              aria-label="Guided Pipeline Progress"
              className="bg-zinc-900/60 border border-zinc-800/90 rounded-xl p-5 space-y-4"
            >
              {/* Stepper Tabs */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {PIPELINE_STEPS.map((step, idx) => {
                  const isCurrent = step.id === activeStep;
                  const isCompleted = idx < currentStepIndex;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setActiveStep(step.id)}
                      className={`text-left px-3.5 py-2.5 rounded-lg border transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                        isCurrent
                          ? 'bg-amber-400 text-zinc-950 border-amber-400 font-semibold'
                          : isCompleted
                          ? 'bg-zinc-950/90 text-zinc-200 border-zinc-800 hover:border-zinc-700'
                          : 'bg-zinc-950/50 text-zinc-400 border-zinc-800/70 hover:text-zinc-200'
                      }`}
                    >
                      <div className="min-w-0">
                        <div
                          className={`text-[10px] font-mono ${
                            isCurrent ? 'text-zinc-900' : 'text-amber-400/90'
                          }`}
                        >
                          STEP {step.stepNumber}
                        </div>
                        <div className="text-xs truncate">{step.shortTitle}</div>
                      </div>
                      {isCompleted && !isCurrent && (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Current Step Guidance & Next/Prev Navigation */}
              <div className="pt-3 border-t border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1 max-w-2xl">
                  <div className="text-xs font-mono text-amber-300">
                    {currentStepMeta.whatYouNeed}
                  </div>
                  <h1 className="text-base sm:text-lg font-display font-bold text-zinc-100 tracking-tight">
                    {currentStepMeta.guideTitle}
                  </h1>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    {currentStepMeta.guideDescription}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {prevStepMeta && (
                    <button
                      type="button"
                      onClick={() => setActiveStep(prevStepMeta.id)}
                      className="px-3 py-2 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Prev: {prevStepMeta.shortTitle}</span>
                    </button>
                  )}

                  {nextStepMeta && (
                    <button
                      type="button"
                      onClick={() => setActiveStep(nextStepMeta.id)}
                      className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <span>{currentStepMeta.nextLabel || `Next: ${nextStepMeta.shortTitle}`}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* =================================================================
                STEP 01: CONNECT COOKIES & GUI YT-DLP BUILDER (activeStep === 'cookies')
               ================================================================= */}
            {activeStep === 'cookies' && (
              <div className="space-y-6">
                <YouTubeFeedImporter
                  cookieSource={ytDlpOptions.cookieSource || 'browser'}
                  cookieBrowser={ytDlpOptions.cookieBrowser || 'firefox'}
                  cookieProfile={ytDlpOptions.cookieProfile || ''}
                  cookieFilePath={ytDlpOptions.cookieFilePath || './cookies.txt'}
                  onUpdateCookieSettings={(settings) =>
                    setYtDlpOptions((prev) => ({ ...prev, ...settings }))
                  }
                  onImportAuthenticatedFeed={(rawOutput, tracks) => {
                    setFeedText(rawOutput);
                    setFeedTracks(tracks);
                  }}
                  onProceedToNextStep={() => setActiveStep('feed')}
                />

                {/* Visual GUI yt-dlp Command & Quality Builder */}
                {renderYtDlpGuiBuilderSection()}
              </div>
            )}

            {/* =================================================================
                STEP 02: ADD & FILTER FEED SONGS (activeStep === 'feed')
               ================================================================= */}
            {activeStep === 'feed' && (
              <section className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 space-y-5">
                <div className="border-b border-zinc-800 pb-4">
                  <h2 className="text-sm sm:text-base font-display font-semibold text-zinc-100">
                    Add Songs with Your Own #Tags or Filter Pasted YouTube Output
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Add songs individually below (with only the <code className="font-mono text-amber-300">#tags</code> you choose) or paste multiple YouTube URLs / <code className="font-mono text-zinc-300">yt-dlp</code> lines and run <strong>filterMusicTracks</strong> to strip out podcasts, news, and updates.
                  </p>
                </div>

                {/* Direct 1-Row Song + User Tag Adder */}
                <form
                  onSubmit={handleAddManualSong}
                  className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                >
                  <div className="sm:col-span-3 space-y-1">
                    <label htmlFor="step2-artist" className="block text-[11px] text-zinc-400">
                      Artist *
                    </label>
                    <input
                      id="step2-artist"
                      type="text"
                      value={manualArtist}
                      onChange={(e) => setManualArtist(e.target.value)}
                      placeholder="Artist Name"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="sm:col-span-3 space-y-1">
                    <label htmlFor="step2-title" className="block text-[11px] text-zinc-400">
                      Song Title *
                    </label>
                    <input
                      id="step2-title"
                      type="text"
                      value={manualTitle}
                      onChange={(e) => setManualTitle(e.target.value)}
                      placeholder="Song Title"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="sm:col-span-3 space-y-1">
                    <label htmlFor="step2-tags" className="block text-[11px] text-zinc-400">
                      Your Custom #Tags (Optional)
                    </label>
                    <input
                      id="step2-tags"
                      type="text"
                      value={manualTags}
                      onChange={(e) => setManualTags(e.target.value)}
                      placeholder="tag1, tag2 (only your tags)"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label htmlFor="step2-url" className="block text-[11px] text-zinc-400">
                      YouTube URL (Optional)
                    </label>
                    <input
                      id="step2-url"
                      type="text"
                      value={manualUrl}
                      onChange={(e) => setManualUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <button
                      type="submit"
                      className="w-full py-2 px-3 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      + Add
                    </button>
                  </div>
                </form>

                <textarea
                  id="youtube-feed-textarea"
                  aria-label="Feed Input"
                  rows={6}
                  value={feedText}
                  onChange={(e) => setFeedText(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-400 leading-relaxed"
                  placeholder="Paste YouTube URLs or 'Artist - Song Title [your-tag]' lines here..."
                />

                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <p className="text-xs text-zinc-400 font-mono tabular-nums">
                    Kept <span className="text-emerald-300 font-semibold">{filterMusicTracks(feedText).tracks.length} music songs</span> · Filtered out{' '}
                    <span className="text-amber-300">
                      {filterMusicTracks(feedText).filteredOut.length} non-music items (podcast / news / update)
                    </span>
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCleanFeedTextWithFilter}
                      className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700 font-medium text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      Run filterMusicTracks
                    </button>
                    <button
                      type="button"
                      onClick={handleAnalyzeFeed}
                      className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Save Songs &amp; Go to Step 03: Search &amp; DNA</span>
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* =================================================================
                STEP 03: SEARCH MUSIC & TASTE DNA (activeStep === 'search')
               ================================================================= */}
            {activeStep === 'search' && (
              <div className="space-y-6">
                {/* Part 1: Simple Song / YouTube URL Inspector & Google Search Grounding */}
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
                      return exists ? prev.map((p) => (p.id === track.id ? track : p)) : [track, ...prev];
                    });
                  }}
                  onToggleTrackInPlaylist={(trackId) => toggleTrackInPlaylist(trackId)}
                  activePlaylistName={activePlaylist?.name}
                  activePlaylistTrackIds={activePlaylist?.trackIds || []}
                />

                {/* Part 2: User-Only Taste DNA Signals (Zero Default Tags/Suggestions) */}
                <section
                  aria-label="Your Taste DNA Signals"
                  className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                    <div>
                      <h2 className="text-sm font-display font-semibold text-zinc-100">
                        Your Custom Taste DNA Signals (Only Added by You — No Default Tags)
                      </h2>
                      <p className="text-xs text-zinc-400">
                        Add your own favorite artists, custom <code className="font-mono text-zinc-300">#tags</code>, or genres below. Click any signal to remove it.
                      </p>
                    </div>
                    {(favoriteArtists.length > 0 ||
                      favoriteTags.length > 0 ||
                      favoriteCategories.length > 0) && (
                      <button
                        type="button"
                        onClick={resetFavoritesToDefault}
                        className="px-2.5 py-1 bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-rose-300 border border-zinc-800 rounded text-xs cursor-pointer"
                      >
                        Clear All Signals
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleAddCustomFavorite} className="flex flex-col sm:flex-row gap-2">
                    <select
                      aria-label="Favorite Signal Type"
                      value={newFavType}
                      onChange={(e) => setNewFavType(e.target.value as 'artist' | 'tag' | 'category')}
                      className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-400"
                    >
                      <option value="artist">Favorite Artist</option>
                      <option value="tag">Custom #Tag</option>
                      <option value="category">Favorite Category</option>
                    </select>
                    <input
                      id="fav-input"
                      type="text"
                      value={newFavValue}
                      onChange={(e) => setNewFavValue(e.target.value)}
                      placeholder={
                        newFavType === 'artist'
                          ? 'Type an artist name you want to track...'
                          : newFavType === 'tag'
                          ? 'Type your own custom #tag...'
                          : 'Type a genre or category...'
                      }
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold rounded-lg text-xs transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Add Signal
                    </button>
                  </form>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                    <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3.5 space-y-2">
                      <div className="text-xs font-semibold text-zinc-300 flex justify-between">
                        <span>Your Artists</span>
                        <span className="font-mono text-amber-400">{favoriteArtists.length}</span>
                      </div>
                      {favoriteArtists.length === 0 ? (
                        <p className="text-[11px] text-zinc-500">No artists added yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {favoriteArtists.map((artist) => (
                            <button
                              key={artist}
                              type="button"
                              onClick={() => toggleFavoriteArtist(artist)}
                              className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-zinc-800 rounded text-xs cursor-pointer"
                            >
                              {artist} ×
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3.5 space-y-2">
                      <div className="text-xs font-semibold text-zinc-300 flex justify-between">
                        <span>Your Custom #Tags</span>
                        <span className="font-mono text-amber-400">{favoriteTags.length}</span>
                      </div>
                      {favoriteTags.length === 0 ? (
                        <p className="text-[11px] text-zinc-500">No tags added yet — only your tags appear here.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {favoriteTags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleFavoriteTag(tag)}
                              className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded text-xs font-mono cursor-pointer"
                            >
                              #{tag} ×
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3.5 space-y-2">
                      <div className="text-xs font-semibold text-zinc-300 flex justify-between">
                        <span>Your Categories</span>
                        <span className="font-mono text-emerald-400">{favoriteCategories.length}</span>
                      </div>
                      {favoriteCategories.length === 0 ? (
                        <p className="text-[11px] text-zinc-500">No categories added yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {favoriteCategories.map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => toggleFavoriteCategory(cat)}
                              className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-emerald-300 border border-zinc-800 rounded text-xs cursor-pointer"
                            >
                              {cat} ×
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* =================================================================
                STEP 04: TASTE REGRESSION TRAINING & GEMINI PROMPT LAB (activeStep === 'assistant')
               ================================================================= */}
            {activeStep === 'assistant' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3">
                  <div
                    role="tablist"
                    aria-label="AI Discovery Modes"
                    className="inline-flex items-center gap-1.5 p-1 bg-zinc-950 border border-zinc-800 rounded-lg"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={aiLabMode === 'regression'}
                      onClick={() => setAiLabMode('regression')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                        aiLabMode === 'regression'
                          ? 'bg-amber-400 text-zinc-950 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Taste Regression &amp; Prompt Engineering Lab
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={aiLabMode === 'chat'}
                      onClick={() => setAiLabMode('chat')}
                      className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                        aiLabMode === 'chat'
                          ? 'bg-amber-400 text-zinc-950 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Gemini Crate AI Chat
                    </button>
                  </div>
                  <span className="text-xs font-mono text-zinc-400">
                    Train on your samples (y = 0..10) &amp; search YouTube with engineered prompts
                  </span>
                </div>

                {aiLabMode === 'regression' ? (
                  <TasteRegressionLab
                    userTracks={[...feedTracks, ...customCatalogTracks]}
                    activePlaylistTracks={activePlaylistTracks}
                    onAddDiscoveredTrackToCatalog={(track) => {
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
                    onAddTrackToActivePlaylist={(trackId) =>
                      addTrackToPlaylistIfAbsent(trackId)
                    }
                  />
                ) : (
                  <GeminiCrateChatbot
                    activePlaylistName={activePlaylist?.name || 'Active Crate'}
                    activePlaylistTracks={activePlaylistTracks}
                    onAddSuggestedTrackToCatalog={(track) => {
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
                    onAddTrackToActivePlaylist={(trackId) =>
                      addTrackToPlaylistIfAbsent(trackId)
                    }
                  />
                )}
              </div>
            )}

            {/* =================================================================
                STEP 05: RANKED CRATE & EXPORT (activeStep === 'export')
               ================================================================= */}
            {activeStep === 'export' && activePlaylist && (
              <div className="space-y-5">
                {/* Clean Sub-Navigation Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3">
                  <div
                    role="tablist"
                    aria-label="Crate Views"
                    className="flex items-center gap-1.5 p-1 bg-zinc-950 border border-zinc-800 rounded-lg flex-wrap"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={exportSubTab === 'ranked'}
                      onClick={() => setExportSubTab('ranked')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                        exportSubTab === 'ranked'
                          ? 'bg-amber-400 text-zinc-950 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>Taste-Ranked Catalog ({rankedTracks.length})</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={exportSubTab === 'saved'}
                      onClick={() => setExportSubTab('saved')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                        exportSubTab === 'saved'
                          ? 'bg-amber-400 text-zinc-950 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Saved Crate &amp; Bulk Edit ({activePlaylistTracks.length})</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={exportSubTab === 'exporter'}
                      onClick={() => setExportSubTab('exporter')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                        exportSubTab === 'exporter'
                          ? 'bg-amber-400 text-zinc-950 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <FileCode2 className="w-3.5 h-3.5" />
                      <span>Download .m3u / .pls / .json / .sh</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={exportSubTab === 'ytdlp-gui'}
                      onClick={() => setExportSubTab('ytdlp-gui')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                        exportSubTab === 'ytdlp-gui'
                          ? 'bg-amber-400 text-zinc-950 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>GUI yt-dlp Builder</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={exportSubTab === 'analytics'}
                      onClick={() => setExportSubTab('analytics')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                        exportSubTab === 'analytics'
                          ? 'bg-amber-400 text-zinc-950 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>Taste Analytics Charts</span>
                    </button>
                  </div>

                  {/* Active Playlist Selector */}
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <span>Active Crate:</span>
                    <select
                      aria-label="Select Active Crate"
                      value={activePlaylistId}
                      onChange={(e) => setActivePlaylistId(e.target.value)}
                      className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
                    >
                      {playlists.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {pl.name} ({pl.trackIds.length} tracks)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* SUB-VIEW 5A: TASTE-RANKED CATALOG */}
                {exportSubTab === 'ranked' && (
                  <section className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 space-y-4">
                    <div className="flex flex-col xl:flex-row gap-3 justify-between">
                      <div className="flex flex-1 flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            aria-label="Filter ranked tracks"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter ranked tracks or query iTunes / MusicBrainz..."
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <select
                            aria-label="External Music Database"
                            value={externalSource}
                            onChange={(e) =>
                              setExternalSource(e.target.value as 'itunes' | 'musicbrainz')
                            }
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
                            <RefreshCw
                              className={`w-3.5 h-3.5 ${isSearchingExternal ? 'animate-spin' : ''}`}
                            />
                            Fetch Live Catalog
                          </button>
                        </div>
                      </div>

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
                            <th className="py-2.5 px-3">Track &amp; Artist</th>
                            <th className="py-2.5 px-3 hidden md:table-cell">Category &amp; Sonic Tags</th>
                            <th className="py-2.5 px-3 hidden sm:table-cell text-right">BPM / Time</th>
                            <th className="py-2.5 px-3 text-right">Actions</th>
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
                                className={`hover:bg-zinc-800/40 transition-colors ${
                                  isSelected ? 'bg-amber-400/5' : ''
                                }`}
                              >
                                <td className="py-3 px-2.5 align-middle">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelectTrack(track.id)}
                                    aria-label={`Select ${track.artist} - ${track.title}`}
                                    className="rounded border-zinc-700 bg-zinc-900 text-amber-400 focus:ring-amber-400 cursor-pointer"
                                  />
                                </td>

                                <td className="py-3 px-3 align-middle whitespace-nowrap">
                                  <span className="font-mono tabular-nums font-semibold text-amber-400 text-sm">
                                    {track.matchScore}%
                                  </span>
                                </td>

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
                                    <div>
                                      <div className="font-medium text-zinc-100 leading-snug">
                                        {track.title}
                                      </div>
                                      <div className="flex items-center gap-1.5 text-zinc-400 mt-0.5 whitespace-nowrap">
                                        <button
                                          type="button"
                                          onClick={() => toggleFavoriteArtist(track.artist)}
                                          className={`hover:text-amber-300 transition-colors cursor-pointer ${
                                            isFavArtist ? 'text-amber-300 font-medium' : ''
                                          }`}
                                        >
                                          {track.artist} {isFavArtist ? '★' : '☆'}
                                        </button>
                                        <span aria-hidden="true" className="text-zinc-600">·</span>
                                        <span className="text-zinc-500">{track.source}</span>
                                      </div>
                                    </div>
                                  </div>
                                </td>

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

                                <td className="py-3 px-3 align-middle hidden sm:table-cell text-right font-mono tabular-nums text-zinc-400 whitespace-nowrap">
                                  {track.bpm} BPM · {formatDuration(track.durationSec)}
                                </td>

                                <td className="py-3 px-3 align-middle text-right whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1.5">
                                    <a
                                      href={track.youtubeUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2.5 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1"
                                    >
                                      <span>YouTube</span>
                                      <ExternalLink className="w-3 h-3 text-zinc-400" />
                                    </a>

                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(singleYtDlpCmd, `cmd-${track.id}`)}
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
                                          <span>Save</span>
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
                    </div>
                  </section>
                )}

                {/* SUB-VIEW 5B: SAVED CRATE + BULK EDIT */}
                {exportSubTab === 'saved' && (
                  <section className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                      <div>
                        <h2 className="text-base font-display font-semibold text-zinc-100">
                          Saved Crate: {activePlaylist.name} ({activePlaylistTracks.length} tracks)
                        </h2>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          Select multiple tracks below to apply tags or categories simultaneously.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            const payload = buildPlaylistExportPayload(activePlaylistTracks, {
                              playlistName: activePlaylist.name,
                              format: 'json',
                            });
                            downloadFile(payload.filename, payload.content, payload.mimeType);
                            setBulkEditStatusMessage(
                              `Exported ${payload.filename} (${payload.trackCount} tracks with titles & artists).`
                            );
                          }}
                          disabled={activePlaylistTracks.length === 0}
                          className="px-3.5 py-2 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-50 text-amber-300 border border-amber-400/40 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Export Playlist .json
                        </button>
                        <button
                          type="button"
                          onClick={() => setExportSubTab('exporter')}
                          className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <FileCode2 className="w-3.5 h-3.5" />
                          Download .m3u / .pls / .json / .sh
                        </button>
                      </div>
                    </div>

                    {activePlaylistTracks.length === 0 ? (
                      <div className="py-12 text-center space-y-3">
                        <Disc3 className="w-8 h-8 text-zinc-600 mx-auto" />
                        <p className="text-sm text-zinc-300">This playlist is currently empty.</p>
                        <button
                          type="button"
                          onClick={() => setExportSubTab('ranked')}
                          className="px-4 py-2 bg-amber-400 text-zinc-950 font-semibold text-xs rounded-lg cursor-pointer"
                        >
                          Browse Taste-Ranked Catalog
                        </button>
                      </div>
                    ) : (
                      <>
                        {renderBulkEditToolbar(activePlaylistTracks, 'Saved Tracks')}

                        <div className="divide-y divide-zinc-800/70">
                          {activePlaylistTracks.map((track, idx) => {
                            const isSelected = selectedTrackIds.includes(track.id);
                            return (
                              <div
                                key={track.id}
                                className={`py-3 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-800/30 rounded-lg transition-colors ${
                                  isSelected ? 'bg-amber-400/10' : ''
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
                                  <div className="space-y-0.5">
                                    <div className="text-xs font-semibold text-zinc-100">
                                      {track.artist} — {track.title}
                                    </div>
                                    <div className="text-xs text-zinc-400 flex items-center flex-wrap gap-1">
                                      <button
                                        type="button"
                                        onClick={() => toggleFavoriteCategory(track.category)}
                                        className="text-amber-300 hover:underline font-medium cursor-pointer"
                                      >
                                        {track.category}
                                      </button>
                                      <span aria-hidden="true">·</span>
                                      {track.tags.map((t, tIdx) => (
                                        <React.Fragment key={t}>
                                          {tIdx > 0 && <span aria-hidden="true">/</span>}
                                          <button
                                            type="button"
                                            onClick={() => toggleFavoriteTag(t)}
                                            className="text-zinc-300 hover:text-amber-300 font-mono text-[11px] cursor-pointer"
                                          >
                                            #{t}
                                          </button>
                                        </React.Fragment>
                                      ))}
                                      <span aria-hidden="true">·</span>
                                      <span className="font-mono text-zinc-500">
                                        {formatDuration(track.durationSec)}
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

                {/* SUB-VIEW 5C: PLAYLIST EXPORTER (.m3u / .pls / .json / .sh) */}
                {exportSubTab === 'exporter' && (
                  <div className="space-y-5">
                    <PlaylistExporter
                      tracks={allTracksPool}
                      savedTrackIds={activePlaylist.trackIds}
                      defaultPlaylistName={activePlaylist.name}
                      ytDlpOptions={ytDlpOptions}
                      selectedTrackIds={selectedTrackIds}
                      onChangeSelectedTrackIds={setSelectedTrackIds}
                    />
                  </div>
                )}

                {/* SUB-VIEW 5D: VISUAL GUI YT-DLP COMMAND & QUALITY BUILDER */}
                {exportSubTab === 'ytdlp-gui' && renderYtDlpGuiBuilderSection()}

                {/* SUB-VIEW 5E: TASTE ANALYTICS CHARTS */}
                {exportSubTab === 'analytics' && (
                  <TasteAnalytics catalogTracks={allTracksPool} />
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-zinc-900 py-4 px-6 text-center text-xs text-zinc-500">
        CrateDig YT · 5-Step Guided Music Taste, Gemini Crate AI &amp; yt-dlp Pipeline
      </footer>
    </div>
  );
}
