import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="text-xs font-mono uppercase tracking-wider text-amber-400">
        404 · CRATE NOT FOUND
      </div>
      <h1 className="text-2xl font-display font-bold text-zinc-100">
        Page Not Found
      </h1>
      <p className="text-xs sm:text-sm text-zinc-400 max-w-md">
        The requested music crate route could not be found. Return to the main 5-step CrateDig YT workbench below.
      </p>
      <Link
        href="/"
        className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold text-xs rounded-lg transition-colors"
      >
        Return to CrateDig YT Workbench
      </Link>
    </div>
  );
}
