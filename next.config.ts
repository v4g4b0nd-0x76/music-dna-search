import type {NextConfig} from 'next';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const DEFAULT_PAGES_BASE_PATH = '/music-dna-search';

function resolveGitHubPagesBasePath(): string {
  if (!isGitHubPages) return '';

  // 1. Explicit output from actions/configure-pages@v5 if non-empty
  const pagesOutputBase = (process.env.PAGES_BASE_PATH || '').trim();
  if (pagesOutputBase) {
    return pagesOutputBase === '/'
      ? ''
      : `/${pagesOutputBase.replace(/^\/+|\/+$/g, '')}`;
  }

  // 2. Auto-detect from GitHub Actions built-in GITHUB_REPOSITORY ("owner/repo", e.g. "v4g4b0nd-0x76/music-dna-search")
  const ghRepo = (process.env.GITHUB_REPOSITORY || '').trim();
  if (ghRepo.includes('/')) {
    const [owner, repo] = ghRepo.split('/');
    if (owner && repo) {
      if (repo.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
        return '';
      }
      return `/${repo}`;
    }
  }

  // 3. Fallback to NEXT_PUBLIC_BASE_PATH or default '/music-dna-search' for exported static sites
  const rawBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || DEFAULT_PAGES_BASE_PATH).trim();
  if (!rawBasePath || rawBasePath === '/') return '';
  return `/${rawBasePath.replace(/^\/+|\/+$/g, '')}`;
}

const normalizedBasePath = resolveGitHubPagesBasePath();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allow access to remote image placeholder.
  images: {
    ...(isGitHubPages ? {unoptimized: true} : {}),
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
    ],
  },
  output: isGitHubPages ? 'export' : 'standalone',
  ...(isGitHubPages && normalizedBasePath
    ? {
        basePath: normalizedBasePath,
        assetPrefix: normalizedBasePath,
      }
    : {}),
  transpilePackages: ['motion'],
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;


