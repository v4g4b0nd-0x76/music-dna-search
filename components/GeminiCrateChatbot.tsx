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
  Heart,
  Trash2,
  Loader2,
  Zap,
  Cpu,
  Terminal,
  Disc3,
  Check,
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
        'Welcome to the **Gemini Crate Digging Assistant** with real-time **Google Search Grounding**.',
        '',
        'I am synced with your active **Taste DNA** (`Favorite Artists`, `Sonic Tags`, and `Active Playlist`). Choose a specialist role above or ask me to:',
        '- Discover underground vinyl pressings, label catalogs, and live sets via **Google Search** (`gemini-3.8-flash`)',
        '- Craft custom `yt-dlp` & `ffmpeg` audio extraction scripts (`gemini-4-argon` / `gemini-3.8-flash`)',
        '- Sequence harmonic BPM transitions for your `.m3u` and `.pls` crate exports (`gemini-3.1-flash-lite` for rapid replies)',
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

  const activeRoleMeta =
    CRATE_ASSISTANT_ROLES.find((r) => r.id === role) || CRATE_ASSISTANT_ROLES[0];
  const effectiveModel = resolveGeminiModelForTier(tier, enableSearchGrounding);

  const sendMessage = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || isLoading) return;

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
          role,
          tier,
          enableSearchGrounding,
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
        modelUsed: data.modelUsed || effectiveModel,
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
    <section
      aria-label="Gemini Crate Assistant and Google Search Grounding"
      className="bg-zinc-900/80 border border-zinc-800/90 rounded-xl p-5 space-y-4"
    >
      {/* Top Header: Title, Model Tier Selector & Google Search Grounding Toggle */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="text-sm sm:text-base font-display font-semibold text-zinc-100">
              Gemini Crate Assistant &amp; Google Search Grounding
            </h2>
            <span className="text-xs font-mono text-amber-300">
              [{effectiveModel}]
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Multi-turn musicologist, <code className="font-mono text-zinc-300">yt-dlp</code> scripting assistant, and live Google Search release researcher synced with your Taste DNA.
          </p>
        </div>

        {/* Controls: Model Complexity Tier + Google Search Grounding Switch */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
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
              title="Fast responses using gemini-3.1-flash-lite"
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
              title="General tasks & Search Grounding using gemini-3.8-flash"
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
              title="Complex analysis & scripting using gemini-4-argon"
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

      {/* Role / System Instruction Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {CRATE_ASSISTANT_ROLES.map((item) => {
          const isSelected = item.id === role;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setRole(item.id)}
              className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-zinc-950 border-amber-400/60 text-zinc-100'
                  : 'bg-zinc-950/50 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                  {item.id === 'crate-digger' && <Disc3 className="w-3.5 h-3.5 text-amber-400" />}
                  {item.id === 'ytdlp-engineer' && <Terminal className="w-3.5 h-3.5 text-amber-400" />}
                  {item.id === 'playlist-curator' && <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
                  {item.label}
                </span>
                <span className="text-[11px] font-mono text-amber-300/90">
                  {item.shortBadge}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                {item.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Quick Sample Prompts for the Active Role */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-mono text-zinc-400 shrink-0">Try asking:</span>
        {activeRoleMeta.samplePrompts.map((sample) => (
          <button
            key={sample}
            type="button"
            disabled={isLoading}
            onClick={() => sendMessage(sample)}
            className="px-2.5 py-1 text-xs bg-zinc-950 hover:bg-zinc-800 disabled:opacity-50 text-zinc-300 border border-zinc-800 rounded-md transition-colors cursor-pointer text-left"
          >
            {sample}
          </button>
        ))}
      </div>

      {/* Scrollable Multi-Turn Conversation Thread */}
      <div
        role="log"
        aria-label="Gemini Chat Conversation Thread"
        className="bg-zinc-950/90 border border-zinc-800/90 rounded-xl p-4 max-h-[460px] overflow-y-auto space-y-4"
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
              {/* Message Meta Header */}
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

              {/* Markdown Content */}
              <div className="markdown-body text-xs sm:text-sm leading-relaxed space-y-2 text-zinc-200 [&_pre]:bg-zinc-950 [&_pre]:border [&_pre]:border-zinc-800 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_code]:font-mono [&_code]:text-amber-300 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-zinc-100 [&_h4]:text-xs [&_h4]:font-semibold [&_h4]:text-zinc-200">
                <Markdown>{msg.text}</Markdown>
              </div>

              {/* Actionable Suggested Tracks Extracted from Response */}
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
                              title={`Search ${trk.artist} - ${trk.title} on YouTube`}
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

              {/* Google Search Grounding Sources / Citations */}
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
              title="Clear conversation thread"
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
  );
}
