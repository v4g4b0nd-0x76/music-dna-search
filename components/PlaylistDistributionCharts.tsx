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
  PieChart,
  Pie,
} from 'recharts';
import { Clock, Disc3, PieChart as PieChartIcon, BarChart2 } from 'lucide-react';
import { MusicTrack } from '@/lib/music-data';
import { computePlaylistDistribution } from '@/lib/taste-analytics';

export interface PlaylistDistributionChartsProps {
  playlistName: string;
  playlistTracks: MusicTrack[];
}

export default function PlaylistDistributionCharts({
  playlistName,
  playlistTracks,
}: PlaylistDistributionChartsProps) {
  const [durationChartMode, setDurationChartMode] = useState<'buckets' | 'tracks'>('buckets');
  const [genreChartMode, setGenreChartMode] = useState<'pie' | 'bar'>('pie');
  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setIsMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const distribution = useMemo(
    () => computePlaylistDistribution(playlistTracks),
    [playlistTracks]
  );

  return (
    <section
      aria-label="Playlist Song Duration and Genre Distribution"
      className="bg-zinc-900/70 border border-zinc-800/90 rounded-xl p-5 space-y-4"
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-amber-400/15 text-amber-300 border border-amber-400/30 rounded">
              RECHARTS PLAYLIST TELEMETRY
            </span>
            <span className="text-xs font-mono text-emerald-400">
              {playlistName} ({distribution.summary.totalTracks} tracks ·{' '}
              {distribution.summary.totalDurationFormatted})
            </span>
          </div>
          <h2 className="text-sm sm:text-base font-display font-semibold text-zinc-100 mt-1">
            Playlist Song Duration &amp; Genre Distribution — {playlistName}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Live Recharts breakdown of song lengths (duration buckets &amp; per-track runtime) and genre share across your currently generated playlist.
          </p>
        </div>
      </div>

      {/* 4-Card Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg px-3.5 py-2.5">
          <div className="text-[11px] text-zinc-400">Total Playlist Runtime</div>
          <div className="text-base font-mono tabular-nums font-semibold text-amber-400 mt-0.5">
            {distribution.summary.totalDurationFormatted}{' '}
            <span className="text-xs text-zinc-500 font-normal">
              ({distribution.summary.totalTracks} songs)
            </span>
          </div>
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg px-3.5 py-2.5">
          <div className="text-[11px] text-zinc-400">Average Song Duration</div>
          <div className="text-base font-mono tabular-nums font-semibold text-emerald-300 mt-0.5">
            {distribution.summary.avgDurationFormatted}
          </div>
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg px-3.5 py-2.5">
          <div className="text-[11px] text-zinc-400">Dominant Playlist Genre</div>
          <div className="text-sm font-semibold text-zinc-100 truncate mt-0.5">
            {distribution.summary.dominantGenre}{' '}
            <span className="text-xs font-mono text-zinc-400">
              ({distribution.summary.uniqueGenres} genres)
            </span>
          </div>
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg px-3.5 py-2.5">
          <div className="text-[11px] text-zinc-400">Duration Range (Min – Max)</div>
          <div className="text-xs font-mono tabular-nums text-amber-300 truncate mt-1">
            {distribution.summary.shortestTrack && distribution.summary.longestTrack
              ? `${distribution.summary.shortestTrack.durationFormatted} – ${distribution.summary.longestTrack.durationFormatted}`
              : '—'}
          </div>
        </div>
      </div>

      {playlistTracks.length === 0 ? (
        <div className="py-10 text-center bg-zinc-950/60 border border-zinc-800/70 rounded-xl space-y-2">
          <Disc3 className="w-7 h-7 text-zinc-600 mx-auto" />
          <p className="text-xs text-zinc-400">
            Add tracks to <strong className="text-zinc-200">{playlistName}</strong> to visualize song duration and genre distributions.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left 6 cols: Recharts Song Duration Distribution */}
          <div className="lg:col-span-6 bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  {durationChartMode === 'buckets'
                    ? 'Song Duration Distribution (Time Buckets)'
                    : 'Per-Track Duration Sequence (Minutes)'}
                </span>
              </div>

              <div
                role="tablist"
                aria-label="Duration Chart Mode"
                className="inline-flex items-center gap-1 p-0.5 bg-zinc-900 border border-zinc-800 rounded-lg text-[11px]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={durationChartMode === 'buckets'}
                  onClick={() => setDurationChartMode('buckets')}
                  className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                    durationChartMode === 'buckets'
                      ? 'bg-amber-400 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Duration Buckets
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={durationChartMode === 'tracks'}
                  onClick={() => setDurationChartMode('tracks')}
                  className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                    durationChartMode === 'tracks'
                      ? 'bg-amber-400 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Per-Track Runtime
                </button>
              </div>
            </div>

            <div className="h-56 w-full min-w-0">
              {isMounted ? (
                durationChartMode === 'buckets' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={distribution.durationBuckets}
                      margin={{ top: 8, right: 12, left: -12, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#27272a"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="shortLabel"
                        tick={{ fill: '#a1a1aa', fontSize: 11 }}
                        axisLine={{ stroke: '#3f3f46' }}
                        tickLine={{ stroke: '#3f3f46' }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: '#a1a1aa', fontSize: 11 }}
                        axisLine={{ stroke: '#3f3f46' }}
                        tickLine={{ stroke: '#3f3f46' }}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(251, 191, 36, 0.08)' }}
                        contentStyle={{
                          backgroundColor: '#09090b',
                          borderColor: '#3f3f46',
                          borderRadius: '0.5rem',
                          fontSize: '12px',
                          color: '#f4f4f5',
                        }}
                        formatter={(value, _name, props) => {
                          const payload = props.payload as {
                            bucket?: string;
                            sharePct?: number;
                            trackTitles?: string[];
                          };
                          const tracksPreview =
                            payload?.trackTitles && payload.trackTitles.length > 0
                              ? ` (${payload.trackTitles.slice(0, 2).join(', ')})`
                              : '';
                          return [
                            `${value} track(s) · ${payload?.sharePct ?? 0}%${tracksPreview}`,
                            payload?.bucket || 'Duration Bucket',
                          ];
                        }}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={42}>
                        {distribution.durationBuckets.map((entry) => (
                          <Cell
                            key={entry.bucket}
                            fill={entry.count > 0 ? '#fbbf24' : '#3f3f46'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={distribution.trackDurationSeries}
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
                        unit="m"
                        tick={{ fill: '#a1a1aa', fontSize: 11 }}
                        axisLine={{ stroke: '#3f3f46' }}
                        tickLine={{ stroke: '#3f3f46' }}
                      />
                      <YAxis
                        type="category"
                        dataKey="shortName"
                        width={125}
                        interval={0}
                        tick={{ fill: '#e4e4e7', fontSize: 11 }}
                        axisLine={{ stroke: '#3f3f46' }}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(52, 211, 153, 0.08)' }}
                        contentStyle={{
                          backgroundColor: '#09090b',
                          borderColor: '#3f3f46',
                          borderRadius: '0.5rem',
                          fontSize: '12px',
                          color: '#f4f4f5',
                        }}
                        formatter={(_val, _name, props) => {
                          const payload = props.payload as {
                            artist?: string;
                            title?: string;
                            durationFormatted?: string;
                            genre?: string;
                            bpm?: number;
                          };
                          return [
                            `${payload?.durationFormatted} · ${payload?.genre} · ${payload?.bpm} BPM`,
                            `${payload?.artist} — ${payload?.title}`,
                          ];
                        }}
                      />
                      <Bar dataKey="durationMin" radius={[0, 6, 6, 0]} maxBarSize={22}>
                        {distribution.trackDurationSeries.map((entry) => (
                          <Cell key={entry.id} fill="#34d399" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs text-zinc-400 font-mono">
                  Loading duration distribution chart...
                </div>
              )}
            </div>

            {/* Compact Bucket Legend */}
            <div className="grid grid-cols-5 gap-1.5 pt-1">
              {distribution.durationBuckets.map((b) => (
                <div
                  key={b.bucket}
                  className={`px-2 py-1.5 rounded border text-center ${
                    b.count > 0
                      ? 'bg-amber-400/10 border-amber-400/30 text-amber-200'
                      : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-500'
                  }`}
                >
                  <div className="text-[10px] font-mono">{b.shortLabel}</div>
                  <div className="text-xs font-mono font-semibold">
                    {b.count} ({b.sharePct}%)
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right 6 cols: Recharts Genre Distribution */}
          <div className="lg:col-span-6 bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                <PieChartIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Playlist Genre Distribution ({distribution.genreDistribution.length} Genres)</span>
              </div>

              <div
                role="tablist"
                aria-label="Genre Chart Mode"
                className="inline-flex items-center gap-1 p-0.5 bg-zinc-900 border border-zinc-800 rounded-lg text-[11px]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={genreChartMode === 'pie'}
                  onClick={() => setGenreChartMode('pie')}
                  className={`px-2 py-1 rounded transition-colors cursor-pointer inline-flex items-center gap-1 ${
                    genreChartMode === 'pie'
                      ? 'bg-emerald-400 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <PieChartIcon className="w-3 h-3" />
                  <span>Donut Share</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={genreChartMode === 'bar'}
                  onClick={() => setGenreChartMode('bar')}
                  className={`px-2 py-1 rounded transition-colors cursor-pointer inline-flex items-center gap-1 ${
                    genreChartMode === 'bar'
                      ? 'bg-emerald-400 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <BarChart2 className="w-3 h-3" />
                  <span>Genre Bar</span>
                </button>
              </div>
            </div>

            <div className="h-56 w-full min-w-0">
              {isMounted ? (
                genreChartMode === 'pie' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={distribution.genreDistribution}
                        dataKey="count"
                        nameKey="genre"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={80}
                        paddingAngle={3}
                      >
                        {distribution.genreDistribution.map((entry) => (
                          <Cell key={entry.genre} fill={entry.color} stroke="#09090b" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#09090b',
                          borderColor: '#3f3f46',
                          borderRadius: '0.5rem',
                          fontSize: '12px',
                          color: '#f4f4f5',
                        }}
                        formatter={(value, _name, props) => {
                          const payload = props.payload as {
                            genre?: string;
                            sharePct?: number;
                            totalDurationFormatted?: string;
                            avgBpm?: number;
                          };
                          return [
                            `${value} track(s) (${payload?.sharePct ?? 0}%) · ${payload?.totalDurationFormatted} total · ~${payload?.avgBpm} BPM`,
                            payload?.genre || 'Genre',
                          ];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={distribution.genreDistribution}
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
                        allowDecimals={false}
                        tick={{ fill: '#a1a1aa', fontSize: 11 }}
                        axisLine={{ stroke: '#3f3f46' }}
                        tickLine={{ stroke: '#3f3f46' }}
                      />
                      <YAxis
                        type="category"
                        dataKey="genre"
                        width={125}
                        interval={0}
                        tick={{ fill: '#e4e4e7', fontSize: 11 }}
                        axisLine={{ stroke: '#3f3f46' }}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(52, 211, 153, 0.08)' }}
                        contentStyle={{
                          backgroundColor: '#09090b',
                          borderColor: '#3f3f46',
                          borderRadius: '0.5rem',
                          fontSize: '12px',
                          color: '#f4f4f5',
                        }}
                        formatter={(value, _name, props) => {
                          const payload = props.payload as {
                            genre?: string;
                            sharePct?: number;
                            totalDurationFormatted?: string;
                          };
                          return [
                            `${value} track(s) (${payload?.sharePct ?? 0}%) · ${payload?.totalDurationFormatted}`,
                            payload?.genre || 'Genre',
                          ];
                        }}
                      />
                      <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={24}>
                        {distribution.genreDistribution.map((entry) => (
                          <Cell key={entry.genre} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs text-zinc-400 font-mono">
                  Loading genre distribution chart...
                </div>
              )}
            </div>

            {/* Genre Breakdown Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {distribution.genreDistribution.map((g) => (
                <div
                  key={g.genre}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900/70 border border-zinc-800 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: g.color }}
                    />
                    <span className="text-zinc-200 font-medium truncate">{g.genre}</span>
                  </div>
                  <span className="font-mono text-[11px] text-zinc-400 shrink-0">
                    {g.count} trk ({g.sharePct}%) · {g.totalDurationFormatted}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
