/**
 * Recover from a stale build instead of crashing.
 *
 * The app is code split, so every route is its own .js chunk whose filename
 * carries a content hash. Deploying replaces those filenames. A browser tab
 * that was open across a deploy still holds the OLD index.html, so the moment
 * you change tab it asks for a chunk that no longer exists.
 *
 * Vercel's SPA rewrite then answers that missing .js with index.html, 200 OK,
 * content-type text/html. The browser refuses to execute HTML as a module and
 * throws "'text/html' is not a valid JavaScript MIME type", which lands in the
 * ErrorBoundary as a full "App crashed" screen. Nothing is actually broken:
 * the tab is simply out of date.
 *
 * The right response is to reload, which fetches the current index.html and
 * the chunk names that go with it. The guard below makes sure that can only
 * happen once in a while, so a genuinely broken deploy fails visibly rather
 * than trapping the app in a reload loop.
 */

const LAST_RELOAD_KEY = 'brightly:chunk-reload-at';
const MIN_GAP_MS = 60_000;

const STALE_CHUNK_PATTERNS = [
  'is not a valid javascript mime type',
  'failed to fetch dynamically imported module',
  'importing a module script failed',
  'error loading dynamically imported module',
  'unexpected token \'<\'',
];

/** True when this error is a tab running against a build that no longer exists. */
export function isStaleChunkError(error: unknown): boolean {
  const message = String(
    (error as any)?.message ?? (error as any)?.reason?.message ?? error ?? '',
  ).toLowerCase();
  return STALE_CHUNK_PATTERNS.some((p) => message.includes(p));
}

/** Reload at most once per minute. Returns whether a reload was started. */
export function reloadForStaleChunk(reason: string): boolean {
  try {
    const last = Number(sessionStorage.getItem(LAST_RELOAD_KEY) || 0);
    if (Date.now() - last < MIN_GAP_MS) {
      console.error('Stale chunk again within a minute, not reloading:', reason);
      return false;
    }
    sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()));
  } catch {
    // Private mode or blocked storage. Reloading once is still better than
    // showing a crash screen, and without storage we cannot loop-guard.
  }
  console.warn('New version deployed, reloading:', reason);
  window.location.reload();
  return true;
}

/** Wire up the global listeners. Call once, as early as possible. */
export function installChunkRecovery() {
  // Vite fires this when its preload helper cannot load a chunk.
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    reloadForStaleChunk('vite:preloadError');
  });

  // A lazy() import that rejects outside Vite's helper surfaces here.
  window.addEventListener('unhandledrejection', (event) => {
    if (isStaleChunkError(event.reason)) {
      event.preventDefault();
      reloadForStaleChunk('unhandled rejection');
    }
  });

  window.addEventListener('error', (event) => {
    if (isStaleChunkError(event.error || event.message)) {
      reloadForStaleChunk('window error');
    }
  });
}
