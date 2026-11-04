'use client';

import React, { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import {
  Sparkles,
  Send,
  Globe,
  Bot,
  User,
  ExternalLink,
  Plus,
  Trash2,
  Loader2,
  Zap,
  Cpu,
  Terminal,
  Disc3,
  Check,
  Play,
  BookOpen,
} from 'lucide-react';
import {
  CRATE_ASSISTANT_ROLES,
  GeminiCrateRole,
  GeminiTaskTier,
  CrateChatMessage,
  SuggestedCrateTrack,
  TasteContextSummary,
  resolveGeminiModelForTier,
} from '@/lib/gemini-crate-assistant';
import { MusicTrack } from '@/lib/music-data';
import { useFavorites } from '@/context/FavoritesContext';

export interface GeminiCrateChatbotProps {
  activePlaylistName?: string;
  activePlaylistTracks?: MusicTrack[];
  onAddSuggestedTrackToCatalog?: (track: MusicTrack) => void;
  onAddTrackToActivePlaylist?: (trackId: string) => void;
}

interface WorkedExample {
  id: string;
  stepBadge: string;
  title: string;
  role: GeminiCrateRole;
  tier: GeminiTaskTier;
  grounding: boolean;
  prompt: string;
  expectedOutcome: string;
}

const WORKED_EXAMPLES: WorkedExample[] = [
  {
    id: 'ex-1-grounding',
    stepBadge: 'EXAMPLE 1 · GOOGLE SEARCH GROUNDING',
    title: 'Discover Vinyl Releases & Underground Cuts',
    role: 'crate-digger',
    tier: 'general',
    grounding: true,
    prompt: 'Recommend 4 deep cuts similar to Bicep and Overmono with BPM and label info',
    expectedOutcome:
      'Uses gemini-3.8-flash + Google Search to return 4 tracks with BPM, release year, clickable web citations, and 1-click "Save Pick" buttons.',
  },
  {
    id: 'ex-2-ytdlp',
    stepBadge: 'EXAMPLE 2 · YT-DLP CLI ENGINEER',
    title: 'Generate Custom yt-dlp Cookie & Audio Filter Script',
    role: 'ytdlp-engineer',
    tier: 'complex',
    grounding: false,
    prompt:
      'Write a yt-dlp command to download only tracks between 2 and 9 minutes with Firefox cookies and embedded cover art',
    expectedOutcome:
      'Uses the yt-dlp CLI Engineer persona to generate a copy-pasteable bash script with --cookies-from-browser firefox and --match-filter.',
  },
  {
    id: 'ex-3-curator',
    stepBadge: 'EXAMPLE 3 · DJ CRATE SEQUENCER',
    title: 'Build a Harmonic BPM Progression for .m3u Export',
    role: 'playlist-curator',
    tier: 'fast',
    grounding: false,
    prompt: 'Sequence a 4-track warmup-to-peak transition from 120 BPM to 134 BPM',
    expectedOutcome:
      'Uses gemini-3.1-flash-lite for a rapid 4-track BPM progression tailored to your Favorite Artists and Sonic Tags.',
  },
];

export default function GeminiCrateChatbot({
  activePlaylistName = 'Active Playlist',
  activePlaylistTracks = [],
  onAddSuggestedTrackToCatalog,
  onAddTrackToActivePlaylist,
}: GeminiCrateChatbotProps) {
  const {
    favoriteArtists,
    favoriteTags,
    favoriteCategories,
    addFavoriteSignal,
  } = useFavorites();

  const [role, setRole] = useState<GeminiCrateRole>('crate-digger');
  const [tier, setTier] = useState<GeminiTaskTier>('general');
  const [enableSearchGrounding, setEnableSearchGrounding] = useState<boolean>(true);
  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [addedTrackKey, setAddedTrackKey] = useState<string | null>(null);

  const [messages, setMessages] = useState<CrateChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'model',
      text: [
        'Welcome to **Gemini Crate AI** with live **Google Search Grounding**.',
        '',
        '**How it works:**',
        '1. **Click one of the 3 Worked Examples above** (or type any question below).',
        '2. Gemini combines your **Taste DNA** (`Favorite Artists` & `Sonic Tags`) with real-time **Google Search** web sources.',
        '3. Click **Save Pick** on any recommended track to add it straight to your playlist crate.',
      ].join('\n'),
      timestamp: 'Ready',
      modelUsed: 'gemini-3.8-flash',
      grounded: true,
      sources: [],
      suggestedTracks: [],
    },
  ]);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (messages.length > 1) {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages.length]);

  const effectiveModel = resolveGeminiModelForTier(tier, enableSearchGrounding);

  const sendMessage = async (
    promptText: string,
    overrideRole?: GeminiCrateRole,
    overrideTier?: GeminiTaskTier,
    overrideGrounding?: boolean
  ) => {
    const trimmed = promptText.trim();
    if (!trimmed || isLoading) return;

    const activeRole = overrideRole ?? role;
    const activeTier = overrideTier ?? tier;
    const activeGrounding = overrideGrounding ?? enableSearchGrounding;

    if (overrideRole) setRole(overrideRole);
    if (overrideTier) setTier(overrideTier);
    if (typeof overrideGrounding === 'boolean') setEnableSearchGrounding(overrideGrounding);

    setErrorMsg(null);
    const userMessage: CrateChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const historyForApi = messages
      .filter((m) => m.id !== 'welcome-msg')
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMessage]);
    setInputPrompt('');
    setIsLoading(true);

    const tasteContext: TasteContextSummary = {
      favoriteArtists,
      favoriteTags,
      favoriteCategories,
      activePlaylistName,
      activePlaylistTracks: activePlaylistTracks.map((t) => ({
        artist: t.artist,
        title: t.title,
        bpm: t.bpm,
        category: t.category,
      })),
    };

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          role: activeRole,
          tier: activeTier,
          enableSearchGrounding: activeGrounding,
          history: historyForApi,
          tasteContext,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response from Gemini assistant.');
      }

      const modelMessage: CrateChatMessage = {
        id: `model-${Date.now()}`,
        role: 'model',
        text: data.text || 'No response generated.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed:
          data.modelUsed || resolveGeminiModelForTier(activeTier, activeGrounding),
        grounded: Boolean(data.grounded),
        sources: Array.isArray(data.sources) ? data.sources : [],
        searchQueries: Array.isArray(data.searchQueries) ? data.searchQueries : [],
        suggestedTracks: Array.isArray(data.suggestedTracks) ? data.suggestedTracks : [],
      };

      setMessages((prev) => [...prev, modelMessage]);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to reach Gemini chat endpoint.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputPrompt);
  };

  const handleSaveSuggestedTrack = (suggested: SuggestedCrateTrack) => {
    const idSlug = `${suggested.artist}-${suggested.title}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const trackId = `trk-gemini-${idSlug}`;

    const newTrack: MusicTrack = {
      id: trackId,
      title: suggested.title,
      artist: suggested.artist,
      album: `${suggested.artist} — Gemini Crate Pick`,
      category: suggested.category || 'Electronic',
      tags: suggested.tags.length > 0 ? suggested.tags : ['crate-dig', 'electronic'],
      bpm: suggested.bpm || 126,
      energy: 78,
      durationSec: 245,
      year: suggested.year || 2024,
      youtubeId: 'dQw4w9WgXcQ',
      youtubeUrl: suggested.youtubeUrl,
      ytDlpQuery: `ytsearch1:"${suggested.artist} - ${suggested.title}"`,
      source: 'Taste Engine',
    };

    addFavoriteSignal('artist', suggested.artist);
    suggested.tags.forEach((t) => addFavoriteSignal('tag', t));

    if (onAddSuggestedTrackToCatalog) {
      onAddSuggestedTrackToCatalog(newTrack);
    }
    if (onAddTrackToActivePlaylist) {
      onAddTrackToActivePlaylist(trackId);
    }

    const key = `${suggested.artist}::${suggested.title}`;
    setAddedTrackKey(key);
    setTimeout(() => {
      setAddedTrackKey((prev) => (prev === key ? null : prev));
    }, 1800);
  };

  return (
    <div className="space-y-5">
      {/* Guided Interactive Examples Banner */}
      <section
        aria-label="How to Use Gemini Crate AI Examples"
        className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="text-sm font-display font-semibold text-zinc-100">
              How to Use Gemini Crate AI — Click Any Example to Run Live
            </h2>
          </div>
          <span className="text-xs text-zinc-400 font-mono">
            Synced with {favoriteArtists.length} Favorite Artists &amp; {favoriteTags.length} Sonic Tags
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
          {WORKED_EXAMPLES.map((ex) => (
            <div
              key={ex.id}
              className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between gap-3"
            >
              <div className="space-y-2">
                <div className="text-[10px] font-mono font-semibold text-amber-400">
                  {ex.stepBadge}
                </div>
                <h3 className="text-xs font-semibold text-zinc-100">
                  {ex.title}
                </h3>
                <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-lg p-2.5 text-xs text-zinc-200 font-mono">
                  &ldquo;{ex.prompt}&rdquo;
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  {ex.expectedOutcome}
                </p>
              </div>

              <button
                type="button"
                disabled={isLoading}
                onClick={() =>
                  sendMessage(ex.prompt, ex.role, ex.tier, ex.grounding)
                }
                className="w-full py-2 px-3 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Run This Example</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Main Gemini Chat & Search Grounding Console */}
      <section
        aria-label="Gemini Crate Assistant and Google Search Grounding"
        className="bg-zinc-900/80 border border-zinc-800/90 rounded-xl p-5 space-y-4"
      >
        {/* Header: Role Selector, Model Complexity Tier & Google Search Grounding Switch */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="text-sm font-display font-semibold text-zinc-100">
              Live Conversation Thread
            </h2>
            <span className="text-xs font-mono text-amber-300">
              [{effectiveModel}]
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Specialist Role Selector */}
            <select
              aria-label="Assistant Specialist Role"
              value={role}
              onChange={(e) => setRole(e.target.value as GeminiCrateRole)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-400"
            >
              {CRATE_ASSISTANT_ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  Role: {r.label}
                </option>
              ))}
            </select>

            {/* Task Complexity Model Tier Selector */}
            <div
              role="group"
              aria-label="Gemini Model Tier"
              className="flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-lg"
            >
              <button
                type="button"
                onClick={() => {
                  setTier('fast');
                  setEnableSearchGrounding(false);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                  tier === 'fast' && !enableSearchGrounding
                    ? 'bg-amber-400 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Zap className="w-3 h-3" />
                <span>Fast (3.1 Lite)</span>
              </button>
              <button
                type="button"
                onClick={() => setTier('general')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                  tier === 'general'
                    ? 'bg-amber-400 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>General (3.8 Flash)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTier('complex');
                  setEnableSearchGrounding(false);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                  tier === 'complex' && !enableSearchGrounding
                    ? 'bg-amber-400 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Cpu className="w-3 h-3" />
                <span>Deep (4 Argon)</span>
              </button>
            </div>

            {/* Google Search Grounding Toggle */}
            <button
              type="button"
              onClick={() => setEnableSearchGrounding((prev) => !prev)}
              aria-pressed={enableSearchGrounding}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                enableSearchGrounding
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Google Search Grounding: {enableSearchGrounding ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Multi-Turn Conversation Thread */}
        <div
          role="log"
          aria-label="Gemini Chat Conversation Thread"
          className="bg-zinc-950/90 border border-zinc-800/90 rounded-xl p-4 max-h-[440px] overflow-y-auto space-y-4"
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col gap-2 ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-3xl w-full rounded-xl p-3.5 border ${
                  msg.role === 'user'
                    ? 'bg-amber-400/10 border-amber-400/30 text-zinc-100 ml-auto sm:w-auto'
                    : 'bg-zinc-900/90 border-zinc-800 text-zinc-200'
                }`}
              >
                <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-400 mb-2 pb-1.5 border-b border-zinc-800/80">
                  <div className="flex items-center gap-1.5 font-medium">
                    {msg.role === 'user' ? (
                      <>
                        <User className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-zinc-200">You</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-zinc-200">Gemini Crate Assistant</span>
                        {msg.modelUsed && (
                          <span className="font-mono text-amber-300">· {msg.modelUsed}</span>
                        )}
                        {msg.grounded && (
                          <span className="text-emerald-300 flex items-center gap-1 font-mono">
                            · <Globe className="w-3 h-3" /> Google Search Grounded
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <span className="font-mono tabular-nums text-zinc-500">{msg.timestamp}</span>
                </div>

                <div className="markdown-body text-xs sm:text-sm leading-relaxed space-y-2 text-zinc-200 [&_pre]:bg-zinc-950 [&_pre]:border [&_pre]:border-zinc-800 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_code]:font-mono [&_code]:text-amber-300 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-zinc-100">
                  <Markdown>{msg.text}</Markdown>
                </div>

                {/* Actionable Suggested Tracks */}
                {msg.suggestedTracks && msg.suggestedTracks.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-zinc-800/90 space-y-2">
                    <div className="text-[11px] font-semibold text-zinc-300 flex items-center justify-between">
                      <span>Extracted Crate Picks ({msg.suggestedTracks.length})</span>
                      <span className="text-zinc-400 font-normal">
                        Save directly to Favorites &amp; {activePlaylistName}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {msg.suggestedTracks.map((trk) => {
                        const key = `${trk.artist}::${trk.title}`;
                        const isJustAdded = addedTrackKey === key;
                        return (
                          <div
                            key={key}
                            className="bg-zinc-950 border border-zinc-800/90 rounded-lg p-2.5 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-zinc-100 truncate">
                                {trk.artist} — {trk.title}
                              </div>
                              <div className="text-[11px] font-mono text-zinc-400 truncate">
                                {trk.bpm} BPM · {trk.year} ·{' '}
                                {trk.tags.map((t) => `#${t}`).join(' ')}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <a
                                href={trk.youtubeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-md transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={() => handleSaveSuggestedTrack(trk)}
                                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                                  isJustAdded
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold'
                                }`}
                              >
                                {isJustAdded ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    <span>Saved</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3" />
                                    <span>Save Pick</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Google Search Grounding Citations */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-zinc-800/90 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-emerald-300 flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5" />
                        Google Search Grounding Sources ({msg.sources.length})
                      </span>
                      {msg.searchQueries && msg.searchQueries.length > 0 && (
                        <span className="text-[11px] font-mono text-zinc-400 truncate">
                          Queries: {msg.searchQueries.slice(0, 2).join(' · ')}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {msg.sources.map((src) => (
                        <a
                          key={src.uri}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-xs text-zinc-200 hover:text-amber-300 transition-colors inline-flex items-center gap-1.5 max-w-full"
                        >
                          <span className="truncate max-w-[260px]">{src.title}</span>
                          <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                            ({src.domain})
                          </span>
                          <ExternalLink className="w-3 h-3 text-zinc-400 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-amber-300 font-mono p-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>
                Gemini ({effectiveModel}) is analyzing your Taste DNA
                {enableSearchGrounding ? ' & searching Google Web sources...' : '...'}
              </span>
            </div>
          )}
          <div ref={threadEndRef} />
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="text-xs text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-lg px-3 py-2"
          >
            {errorMsg}
          </div>
        )}

        {/* Chat Input Form */}
        <form onSubmit={handleFormSubmit} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            aria-label="Ask Gemini Crate Assistant"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder="Ask about artists, vinyl labels, live sets, BPM transitions, or yt-dlp commands..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-400"
          />
          <div className="flex items-center gap-2 shrink-0">
            {messages.length > 1 && (
              <button
                type="button"
                onClick={() => setMessages((prev) => [prev[0]])}
                className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
            <button
              type="submit"
              disabled={isLoading || !inputPrompt.trim()}
              className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Ask Gemini</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
