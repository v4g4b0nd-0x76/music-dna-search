'use client';

import React, { useState, useMemo } from 'react';
import Markdown from 'react-markdown';
import {
  Sliders,
  Plus,
  Trash2,
  Sparkles,
  Copy,
  Check,
  Play,
  Loader2,
  ExternalLink,
  Tag,
  TrendingUp,
  TrendingDown,
  Terminal,
  FileCode2,
  Globe,
} from 'lucide-react';
import { MusicTrack } from '@/lib/music-data';
import {
  TasteTrainingSample,
  RegressionHyperparameters,
  DEFAULT_HYPERPARAMETERS,
  PROMPT_ENGINEERING_PRESETS,
  PromptTemplatePresetId,
  fitTasteRegressionModel,
  compileRegressionPrompt,
} from '@/lib/taste-regression';
import {
  SuggestedCrateTrack,
  GroundingWebSource,
} from '@/lib/gemini-crate-assistant';
import { useFavorites } from '@/context/FavoritesContext';

export interface TasteRegressionLabProps {
  userTracks: MusicTrack[];
  activePlaylistTracks: MusicTrack[];
  onAddDiscoveredTrackToCatalog: (track: MusicTrack) => void;
  onAddTrackToActivePlaylist: (trackId: string) => void;
}

