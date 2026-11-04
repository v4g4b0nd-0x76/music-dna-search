'use client';

import React, { useState } from 'react';
import {
  Search,
  Sparkles,
  Check,
  Plus,
  ExternalLink,
  Terminal,
  Heart,
  Loader2,
  Music,
} from 'lucide-react';
import { MusicTrack } from '@/lib/music-data';
import { resolveMockTrackSearch } from '@/lib/track-search';
import { formatDuration } from '@/lib/taste-engine';
import { useFavorites } from '@/context/FavoritesContext';

export interface TrackSearchProps {
  onAddTrackToCatalog?: (track: MusicTrack) => void;
  onToggleTrackInPlaylist?: (trackId: string) => void;
  activePlaylistName?: string;
  activePlaylistTrackIds?: string[];
  cookieFlag?: string;
}

export default function TrackSearch({
  onAddTrackToCatalog,
  onToggleTrackInPlaylist,
  activePlaylistName = 'Active Playlist',
  activePlaylistTrackIds = [],
  cookieFlag = '',
}: TrackSearchProps) {
  const {
    toggleFavoriteArtist,
    toggleFavoriteTag,
    toggleFavoriteCategory,
    addFavoriteSignal,
    isArtistFavorite,
    isTagFavorite,
    isCategoryFavorite,
  } = useFavorites();

  const [queryInput, setQueryInput] = useState<string>('');
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [results, setResults] = useState<MusicTrack[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copiedTrackId, setCopiedTrackId] = useState<string | null>(null);
  const [savedAllTrackId, setSavedAllTrackId] = useState<string | null>(null);

  const runTrackLookup = (inputValue: string) => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a YouTube URL or song/artist name to fetch track details.');
      return;
    }
    setErrorMsg('');
    setIsFetching(true);

    // Simulated fast lookup interface
    setTimeout(() => {
      const matched = resolveMockTrackSearch(trimmed);
      setResults(matched);
      setIsFetching(false);
      if (matched.length > 0 && onAddTrackToCatalog) {
        matched.forEach((t) => onAddTrackToCatalog(t));
      }
    }, 150);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runTrackLookup(queryInput);
  };

  const handleSaveAllTrackSignalsToFavorites = (track: MusicTrack) => {
    addFavoriteSignal('artist', track.artist);
    addFavoriteSignal('category', track.category);
    track.tags.forEach((tag) => addFavoriteSignal('tag', tag));
    if (onAddTrackToCatalog) {
      onAddTrackToCatalog(track);
    }
    setSavedAllTrackId(track.id);
    setTimeout(() => {
      setSavedAllTrackId((prev) => (prev === track.id ? null : prev));
    }, 1800);
  };

  const handleCopyYtDlp = (track: MusicTrack) => {
    const prefix = cookieFlag ? `yt-dlp ${cookieFlag}` : 'yt-dlp';
    const cmd = `${prefix} -x --audio-format mp3 --audio-quality 0 --embed-metadata --embed-thumbnail ${track.ytDlpQuery}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(cmd).catch(() => {});
    }
    setCopiedTrackId(track.id);
    setTimeout(() => {
      setCopiedTrackId((prev) => (prev === track.id ? null : prev));
    }, 1800);
  };

  return (
    <section
      aria-label="TrackSearch Lookup"
      className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3.5">
        <div>
          <h2 className="text-sm font-display font-semibold text-zinc-100 flex items-center gap-2">
            <Music className="w-4 h-4 text-amber-400 shrink-0" />
            <span>TrackSearch — Instant YouTube URL & Song Inspector</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Paste any YouTube video URL or enter an <code className="font-mono text-zinc-300">Artist - Song</code> title to fetch track details and add its artist, tags, or category to your Favorites.
          </p>
        </div>

        {/* Quick Sample Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              const sampleUrl = 'https://www.youtube.com/watch?v=yT0gRc2c2wQ';
              setQueryInput(sampleUrl);
              runTrackLookup(sampleUrl);
            }}
            className="px-2.5 py-1 text-[11px] bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            Try URL: Roygbiv
          </button>
          <button
            type="button"
            onClick={() => {
              const sampleSong = 'Burial - Archangel';
              setQueryInput(sampleSong);
              runTrackLookup(sampleSong);
            }}
            className="px-2.5 py-1 text-[11px] bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            Try Song: Burial - Archangel
          </button>
        </div>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="track-search-input"
            type="text"
            aria-label="YouTube URL or song name"
            value={queryInput}
            onChange={(e) => {
              setQueryInput(e.target.value);
              if (errorMsg) setErrorMsg('');
            }}
            placeholder="Paste YouTube URL (https://youtube.com/watch?v=...) or type Artist - Song Name..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
          />
        </div>
        <button
          type="submit"
          disabled={isFetching}
          className="px-4 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
        >
          {isFetching ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Fetching Details...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Fetch Track Details</span>
            </>
          )}
        </button>
      </form>

      {errorMsg && (
        <p role="alert" className="text-xs text-rose-400 font-medium">
          {errorMsg}
        </p>
      )}

      {/* Fetched Track Results */}
      {results.length > 0 && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Fetched Track Metadata ({results.length} result{results.length === 1 ? '' : 's'})</span>
            <button
              type="button"
              onClick={() => setResults([])}
              className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              Clear Results
            </button>
          </div>

          <div className="divide-y divide-zinc-800/80 border border-zinc-800/90 rounded-lg bg-zinc-950/70">
            {results.map((track) => {
              const favArtist = isArtistFavorite(track.artist);
              const favCat = isCategoryFavorite(track.category);
              const inPlaylist = activePlaylistTrackIds.includes(track.id);
              const isAllSaved =
                favArtist &&
                favCat &&
                track.tags.every((t) => isTagFavorite(t));

              return (
                <div
                  key={track.id}
                  className="p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-zinc-100">
                        {track.title}
                      </span>
                      <span aria-hidden="true" className="text-zinc-600">
                        —
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleFavoriteArtist(track.artist)}
                        aria-label={
                          favArtist
                            ? `Remove ${track.artist} from favorite artists`
                            : `Add ${track.artist} to favorite artists`
                        }
                        className={`text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          favArtist
                            ? 'text-amber-300'
                            : 'text-zinc-300 hover:text-amber-300'
                        }`}
                      >
                        {track.artist} {favArtist ? '★' : '☆'}
                      </button>
                      <span aria-hidden="true" className="text-zinc-600">
                        ·
                      </span>
                      <span className="text-xs font-mono tabular-nums text-zinc-400">
                        {track.bpm} BPM · {formatDuration(track.durationSec)} · {track.year}
                      </span>
                    </div>

                    {/* Unboxed Metadata: Category & Tags with click-to-favorite */}
                    <div className="text-xs text-zinc-400 flex items-center flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => toggleFavoriteCategory(track.category)}
                        className={`transition-colors cursor-pointer font-medium ${
                          favCat ? 'text-emerald-300' : 'text-zinc-300 hover:text-emerald-300'
                        }`}
                      >
                        {track.category} {favCat ? '★' : '☆'}
                      </button>
                      <span aria-hidden="true" className="mx-1 text-zinc-600">
                        ·
                      </span>
                      {track.tags.map((tag, idx) => {
                        const favTag = isTagFavorite(tag);
                        return (
                          <React.Fragment key={tag}>
                            {idx > 0 && (
                              <span aria-hidden="true" className="mx-0.5 text-zinc-600">
                                /
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleFavoriteTag(tag)}
                              className={`transition-colors cursor-pointer ${
                                favTag
                                  ? 'text-amber-300 font-medium'
                                  : 'text-zinc-400 hover:text-amber-300'
                              }`}
                            >
                              #{tag}
                            </button>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>

                  {/* Action Controls: Add to Favorites, YouTube, yt-dlp, Playlist */}
                  <div className="flex items-center flex-wrap gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSaveAllTrackSignalsToFavorites(track)}
                      aria-label={`Add ${track.title} artist, category, and tags to Favorites`}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                        savedAllTrackId === track.id || isAllSaved
                          ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-zinc-800'
                      }`}
                    >
                      {savedAllTrackId === track.id || isAllSaved ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-amber-300" />
                          <span>Favorited Signals</span>
                        </>
                      ) : (
                        <>
                          <Heart className="w-3.5 h-3.5" />
                          <span>Add to Favorites</span>
                        </>
                      )}
                    </button>

                    <a
                      href={track.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <span>YouTube</span>
                      <ExternalLink className="w-3 h-3 text-zinc-400" />
                    </a>

                    <button
                      type="button"
                      onClick={() => handleCopyYtDlp(track)}
                      className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-lg text-xs font-mono transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      {copiedTrackId === track.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Terminal className="w-3 h-3 text-amber-300" />
                          <span>yt-dlp</span>
                        </>
                      )}
                    </button>

                    {onToggleTrackInPlaylist && (
                      <button
                        type="button"
                        onClick={() => {
                          if (onAddTrackToCatalog) onAddTrackToCatalog(track);
                          onToggleTrackInPlaylist(track.id);
                        }}
                        aria-label={
                          inPlaylist
                            ? `Remove ${track.title} from ${activePlaylistName}`
                            : `Add ${track.title} to ${activePlaylistName}`
                        }
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                          inPlaylist
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold'
                        }`}
                      >
                        {inPlaylist ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>In Playlist</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            <span>Playlist</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
