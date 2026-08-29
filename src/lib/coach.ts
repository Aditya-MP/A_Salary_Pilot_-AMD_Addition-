import { authed, type Result } from './session';

/* ═══════════════════════════════════════════════════════════════════
   AI Coach client.

   WHY THIS REPLACES src/services/gemini.ts
   -------------------------------------------
   The previous version called Google's Gemini API directly from the
   browser, reading the key from `VITE_GEMINI_API_KEY`. Vite inlines any
   VITE_-prefixed variable into the built JS bundle at compile time — so
   that key shipped to every visitor's browser in plain text, sitting in
   the network tab and the bundle source for anyone to take. Harmless
   while nothing was hosted; a live, billable, trivially-stolen key the
   moment it is.

   The key now lives only in backend/.env, read once by the Go process
   at boot (internal/gemini), and never crosses the network to a
   browser. This file just calls that.
   ═══════════════════════════════════════════════════════════════════ */

export function getCoachAdvice(context: string): Promise<Result<{ advice: string }>> {
    // Explicit, generous timeout: the Go API's own Gemini client allows up
    // to 20s for generation (see internal/gemini.New's comment), plus
    // whatever a cold Render free-tier instance adds on top. The default
    // 12s here would abort and show "Cannot reach the server" - a raw
    // network error - before the backend ever gets to answer, or to
    // return its own clean "not configured"/"unavailable" message.
    return authed<{ advice: string }>('/v1/coach', {
        method: 'POST',
        body: JSON.stringify({ context }),
    }, 25_000);
}
