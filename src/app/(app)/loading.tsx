/**
 * Shown at once while an app page loads (Next.js loading convention: it
 * wraps every page in the (app) group in a Suspense boundary). A slow page —
 * offline, or a weak signal — then shows a spinner instead of looking frozen.
 */

export default function Loading() {
  return (
    <main className="mx-auto grid min-h-[50vh] max-w-6xl place-items-center px-4 sm:px-6" aria-busy="true">
      <span className="size-8 animate-spin rounded-full border-[3px] border-celadon border-t-transparent" aria-label="Loading" />
    </main>
  );
}