export default function TasteRegressionLab({
  userTracks,
  activePlaylistTracks,
  onAddDiscoveredTrackToCatalog,
  onAddTrackToActivePlaylist,
}: TasteRegressionLabProps) {
  const {
    favoriteArtists,
    favoriteTags,
    favoriteCategories,
    addFavoriteSignal,
  } = useFavorites();

  // Training dataset state (starts clean — user adds samples or imports from their tracks)
  const [samples, setSamples] = useState<TasteTrainingSample[]>([]);

  // New training sample form state
  const [newArtist, setNewArtist] = useState<string>('');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newYoutubeUrl, setNewYoutubeUrl] = useState<string>('');
  const [newBpm, setNewBpm] = useState<number>(124);
  const [newRating, setNewRating] = useState<number>(8.5);
  const [newTagsInput, setNewTagsInput] = useState<string>('');

  // Inline tag input per sample row
  const [rowTagInputs, setRowTagInputs] = useState<Record<string, string>>({});

  // Regression hyperparameters
  const [hyperparams, setHyperparams] = useState<RegressionHyperparameters>(
    DEFAULT_HYPERPARAMETERS
  );

  // Prompt Engineering Template state
  const [selectedPresetId, setSelectedPresetId] =
    useState<PromptTemplatePresetId>('ols-youtube-discovery');
  const [customTemplateText, setCustomTemplateText] = useState<string>(
    PROMPT_ENGINEERING_PRESETS[0].userPromptTemplate
  );
  const [systemInstructionText, setSystemInstructionText] = useState<string>(
    PROMPT_ENGINEERING_PRESETS[0].systemInstruction
  );
  const [extraConstraints, setExtraConstraints] = useState<string>('');
  const [showTemplateEditor, setShowTemplateEditor] = useState<boolean>(false);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);

  // Live Gemini + YouTube Grounding execution state
  const [isRunningGemini, setIsRunningGemini] = useState<boolean>(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [geminiResponse, setGeminiResponse] = useState<{
    reply: string;
    modelUsed: string;
    sources: GroundingWebSource[];
    suggestedTracks: SuggestedCrateTrack[];
  } | null>(null);
  const [savedTrackFeedback, setSavedTrackFeedback] = useState<string | null>(null);

  // Fit Ridge Regression Model in real time
  const regressionModel = useMemo(
    () => fitTasteRegressionModel(samples, hyperparams),
    [samples, hyperparams]
  );

  // Compile the engineered Gemini prompt with live regression weights and samples
  const compiledPrompt = useMemo(
    () =>
      compileRegressionPrompt({
        template: customTemplateText,
        samples,
        model: regressionModel,
        hyperparams,
        userTags: favoriteTags,
        userArtists: favoriteArtists,
        extraNotes: extraConstraints,
      }),
    [
      customTemplateText,
      samples,
      regressionModel,
      hyperparams,
      favoriteTags,
      favoriteArtists,
      extraConstraints,
    ]
  );

  const handleSelectPreset = (presetId: PromptTemplatePresetId) => {
    setSelectedPresetId(presetId);
    const found = PROMPT_ENGINEERING_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setCustomTemplateText(found.userPromptTemplate);
      setSystemInstructionText(found.systemInstruction);
    }
  };

  const handleAddSample = (e: React.FormEvent) => {
    e.preventDefault();
    const artist = newArtist.trim();
    const title = newTitle.trim();
    if (!artist || !title) return;

    const parsedTags = newTagsInput
      .split(/[,;|/]+/)
      .map((t) => t.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-'))
      .filter(Boolean);

    const newSample: TasteTrainingSample = {
      id: `smp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      artist,
      title,
      youtubeUrl:
        newYoutubeUrl.trim() ||
        `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} - ${title}`)}`,
      tags: Array.from(new Set(parsedTags)),
      category: 'User Sample',
      bpm: Number(newBpm) || 120,
      energy: 75,
      rating: Number(newRating),
    };

    setSamples((prev) => [...prev, newSample]);
    parsedTags.forEach((t) => addFavoriteSignal('tag', t));
    if (newRating >= 7.5) {
      addFavoriteSignal('artist', artist);
    }

    setNewArtist('');
    setNewTitle('');
    setNewYoutubeUrl('');
    setNewTagsInput('');
  };

  const handleImportUserTracksAsSamples = () => {
    const sourcePool =
      activePlaylistTracks.length > 0 ? activePlaylistTracks : userTracks;
    if (sourcePool.length === 0) return;

    setSamples((prev) => {
      const existingKeys = new Set(
        prev.map((s) => `${s.artist.toLowerCase()}::${s.title.toLowerCase()}`)
      );
      const added: TasteTrainingSample[] = [];
      for (const t of sourcePool) {
        const key = `${t.artist.toLowerCase()}::${t.title.toLowerCase()}`;
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          added.push({
            id: `smp-${t.id}`,
            artist: t.artist,
            title: t.title,
            youtubeUrl: t.youtubeUrl,
            tags: [...t.tags],
            category: t.category || 'User Sample',
            bpm: t.bpm || 120,
            energy: t.energy || 72,
            rating: 8.5,
          });
        }
      }
      return [...prev, ...added];
    });
  };

  const handleUpdateSampleRating = (sampleId: string, nextRating: number) => {
    setSamples((prev) =>
      prev.map((s) => (s.id === sampleId ? { ...s, rating: nextRating } : s))
    );
  };

  const handleAddTagToSample = (sampleId: string) => {
    const raw = (rowTagInputs[sampleId] || '').trim();
    if (!raw) return;
    const clean = raw.replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-');
    if (!clean) return;

    setSamples((prev) =>
      prev.map((s) => {
        if (s.id !== sampleId) return s;
        if (s.tags.includes(clean)) return s;
        return { ...s, tags: [...s.tags, clean] };
      })
    );
    addFavoriteSignal('tag', clean);
    setRowTagInputs((prev) => ({ ...prev, [sampleId]: '' }));
  };

  const handleRemoveTagFromSample = (sampleId: string, tagToRemove: string) => {
    setSamples((prev) =>
      prev.map((s) =>
        s.id === sampleId
          ? { ...s, tags: s.tags.filter((t) => t !== tagToRemove) }
          : s
      )
    );
  };

  const handleRemoveSample = (sampleId: string) => {
    setSamples((prev) => prev.filter((s) => s.id !== sampleId));
  };

  const handleCopyEngineeredPrompt = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(compiledPrompt).catch(() => {});
    }
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 1800);
  };

  const handleRunEngineeredPromptWithGemini = async () => {
    if (isRunningGemini) return;
    setIsRunningGemini(true);
    setGeminiError(null);

    try {
      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `${systemInstructionText}\n\n${compiledPrompt}`,
          role: 'crate-digger',
          tier: 'general',
          enableSearchGrounding: true,
          history: [],
          tasteContext: {
            favoriteArtists: [
              ...favoriteArtists,
              ...regressionModel.positiveDrivers
                .filter((d) => d.type === 'artist')
                .map((d) => d.feature),
            ],
            favoriteTags: [
              ...favoriteTags,
              ...regressionModel.positiveDrivers
                .filter((d) => d.type === 'tag')
                .map((d) => d.feature.replace(/^#+/, '')),
            ],
            favoriteCategories,
            activePlaylistName: 'Regression Training Lab',
            activePlaylistTracks: samples.map((s) => ({
              artist: s.artist,
              title: s.title,
              bpm: s.bpm,
              category: `Rating ${s.rating}/10`,
            })),
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to run Gemini Regression Discovery.');
      }

      setGeminiResponse({
        reply: data.reply || '',
        modelUsed: data.modelUsed || 'gemini-3.8-flash',
        sources: Array.isArray(data.sources) ? data.sources : [],
        suggestedTracks: Array.isArray(data.suggestedTracks)
          ? data.suggestedTracks
          : [],
      });
    } catch (err) {
      setGeminiError(
        err instanceof Error
          ? err.message
          : 'Error executing Gemini Regression Prompt.'
      );
    } finally {
      setIsRunningGemini(false);
    }
  };

  const handleAddDiscoveredTrack = (
    suggested: SuggestedCrateTrack,
    alsoAddToTraining: boolean
  ) => {
    const cleanId = `reg-ai-${suggested.artist
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}-${suggested.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}`.slice(0, 48);

    const userDefinedTags = (suggested.tags || [])
      .map((t) => t.replace(/^#+/, '').toLowerCase())
      .filter(Boolean);

    const newTrack: MusicTrack = {
      id: cleanId,
      artist: suggested.artist,
      title: suggested.title,
      album: suggested.year ? `YouTube Discovery (${suggested.year})` : 'YouTube Regression Discovery',
      category: suggested.category || 'Uncategorized',
      tags: userDefinedTags,
      bpm: suggested.bpm || regressionModel.optimalBpm || 124,
      durationSec: 240,
      energy: regressionModel.optimalEnergy || 75,
      year: suggested.year || 2024,
      youtubeUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(
        `${suggested.artist} - ${suggested.title}`
      )}`,
      ytDlpQuery:
        suggested.ytDlpQuery ||
        `ytsearch1:"${suggested.artist} - ${suggested.title} Official Audio"`,
      source: 'Taste Engine',
    };

    onAddDiscoveredTrackToCatalog(newTrack);
    onAddTrackToActivePlaylist(newTrack.id);

    if (alsoAddToTraining) {
      setSamples((prev) => [
        ...prev,
        {
          id: `smp-${Date.now()}`,
          artist: newTrack.artist,
          title: newTrack.title,
          youtubeUrl: newTrack.youtubeUrl,
          tags: [...newTrack.tags],
          category: newTrack.category,
          bpm: newTrack.bpm,
          energy: newTrack.energy,
          rating: 9.0,
        },
      ]);
    }

    setSavedTrackFeedback(
      `Added "${suggested.artist} - ${suggested.title}" to Crate${
        alsoAddToTraining ? ' & Regression Training Set (y=9.0)' : ''
      }.`
    );
    setTimeout(() => setSavedTrackFeedback(null), 2500);
  };

  return (
    <section
      aria-label="Taste Regression Training and Gemini Prompt Engineering System"
      className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-md bg-amber-400/15 text-amber-300 border border-amber-400/30 text-[11px] font-mono uppercase">
              Taste Regression &amp; Prompt Engineering Lab
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono">
              y = β₀ + Σ βᵢxᵢ · YouTube Grounded
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-display font-bold text-zinc-100">
            Train Your Taste Regression Model &amp; Engineer Custom Gemini YouTube Prompts
          </h2>
          <p className="text-xs text-zinc-400">
            Feed your own sample songs with target ratings (<code className="font-mono text-amber-300">y = 0..10</code>) and your own custom <code className="font-mono text-amber-300">#tags</code>. The Ridge Regression solver learns positive &amp; negative feature weights (<code className="font-mono text-zinc-200">β</code>) and compiles a custom Gemini prompt to discover matching music on YouTube.
          </p>
        </div>

        {(userTracks.length > 0 || activePlaylistTracks.length > 0) && (
          <button
            type="button"
            onClick={handleImportUserTracksAsSamples}
            className="px-3.5 py-2 bg-zinc-950 hover:bg-zinc-800 text-amber-300 border border-amber-400/40 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            + Import My Crate/Feed Tracks ({activePlaylistTracks.length || userTracks.length}) as Samples
          </button>
        )}
      </div>

      {/* STEP 1 OF LAB: Add Training Sample Form */}
      <div className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold">
            1. Feed Training Sample (X → Target Affinity y/10)
          </h3>
          <span className="text-[11px] text-zinc-400">
            Tip: Add both tracks you love (y = 8–10) and tracks you dislike (y = 1–3) to train a sharper boundary.
          </span>
        </div>

        <form onSubmit={handleAddSample} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
          <div className="sm:col-span-2 space-y-1">
            <label htmlFor="reg-sample-artist" className="block text-[11px] text-zinc-400">
              Artist *
            </label>
            <input
              id="reg-sample-artist"
              type="text"
              value={newArtist}
              onChange={(e) => setNewArtist(e.target.value)}
              placeholder="e.g. Overmono"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="sm:col-span-3 space-y-1">
            <label htmlFor="reg-sample-title" className="block text-[11px] text-zinc-400">
              Song Title *
            </label>
            <input
              id="reg-sample-title"
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Good Lies"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label htmlFor="reg-sample-tags" className="block text-[11px] text-zinc-400">
              Your Custom #Tags
            </label>
            <input
              id="reg-sample-tags"
              type="text"
              value={newTagsInput}
              onChange={(e) => setNewTagsInput(e.target.value)}
              placeholder="e.g. breakbeat, analog"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label htmlFor="reg-sample-url" className="block text-[11px] text-zinc-400">
              YouTube URL (Optional)
            </label>
            <input
              id="reg-sample-url"
              type="text"
              value={newYoutubeUrl}
              onChange={(e) => setNewYoutubeUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="sm:col-span-1 space-y-1">
            <label htmlFor="reg-sample-bpm" className="block text-[11px] text-zinc-400">
              BPM
            </label>
            <input
              id="reg-sample-bpm"
              type="number"
              min={60}
              max={200}
              value={newBpm}
              onChange={(e) => setNewBpm(Number(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="sm:col-span-1 space-y-1">
            <label htmlFor="reg-sample-rating" className="block text-[11px] text-amber-300 font-mono">
              y ({newRating}/10)
            </label>
            <input
              id="reg-sample-rating"
              type="number"
              step="0.5"
              min={0}
              max={10}
              value={newRating}
              onChange={(e) => setNewRating(Number(e.target.value))}
              className="w-full bg-zinc-900 border border-amber-400/50 rounded-lg px-2 py-2 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="sm:col-span-1">
            <button
              type="submit"
              className="w-full py-2 px-3 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>
        </form>

        {/* Training Samples Table */}
        {samples.length === 0 ? (
          <div className="border border-dashed border-zinc-800 rounded-lg p-6 text-center space-y-2">
            <p className="text-xs text-zinc-400">
              No training samples added yet. Add 2 or more songs above (with your own custom <code className="font-mono text-zinc-200">#tags</code> and target rating <code className="font-mono text-amber-300">y</code> from 0 to 10) to fit your regression model.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] text-zinc-400 font-mono">
                  <th className="py-2 px-2">Sample Track</th>
                  <th className="py-2 px-2">User-Added #Tags (Only Yours)</th>
                  <th className="py-2 px-2">BPM</th>
                  <th className="py-2 px-2">Target Rating (y)</th>
                  <th className="py-2 px-2 text-right">Predicted (ŷ) / Residual</th>
                  <th className="py-2 px-2 text-right">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {samples.map((s) => {
                  const predObj = regressionModel.predictions.find((p) => p.sampleId === s.id);
                  return (
                    <tr key={s.id} className="hover:bg-zinc-900/50">
                      <td className="py-2.5 px-2 align-middle">
                        <div className="font-semibold text-zinc-100">
                          {s.artist} — {s.title}
                        </div>
                        {s.youtubeUrl && (
                          <a
                            href={s.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-zinc-500 hover:text-amber-300 inline-flex items-center gap-1 font-mono"
                          >
                            YouTube <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </td>

                      <td className="py-2.5 px-2 align-middle">
                        <div className="flex items-center flex-wrap gap-1">
                          {s.tags.map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => handleRemoveTagFromSample(s.id, t)}
                              className="px-1.5 py-0.5 bg-zinc-900 hover:bg-rose-950/60 text-amber-300 hover:text-rose-300 border border-zinc-800 rounded text-[11px] font-mono cursor-pointer"
                              title="Click to remove tag"
                            >
                              #{t} ×
                            </button>
                          ))}
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="text"
                              aria-label={`Add tag to ${s.title}`}
                              value={rowTagInputs[s.id] || ''}
                              onChange={(e) =>
                                setRowTagInputs((prev) => ({
                                  ...prev,
                                  [s.id]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddTagToSample(s.id);
                                }
                              }}
                              placeholder="+ add #tag"
                              className="w-24 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-amber-400"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddTagToSample(s.id)}
                              className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[10px] cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-2 align-middle font-mono text-zinc-400">
                        {s.bpm}
                      </td>

                      <td className="py-2.5 px-2 align-middle">
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={10}
                            step={0.5}
                            aria-label={`Target rating for ${s.title}`}
                            value={s.rating}
                            onChange={(e) =>
                              handleUpdateSampleRating(s.id, Number(e.target.value))
                            }
                            className="w-24 accent-amber-400 cursor-pointer"
                          />
                          <span
                            className={`font-mono font-semibold text-xs px-1.5 py-0.5 rounded ${
                              s.rating >= 7
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : s.rating <= 4
                                ? 'bg-rose-500/15 text-rose-300'
                                : 'bg-zinc-800 text-zinc-300'
                            }`}
                          >
                            {s.rating.toFixed(1)}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-2 align-middle text-right font-mono">
                        {predObj ? (
                          <span>
                            <span className="text-amber-300">
                              ŷ = {predObj.predictedRating.toFixed(2)}
                            </span>{' '}
                            <span className="text-zinc-500">
                              (err {predObj.residual >= 0 ? '+' : ''}
                              {predObj.residual.toFixed(2)})
                            </span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="py-2.5 px-2 align-middle text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveSample(s.id)}
                          aria-label={`Remove sample ${s.title}`}
                          className="p-1 text-zinc-500 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* STEP 2 OF LAB: Fitted Regression Coefficients & Hyperparameters */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Learned Feature Weights β */}
        <div className="lg:col-span-7 bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2 border-b border-zinc-800 pb-2.5">
            <span className="text-xs font-mono text-amber-400 uppercase font-semibold">
              2. Fitted Regression Coefficients (β) &amp; Metrics
            </span>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-emerald-300">R² = {regressionModel.rSquared}</span>
              <span className="text-zinc-400">MAE = {regressionModel.mae}</span>
              <span className="text-amber-300">Center = {regressionModel.optimalBpm} BPM</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-lg p-3 space-y-2">
              <div className="text-[11px] font-mono text-emerald-300 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Positive Drivers (β &gt; 0)</span>
              </div>
              {regressionModel.positiveDrivers.length === 0 ? (
                <p className="text-[11px] text-zinc-500">
                  Add high-rated samples (y ≥ 7) with your tags to learn positive weights.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {regressionModel.positiveDrivers.map((c) => (
                    <span
                      key={`${c.type}-${c.feature}`}
                      className="px-2 py-0.5 rounded bg-emerald-950/50 border border-emerald-500/30 text-emerald-200 text-[11px] font-mono"
                    >
                      {c.feature} (+{c.weight})
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-lg p-3 space-y-2">
              <div className="text-[11px] font-mono text-rose-300 flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5" />
                <span>Negative Repellers (β &lt; 0)</span>
              </div>
              {regressionModel.negativeRepellers.length === 0 ? (
                <p className="text-[11px] text-zinc-500">
                  Add low-rated samples (y ≤ 4) to teach the model what to avoid on YouTube.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {regressionModel.negativeRepellers.map((c) => (
                    <span
                      key={`${c.type}-${c.feature}`}
                      className="px-2 py-0.5 rounded bg-rose-950/50 border border-rose-500/30 text-rose-200 text-[11px] font-mono"
                    >
                      {c.feature} ({c.weight})
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Hyperparameter Sliders */}
        <div className="lg:col-span-5 bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <span className="text-xs font-mono text-amber-400 uppercase font-semibold flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              <span>Regression Hyperparameters</span>
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <div className="flex justify-between font-mono text-[11px]">
                <label htmlFor="reg-lambda" className="text-zinc-300">
                  L2 Ridge Regularization (λ)
                </label>
                <span className="text-amber-300">{hyperparams.regularizationLambda}</span>
              </div>
              <input
                id="reg-lambda"
                type="range"
                min={0.05}
                max={2.0}
                step={0.05}
                value={hyperparams.regularizationLambda}
                onChange={(e) =>
                  setHyperparams((prev) => ({
                    ...prev,
                    regularizationLambda: Number(e.target.value),
                  }))
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between font-mono text-[11px]">
                <label htmlFor="reg-temp" className="text-zinc-300">
                  YouTube Exploration Temperature (τ)
                </label>
                <span className="text-amber-300">{hyperparams.explorationTemperature}</span>
              </div>
              <input
                id="reg-temp"
                type="range"
                min={0.1}
                max={1.5}
                step={0.1}
                value={hyperparams.explorationTemperature}
                onChange={(e) =>
                  setHyperparams((prev) => ({
                    ...prev,
                    explorationTemperature: Number(e.target.value),
                  }))
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between font-mono text-[11px]">
                <label htmlFor="reg-neg" className="text-zinc-300">
                  Negative Sample Penalty (α)
                </label>
                <span className="text-amber-300">{hyperparams.negativePenaltyWeight}x</span>
              </div>
              <input
                id="reg-neg"
                type="range"
                min={0.5}
                max={3.0}
                step={0.25}
                value={hyperparams.negativePenaltyWeight}
                onChange={(e) =>
                  setHyperparams((prev) => ({
                    ...prev,
                    negativePenaltyWeight: Number(e.target.value),
                  }))
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* STEP 3 OF LAB: Gemini Prompt Engineering Studio */}
      <div className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
          <div>
            <span className="text-xs font-mono text-amber-400 uppercase font-semibold">
              3. Gemini Prompt Engineering Studio (Ready to Feed Samples &amp; Search YouTube)
            </span>
            <p className="text-xs text-zinc-400 mt-0.5">
              Pick a regression prompt architecture below, customize constraints, and either run it live with Gemini + YouTube Grounding or copy the compiled prompt.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowTemplateEditor((prev) => !prev)}
            className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-mono cursor-pointer whitespace-nowrap"
          >
            {showTemplateEditor ? 'Hide Raw Template Variables' : 'Edit Prompt Template Variables'}
          </button>
        </div>

        {/* 4 Prompt Preset Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {PROMPT_ENGINEERING_PRESETS.map((preset) => {
            const active = selectedPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.id)}
                className={`text-left p-3 rounded-xl border transition-colors cursor-pointer flex flex-col justify-between gap-2 ${
                  active
                    ? 'bg-amber-400/15 border-amber-400 text-zinc-100'
                    : 'bg-zinc-900/70 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-amber-300 uppercase">
                    {preset.badge}
                  </span>
                  <div className="text-xs font-semibold text-zinc-100">{preset.name}</div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    {preset.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Optional Raw Template Variable Editor */}
        {showTemplateEditor && (
          <div className="space-y-2 bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
            <label
              htmlFor="raw-prompt-template-editor"
              className="block text-[11px] font-mono text-amber-300"
            >
              Editable Prompt Template (Variables: {'{{TRAINING_SAMPLES}}'}, {'{{POSITIVE_WEIGHTS}}'}, {'{{NEGATIVE_WEIGHTS}}'}, {'{{USER_TAGS}}'}, {'{{TARGET_BPM}}'}, {'{{R_SQUARED}}'})
            </label>
            <textarea
              id="raw-prompt-template-editor"
              rows={6}
              value={customTemplateText}
              onChange={(e) => setCustomTemplateText(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-400"
            />
          </div>
        )}

        {/* Additional User Constraints Input */}
        <div className="space-y-1.5">
          <label htmlFor="extra-prompt-constraints" className="block text-xs font-medium text-zinc-300">
            Additional YouTube Search Constraints (Optional — injected into prompt)
          </label>
          <input
            id="extra-prompt-constraints"
            type="text"
            value={extraConstraints}
            onChange={(e) => setExtraConstraints(e.target.value)}
            placeholder="e.g. Focus on 1990s vinyl rips, Boiler Room sets, or tracks under 6 minutes..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-400"
          />
        </div>

        {/* Compiled Prompt Preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono text-zinc-400 flex items-center gap-1.5">
              <FileCode2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Compiled Few-Shot Regression Prompt (Ready for Gemini)</span>
            </span>
            <button
              type="button"
              onClick={handleCopyEngineeredPrompt}
              className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copiedPrompt ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied Prompt!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Engineered Prompt</span>
                </>
              )}
            </button>
          </div>

          <pre
            aria-label="Compiled Regression Prompt"
            className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3.5 text-[11px] font-mono text-amber-200/95 overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed"
          >
            {compiledPrompt}
          </pre>
        </div>

        {/* Action Bar: Run Live with Gemini + YouTube Grounding */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
          <div className="text-xs text-zinc-400 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Executes with <code className="font-mono text-emerald-300">gemini-3.8-flash</code> + live YouTube / Google Search Grounding
            </span>
          </div>

          <button
            type="button"
            onClick={handleRunEngineeredPromptWithGemini}
            disabled={isRunningGemini}
            className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 font-semibold text-xs rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            {isRunningGemini ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Running Regression Prompt on YouTube...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Run Engineered Prompt &amp; Find YouTube Music</span>
              </>
            )}
          </button>
        </div>

        {geminiError && (
          <div
            role="alert"
            className="bg-rose-950/40 border border-rose-500/40 text-rose-200 rounded-lg p-3 text-xs"
          >
            {geminiError}
          </div>
        )}

        {savedTrackFeedback && (
          <div
            role="status"
            className="bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 rounded-lg p-3 text-xs font-mono"
          >
            {savedTrackFeedback}
          </div>
        )}

        {/* Gemini Grounded YouTube Discovery Results */}
        {geminiResponse && (
          <div className="bg-zinc-900 border border-amber-400/30 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <span className="text-xs font-mono text-amber-300 font-semibold">
                YOUTUBE REGRESSION DISCOVERIES ({geminiResponse.modelUsed})
              </span>
              <span className="text-[11px] font-mono text-emerald-300">
                Grounded in Google / YouTube Search
              </span>
            </div>

            <div className="markdown-body text-xs text-zinc-200 leading-relaxed space-y-2">
              <Markdown>{geminiResponse.reply}</Markdown>
            </div>

            {geminiResponse.suggestedTracks.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <div className="text-xs font-semibold text-amber-300">
                  Discovered Tracks — Save to Crate or Feed Back into Regression Training:
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {geminiResponse.suggestedTracks.map((trk, idx) => (
                    <div
                      key={`${trk.artist}-${trk.title}-${idx}`}
                      className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 flex flex-col justify-between gap-2.5"
                    >
                      <div>
                        <div className="text-xs font-semibold text-zinc-100">
                          {trk.artist} — {trk.title}
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                          {trk.bpm ? `${trk.bpm} BPM` : ''}
                          {trk.year ? ` · ${trk.year}` : ''}
                        </div>
                        {trk.whyItMatches && (
                          <p className="text-[11px] text-zinc-400 mt-1">{trk.whyItMatches}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <a
                          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                            `${trk.artist} - ${trk.title}`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded text-[11px] inline-flex items-center gap-1"
                        >
                          YouTube <ExternalLink className="w-3 h-3" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleAddDiscoveredTrack(trk, false)}
                          className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold rounded text-[11px] cursor-pointer"
                        >
                          + Save to Crate
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddDiscoveredTrack(trk, true)}
                          className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded text-[11px] cursor-pointer"
                        >
                          + Add to Training (y=9.0)
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {geminiResponse.sources.length > 0 && (
              <div className="pt-2 border-t border-zinc-800 space-y-1.5">
                <div className="text-[11px] font-mono text-zinc-400">
                  Verified Web &amp; YouTube Sources:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {geminiResponse.sources.map((src, i) => (
                    <a
                      key={`${src.uri}-${i}`}
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 bg-zinc-950 hover:bg-zinc-800 text-emerald-300 border border-zinc-800 rounded text-[11px] inline-flex items-center gap-1"
                    >
                      <span className="truncate max-w-[220px]">{src.title}</span>
                      <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
