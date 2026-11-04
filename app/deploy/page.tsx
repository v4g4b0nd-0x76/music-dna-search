import React from 'react';
import Link from 'next/link';
import { ArrowLeft, FolderGit2 } from 'lucide-react';
import { FavoritesProvider } from '@/context/FavoritesContext';
import GitHubPagesDeployer from '@/components/GitHubPagesDeployer';

export default function DeployPage() {
  return (
    <FavoritesProvider>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
        <header className="sticky top-0 z-30 bg-zinc-950/95 backdrop-blur border-b border-zinc-800/80 px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-lg font-display font-bold tracking-tight text-zinc-100 hover:text-amber-300 transition-colors"
            >
              CrateDig YT
            </Link>
            <span className="text-zinc-700">/</span>
            <span className="text-xs font-mono text-amber-400 flex items-center gap-1.5">
              <FolderGit2 className="w-3.5 h-3.5" />
              <span>GitHub Remote &amp; Pages CI/CD Auto-Deploy</span>
            </span>
          </div>

          <Link
            href="/"
            className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Music Workbench</span>
          </Link>
        </header>

        <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-display font-bold text-zinc-100">
              GitHub Remote &amp; Pages CI/CD Auto-Deploy
            </h1>
            <p className="text-sm text-zinc-400">
              Connect your GitHub repository remote, generate <code className="font-mono text-amber-300">.github/workflows/deploy-pages.yml</code>, and deploy your music taste workbench to GitHub Pages automatically.
            </p>
          </div>

          <GitHubPagesDeployer />
        </main>
      </div>
    </FavoritesProvider>
  );
}
