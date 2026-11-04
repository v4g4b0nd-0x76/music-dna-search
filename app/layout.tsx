import type {Metadata} from 'next';
import { Bricolage_Grotesque, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { FavoritesProvider } from '@/context/FavoritesContext';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'CrateDig YT — Music Taste & yt-dlp Playlist Workbench',
  description: 'Analyze your YouTube music feed, discover tracks via taste algorithms and MusicBrainz/iTunes catalogs, save favorite artists/tags/categories, build playlists, and generate ready-to-run yt-dlp download scripts.',
  openGraph: {
    title: 'CrateDig YT — Music Taste & yt-dlp Playlist Workbench',
    description: 'Analyze your YouTube music feed, discover tracks via taste algorithms and MusicBrainz/iTunes catalogs, save favorite artists/tags/categories, build playlists, and generate ready-to-run yt-dlp download scripts.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CrateDig YT — Music Taste & yt-dlp Playlist Workbench',
    description: 'Analyze your YouTube music feed, discover tracks via taste algorithms and MusicBrainz/iTunes catalogs, save favorite artists/tags/categories, build playlists, and generate ready-to-run yt-dlp download scripts.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${bricolage.variable} ${jakarta.variable} ${jetbrains.variable} dark`}>
      <body suppressHydrationWarning className="bg-zinc-950 text-zinc-100 font-sans antialiased selection:bg-amber-500/30 selection:text-amber-200">
        <FavoritesProvider>
          {children}
        </FavoritesProvider>
      </body>
    </html>
  );
}
