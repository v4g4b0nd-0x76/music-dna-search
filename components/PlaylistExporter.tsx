'use client';

import React, { useState, useMemo } from 'react';
import {
  Download,
  Copy,
  Check,
  FileAudio,
  ListMusic,
  Terminal,
  CheckSquare,
  Sparkles,
  FileCode2,
} from 'lucide-react';
import {
  MusicTrack,
  YtDlpOptions,
  CURATED_CATALOG,
} from '@/lib/music-data';
import { formatDuration } from '@/lib/taste-engine';
import {
  PlaylistExportFormat,
  PlaylistPathMode,
  buildPlaylistExportPayload,
  getFavoriteMatchedTracks,
} from '@/lib/playlist-exporter';
import { useFavorites } from '@/context/FavoritesContext';

export interface PlaylistExporterProps {
  tracks?: MusicTrack[];
  savedTrackIds?: string[];
  defaultPlaylistName?: string;
  ytDlpOptions?: YtDlpOptions;
  selectedTrackIds?: string[];
  onChangeSelectedTrackIds?: (ids: string[]) => void;
}

export default function PlaylistExporter({
  tracks = CURATED_CATALOG,
  savedTrackIds = [],
  defaultPlaylistName = 'Late Night Analog & Breaks',
  ytDlpOptions,
  selectedTrackIds: controlledSelectedIds,
  onChangeSelectedTrackIds,
}: PlaylistExporterProps) {
  const { favoriteArtists, favoriteTags, favoriteCategories } = useFavorites();

  // Filter scope: 'favorites' | 'saved' | 'all'
  const [sourceScope, setSourceScope] = useState<'favorites' | 'saved' | 'all'>('favorites');
  const [exportFormat, setExportFormat] = useState<PlaylistExportFormat>('m3u');
  const [pathMode, setPathMode] = useState<PlaylistPathMode>('youtube-url');
  const [playlistName, setPlaylistName] = useState<string>(defaultPlaylistName);
  const [includeExtendedMeta, setIncludeExtendedMeta] = useState<boolean>(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  // Favorite-matched tracks from FavoritesContext + saved playlist tracks
  const favoriteMatchedTracks = useMemo(() => {
    const matched = getFavoriteMatchedTracks(
      tracks,
      favoriteArtists,
      favoriteTags,
      favoriteCategories,
      savedTrackIds
    );
    return matched.length > 0 ? matched : tracks.slice(0, 6);
  }, [tracks, favoriteArtists, favoriteTags, favoriteCategories, savedTrackIds]);

  const savedCrateTracks = useMemo(() => {
    if (!savedTrackIds.length) return favoriteMatchedTracks.slice(0, 4);
    const savedSet = new Set(savedTrackIds);
    const found = tracks.filter((t) => savedSet.has(t.id));
    return found.length > 0 ? found : favoriteMatchedTracks.slice(0, 4);
  }, [tracks, savedTrackIds, favoriteMatchedTracks]);

  const visibleCandidateTracks = useMemo(() => {
    if (sourceScope === 'saved') return savedCrateTracks;
    if (sourceScope === 'all') return tracks;
    return favoriteMatchedTracks;
  }, [sourceScope, savedCrateTracks, tracks, favoriteMatchedTracks]);

  // Internal selection state if not controlled
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>(() => {
    if (savedTrackIds.length > 0) return savedTrackIds;
    return favoriteMatchedTracks.slice(0, 4).map((t) => t.id);
  });

  const activeSelectedIds = useMemo(() => {
    if (controlledSelectedIds && controlledSelectedIds.length > 0) {
      return controlledSelectedIds;
    }
    return internalSelectedIds;
  }, [controlledSelectedIds, internalSelectedIds]);

  const updateSelectedIds = (nextIds: string[]) => {
    setInternalSelectedIds(nextIds);
    if (onChangeSelectedTrackIds) {
      onChangeSelectedTrackIds(nextIds);
    }
  };

  const toggleTrackSelection = (trackId: string) => {
    if (activeSelectedIds.includes(trackId)) {
      updateSelectedIds(activeSelectedIds.filter((id) => id !== trackId));
    } else {
      updateSelectedIds([...activeSelectedIds, trackId]);
    }
    setDownloadStatus(null);
  };

  const handleSelectAllVisible = () => {
    const visibleIds = visibleCandidateTracks.map((t) => t.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => activeSelectedIds.includes(id));
    if (allSelected) {
      updateSelectedIds(activeSelectedIds.filter((id) => !visibleIds.includes(id)));
    } else {
      updateSelectedIds(Array.from(new Set([...activeSelectedIds, ...visibleIds])));
    }
    setDownloadStatus(null);
  };

  const handleSelectFavoritesOnly = () => {
    updateSelectedIds(favoriteMatchedTracks.map((t) => t.id));
    setSourceScope('favorites');
    setDownloadStatus(null);
  };

  const handleSelectSavedCrateOnly = () => {
    updateSelectedIds(savedCrateTracks.map((t) => t.id));
    setSourceScope('saved');
    setDownloadStatus(null);
  };

  // Selected tracks ordered according to candidate pool
  const selectedTracksForExport = useMemo(() => {
    const selectedSet = new Set(activeSelectedIds);
    return tracks.filter((t) => selectedSet.has(t.id));
  }, [tracks, activeSelectedIds]);

  const audioExt = useMemo((): 'mp3' | 'flac' | 'm4a' | 'opus' => {
    const fmt = ytDlpOptions?.format;
    if (fmt === 'flac' || fmt === 'm4a' || fmt === 'opus') return fmt;
    return 'mp3';
  }, [ytDlpOptions?.format]);

  // Payloads for .m3u, .pls, and .sh
  const activePayload = useMemo(() => {
    return buildPlaylistExportPayload(selectedTracksForExport, {
      playlistName: playlistName || defaultPlaylistName,
      format: exportFormat,
      pathMode,
      audioExtension: audioExt,
      includeExtendedMeta,
      ytDlpOptions,
    });
  }, [
    selectedTracksForExport,
    playlistName,
    defaultPlaylistName,
    exportFormat,
    pathMode,
    audioExt,
    includeExtendedMeta,
    ytDlpOptions,
  ]);

  const triggerDownload = (formatOverride?: PlaylistExportFormat) => {
    const targetFormat = formatOverride || exportFormat;
    const payload = buildPlaylistExportPayload(selectedTracksForExport, {
      playlistName: playlistName || defaultPlaylistName,
      format: targetFormat,
      pathMode,
      audioExtension: audioExt,
      includeExtendedMeta,
      ytDlpOptions,
    });

    if (typeof window !== 'undefined') {
      const blob = new Blob([payload.content], { type: payload.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = payload.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    setExportFormat(targetFormat);
    setDownloadStatus(
      `Generated & downloaded ${payload.filename} (${payload.trackCount} track${
        payload.trackCount === 1 ? '' : 's'
      }).`
    );
  };

  const handleCopyContent = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(activePayload.content).catch(() => {});
    }
    setCopiedKey(exportFormat);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <section
      aria-label="Playlist Exporter (.m3u, .pls, .json & yt-dlp .sh)"
      className="bg-zinc-900/80 border border-zinc-800/90 rounded-xl p-5 space-y-4"
    >
      {/* Header & Format Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-400/15 text-amber-300 border border-amber-400/30 text-[11px] font-mono uppercase tracking-wider">
              <FileAudio className="w-3.5 h-3.5" />
              Playlist Exporter
            </span>
            <h3 className="text-base font-display font-semibold text-zinc-100">
              Export Playlist Metadata to .json, .m3u, .pls, or yt-dlp .sh
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Select a set of your favorite or saved tracks and export a structured{' '}
            <code className="text-amber-300 font-mono">.json</code> metadata file (titles, artists &amp; sonic tags),{' '}
            <code className="text-amber-300 font-mono">.m3u</code>,{' '}
            <code className="text-amber-300 font-mono">.pls</code>, or{' '}
            <code className="text-amber-300 font-mono">yt-dlp</code> bash script.
          </p>
        </div>

        {/* Format Tabs */}
        <div
          role="tablist"
          aria-label="Playlist Export Format"
          className="inline-flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-xl shrink-0 flex-wrap"
        >
          {(
            [
              { id: 'm3u', label: '.m3u Playlist', ext: '.m3u', icon: ListMusic },
              { id: 'pls', label: '.pls Playlist', ext: '.pls', icon: FileAudio },
              { id: 'json', label: '.json Metadata', ext: '.json', icon: FileCode2 },
              { id: 'ytdlp-sh', label: 'yt-dlp .sh Script', ext: '.sh', icon: Terminal },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = exportFormat === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setExportFormat(tab.id);
                  setDownloadStatus(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-amber-400 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Configuration Controls */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-4 space-y-1.5">
          <label
            htmlFor="playlist-exporter-title"
            className="block text-[11px] font-medium text-zinc-300"
          >
            Playlist Title &amp; Filename
          </label>
          <input
            id="playlist-exporter-title"
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            placeholder="Late Night Analog & Breaks"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="md:col-span-4 space-y-1.5">
          <label
            htmlFor="playlist-exporter-path-mode"
            className="block text-[11px] font-medium text-zinc-300"
          >
            Track Entry Format (.m3u / .pls / .json)
          </label>
          <select
            id="playlist-exporter-path-mode"
            value={pathMode}
            onChange={(e) => setPathMode(e.target.value as PlaylistPathMode)}
            disabled={exportFormat === 'ytdlp-sh'}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 disabled:opacity-50 focus:outline-none focus:border-amber-400"
          >
            <option value="youtube-url">YouTube Stream URLs (VLC / mpv / IINA)</option>
            <option value="local-audio">
              Local Audio Files (Artist - Title.{audioExt})
            </option>
          </select>
        </div>

        <div className="md:col-span-4 flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none pb-1">
            <input
              type="checkbox"
              checked={includeExtendedMeta}
              onChange={(e) => setIncludeExtendedMeta(e.target.checked)}
              disabled={exportFormat !== 'm3u'}
              className="rounded border-zinc-700 bg-zinc-950 text-amber-400 focus:ring-amber-400"
            />
            <span>Include Extended #EXTGENRE &amp; #EXTALB tags</span>
          </label>
        </div>
      </div>

      {/* Two-Column Split: Left = Favorite Track Selector, Right = Live File Preview & Download Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
        {/* Left: Track Selection List */}
        <div className="lg:col-span-6 bg-zinc-950/90 border border-zinc-800 rounded-xl p-3.5 flex flex-col justify-between space-y-3">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-zinc-800/80 pb-2.5">
              <div className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSourceScope('favorites')}
                  className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                    sourceScope === 'favorites'
                      ? 'bg-amber-400 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Favorites ({favoriteMatchedTracks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSourceScope('saved')}
                  className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                    sourceScope === 'saved'
                      ? 'bg-amber-400 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Saved Crate ({savedCrateTracks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSourceScope('all')}
                  className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                    sourceScope === 'all'
                      ? 'bg-amber-400 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  All ({tracks.length})
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSelectAllVisible}
                  className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                >
                  <CheckSquare className="w-3 h-3 text-amber-400" />
                  Toggle All ({visibleCandidateTracks.length})
                </button>
                <button
                  type="button"
                  onClick={handleSelectFavoritesOnly}
                  className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-zinc-800 rounded text-[11px] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  Select Favorites
                </button>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-zinc-900 pr-1 space-y-1">
              {visibleCandidateTracks.map((track) => {
                const isSelected = activeSelectedIds.includes(track.id);
                const isFavArtist = favoriteArtists.some(
                  (a) => a.toLowerCase() === track.artist.toLowerCase()
                );
                return (
                  <label
                    key={track.id}
                    className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-amber-400/10 border border-amber-400/30 text-zinc-100'
                        : 'hover:bg-zinc-900/70 text-zinc-300 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTrackSelection(track.id)}
                        aria-label={`Export ${track.artist} - ${track.title}`}
                        className="rounded border-zinc-700 bg-zinc-900 text-amber-400 focus:ring-amber-400 cursor-pointer shrink-0"
                      />
                      <div className="truncate">
                        <span className="font-medium text-zinc-100">{track.artist}</span>
                        {isFavArtist && (
                          <span className="text-amber-300 ml-1" title="Favorite Artist">
                            ★
                          </span>
                        )}{' '}
                        <span className="text-zinc-500">—</span>{' '}
                        <span className="text-zinc-200">{track.title}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-amber-300/90">
                        {track.category}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-500">
                        {formatDuration(track.durationSec)}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 border-t border-zinc-800/80 pt-2">
            <span>
              <strong className="text-amber-300 font-mono">
                {selectedTracksForExport.length}
              </strong>{' '}
              track{selectedTracksForExport.length === 1 ? '' : 's'} queued for export
            </span>
            <button
              type="button"
              onClick={handleSelectSavedCrateOnly}
              className="text-zinc-400 hover:text-amber-300 underline cursor-pointer"
            >
              Reset to Saved Crate
            </button>
          </div>
        </div>

        {/* Right: Live File Output & Download Buttons */}
        <div className="lg:col-span-6 bg-zinc-950/90 border border-zinc-800 rounded-xl p-3.5 flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-mono text-amber-300">
                <FileCode2 className="w-3.5 h-3.5" />
                <span>{activePayload.filename}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyContent}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-md text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
              >
                {copiedKey === exportFormat ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    Copied .{activePayload.extension}
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy .{activePayload.extension}
                  </>
                )}
              </button>
            </div>

            <pre
              aria-label="Generated playlist file preview"
              className="bg-zinc-900/90 border border-zinc-800/90 rounded-lg p-3 text-[11px] font-mono text-amber-300/95 overflow-x-auto max-h-56 overflow-y-auto leading-relaxed whitespace-pre-wrap"
            >
              {activePayload.content}
            </pre>
          </div>

          {/* Direct 1-Click Download Buttons for .m3u, .pls, .json, and .sh */}
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => triggerDownload('m3u')}
                disabled={selectedTracksForExport.length === 0}
                className="py-2 px-3 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download .m3u
              </button>

              <button
                type="button"
                onClick={() => triggerDownload('pls')}
                disabled={selectedTracksForExport.length === 0}
                className="py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-800 disabled:text-zinc-500 text-amber-300 border border-amber-400/40 font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download .pls
              </button>

              <button
                type="button"
                onClick={() => triggerDownload('json')}
                disabled={selectedTracksForExport.length === 0}
                className="py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-800 disabled:text-zinc-500 text-amber-300 border border-amber-400/40 font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                Download .json
              </button>

              <button
                type="button"
                onClick={() => triggerDownload('ytdlp-sh')}
                disabled={selectedTracksForExport.length === 0}
                className="py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-200 border border-zinc-700 font-medium text-xs inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                Download .sh
              </button>
            </div>

            {downloadStatus && (
              <div
                role="status"
                className="text-[11px] font-mono text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 flex items-center justify-between"
              >
                <span>{downloadStatus}</span>
                <button
                  type="button"
                  onClick={() => setDownloadStatus(null)}
                  className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
