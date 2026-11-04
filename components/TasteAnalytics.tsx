'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { BarChart3, Sparkles, Disc3 } from 'lucide-react';
import { MusicTrack, CURATED_CATALOG } from '@/lib/music-data';
import { computeTasteAnalytics } from '@/lib/taste-analytics';
import { useFavorites } from '@/context/FavoritesContext';

export interface TasteAnalyticsProps {
  catalogTracks?: MusicTrack[];
}

export default function TasteAnalytics({
  catalogTracks = CURATED_CATALOG,
}: TasteAnalyticsProps) {
  const {
    favoriteArtists,
    favoriteTags,
    favoriteCategories,
    toggleFavoriteArtist,
    toggleFavoriteTag,
    toggleFavoriteCategory,
  } = useFavorites();

  const [activeChartTab, setActiveChartTab] = useState<'artists' | 'tags' | 'categories'>(
    'artists'
  );
  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const analytics = useMemo(() => {
    return computeTasteAnalytics(
      {
        favoriteArtists,
        favoriteTags,
        favoriteCategories,
      },
      catalogTracks
    );
  }, [favoriteArtists, favoriteTags, favoriteCategories, catalogTracks]);

  const barChartData = useMemo(() => {
    const truncateAxisLabel = (label: string) =>
      label.length > 16 ? `${label.slice(0, 15)}…` : label;

    if (activeChartTab === 'artists') {
      return analytics.artistSeries.map((a) => ({
        name: a.name,
        axisLabel: truncateAxisLabel(a.name),
        rawKey: a.name,
        value: a.affinityScore,
        meta: `${a.catalogTracks} trk · ${a.avgBpm} BPM`,
        isFavorite: a.isFavorite,
      }));
    }
    if (activeChartTab === 'tags') {
      return analytics.tagSeries.map((t) => ({
        name: t.label,
        axisLabel: truncateAxisLabel(t.label),
        rawKey: t.tag,
        value: t.weight,
        meta: `${t.trackCount} catalog tracks`,
        isFavorite: t.isFavorite,
      }));
    }
    return analytics.categorySeries.map((c) => ({
      name: c.category,
      axisLabel: truncateAxisLabel(c.category),
      rawKey: c.category,
      value: c.score,
      meta: `${c.sharePct}% share · ${c.trackCount} trk`,
      isFavorite: c.isFavorite,
    }));
  }, [activeChartTab, analytics]);

  const handleToggleItemFromChart = (rawKey: string) => {
    if (activeChartTab === 'artists') {
      toggleFavoriteArtist(rawKey);
    } else if (activeChartTab === 'tags') {
      toggleFavoriteTag(rawKey);
    } else {
      toggleFavoriteCategory(rawKey);
    }
  };

  return (
    <section
      aria-label="TasteAnalytics Visualization"
      className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 space-y-4"
    >
      {/* Header & Top Metrics Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800 pb-3.5">
        <div>
          <h2 className="text-sm font-display font-semibold text-zinc-100 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-amber-400 shrink-0" />
            <span>TasteAnalytics — Live Favorites &amp; Sonic Affinity Visualization</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Visualizes artist popularity, tag weights, and genre distribution from{' '}
            <code className="font-mono text-zinc-300">FavoritesContext</code>. Click any signal below to toggle favorites and recalibrate charts in real time.
          </p>
        </div>

        {/* Chart Dimension Switcher */}
        <div
          role="tablist"
          aria-label="Taste Analytics Chart Mode"
          className="inline-flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-lg self-start shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeChartTab === 'artists'}
            onClick={() => setActiveChartTab('artists')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              activeChartTab === 'artists'
                ? 'bg-amber-400 text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Artist Popularity ({favoriteArtists.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeChartTab === 'tags'}
            onClick={() => setActiveChartTab('tags')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              activeChartTab === 'tags'
                ? 'bg-amber-400 text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Favorite Tags ({favoriteTags.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeChartTab === 'categories'}
            onClick={() => setActiveChartTab('categories')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              activeChartTab === 'categories'
                ? 'bg-amber-400 text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Genre Share ({favoriteCategories.length})
          </button>
        </div>
      </div>

      {/* Summary Telemetry Row (Max 4 cells, <= 2 data points per cell) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg px-3.5 py-2.5">
          <div className="text-[11px] text-zinc-400">Active Favorite Signals</div>
          <div className="text-base font-mono tabular-nums font-semibold text-amber-400 mt-0.5">
            {analytics.summary.totalFavoriteSignals} signals
          </div>
        </div>
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg px-3.5 py-2.5">
          <div className="text-[11px] text-zinc-400">Lead Genre Affinity</div>
          <div className="text-sm font-semibold text-emerald-300 truncate mt-0.5">
            {analytics.summary.topCategory}
          </div>
        </div>
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg px-3.5 py-2.5">
          <div className="text-[11px] text-zinc-400">Top Ranked Artist</div>
          <div className="text-sm font-semibold text-zinc-100 truncate mt-0.5">
            {analytics.summary.topArtist}
          </div>
        </div>
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg px-3.5 py-2.5">
          <div className="text-[11px] text-zinc-400">Dominant Tag &amp; Tempo</div>
          <div className="text-sm font-mono tabular-nums font-semibold text-amber-300 truncate mt-0.5">
            {analytics.summary.topTag} · {analytics.summary.avgFavoriteBpm} BPM
          </div>
        </div>
      </div>

      {/* Two-Column Recharts Visualization Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Primary BarChart (Artist Popularity / Tag Weights / Genre Share) */}
        <div className="lg:col-span-7 bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-200">
              {activeChartTab === 'artists'
                ? 'Artist Popularity & Affinity Index'
                : activeChartTab === 'tags'
                ? 'Sonic Tag Weight Distribution'
                : 'Genre / Category Affinity Score'}
            </span>
            <div className="flex items-center gap-3 text-[11px] text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />
                <span>Favorited ★</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-zinc-600 inline-block" />
                <span>Catalog Baseline</span>
              </span>
            </div>
          </div>

          <div className="h-56 w-full min-w-0">
            {isMounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 18, left: 8, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#27272a"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fill: '#a1a1aa', fontSize: 11 }}
                    axisLine={{ stroke: '#3f3f46' }}
                    tickLine={{ stroke: '#3f3f46' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="axisLabel"
                    width={125}
                    interval={0}
                    tick={({ x, y, payload }) => (
                      <text
                        x={x}
                        y={y}
                        dy={4}
                        textAnchor="end"
                        fill="#e4e4e7"
                        fontSize={11}
                      >
                        {payload?.value}
                      </text>
                    )}
                    axisLine={{ stroke: '#3f3f46' }}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(251, 191, 36, 0.08)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const item = payload[0].payload;
                      return (
                        <div className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-lg space-y-1">
                          <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                            <span>{item.name}</span>
                            {item.isFavorite && (
                              <span className="text-amber-400">★ Favorite</span>
                            )}
                          </div>
                          <div className="font-mono text-amber-300">
                            Affinity Score: {item.value} / 100
                          </div>
                          <div className="text-zinc-400 text-[11px]">{item.meta}</div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="value"
                    radius={[0, 4, 4, 0]}
                    barSize={18}
                    onClick={(data) => {
                      const record = data as unknown as {
                        rawKey?: string;
                        payload?: { rawKey?: string };
                      };
                      const key = record?.payload?.rawKey || record?.rawKey;
                      if (key) {
                        handleToggleItemFromChart(String(key));
                      }
                    }}
                    className="cursor-pointer"
                  >
                    {barChartData.map((entry) => (
                      <Cell
                        key={entry.rawKey}
                        fill={entry.isFavorite ? '#fbbf24' : '#52525b'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-xs text-zinc-500 font-mono">
                Initializing Recharts telemetry...
              </div>
            )}
          </div>

          {/* Interactive Signal Toggle Strip */}
          <div className="pt-2 border-t border-zinc-800/80 flex items-center flex-wrap gap-1.5 text-xs">
            <span className="text-[11px] text-zinc-400 mr-1">
              Toggle {activeChartTab === 'artists' ? 'Artist' : activeChartTab === 'tags' ? 'Tag' : 'Genre'}:
            </span>
            {barChartData.map((item) => (
              <button
                key={item.rawKey}
                type="button"
                onClick={() => handleToggleItemFromChart(item.rawKey)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  item.isFavorite
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800'
                }`}
              >
                {item.name} ({item.value}) {item.isFavorite ? '★' : '☆'}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Genre RadarChart & Category Share Breakdown */}
        <div className="lg:col-span-5 bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
              <Disc3 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Genre &amp; Category DNA Radar</span>
            </span>
            <span className="font-mono text-[11px] text-zinc-400">
              {analytics.categorySeries.length} sonic axes
            </span>
          </div>

          <div className="h-44 w-full min-w-0">
            {isMounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  cx="50%"
                  cy="50%"
                  outerRadius="72%"
                  data={analytics.categorySeries}
                >
                  <PolarGrid stroke="#27272a" />
                  <PolarAngleAxis
                    dataKey="category"
                    tick={{ fill: '#d4d4d8', fontSize: 10 }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={false}
                    axisLine={false}
                  />
                  <Radar
                    name="Genre Affinity"
                    dataKey="score"
                    stroke="#34d399"
                    fill="#34d399"
                    fillOpacity={0.28}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const cat = payload[0].payload;
                      return (
                        <div className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-lg">
                          <div className="font-semibold text-emerald-300">
                            {cat.category} {cat.isFavorite ? '★' : ''}
                          </div>
                          <div className="font-mono text-zinc-200">
                            Score: {cat.score} · Share: {cat.sharePct}%
                          </div>
                        </div>
                      );
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-xs text-zinc-500 font-mono">
                Loading Radar...
              </div>
            )}
          </div>

          {/* Interactive Category Distribution List */}
          <div className="space-y-1.5 pt-2 border-t border-zinc-800/80">
            {analytics.categorySeries.slice(0, 5).map((cat) => (
              <div
                key={cat.category}
                className="flex items-center justify-between text-xs"
              >
                <button
                  type="button"
                  onClick={() => toggleFavoriteCategory(cat.category)}
                  className={`transition-colors cursor-pointer truncate font-medium ${
                    cat.isFavorite
                      ? 'text-emerald-300'
                      : 'text-zinc-300 hover:text-emerald-300'
                  }`}
                >
                  {cat.category} {cat.isFavorite ? '★' : '☆'}
                </button>
                <span className="font-mono tabular-nums text-[11px] text-zinc-400 shrink-0">
                  {cat.sharePct}% ({cat.score} pts)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
