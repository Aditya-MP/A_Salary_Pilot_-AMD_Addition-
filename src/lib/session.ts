/* ═══════════════════════════════════════════════════════════════════
   Session — tokens, refresh, and the authenticated fetch.

   Everything that needs to know "who is signed in" goes through here.

   THREE THINGS THIS FILE EXISTS TO GET RIGHT
   ------------------------------------------

   1. REFRESH IS SINGLE-FLIGHT. The server rotates refresh tokens and
      invalidates the old one on use. If two requests 401 at the same
      moment — which is normal, the dashboard fires several on mount —
      and each refreshes independently, the second presents a token the
      first already burned, and the user is thrown back to the login
      screen for no reason. So a refresh in progress is shared: the
      second caller awaits the first promise instead of starting one.

   2. A REFRESH FAILURE IS A LOGOUT, NOT A RETRY. If the refresh token
      is genuinely dead there is nothing to recover; retrying just
      produces a slower failure.

   3. RETRY EXACTLY ONCE. A 401 after a successful refresh means the
      request is unauthorised on its merits, not stale. Looping there
      would hammer the server forever.

   ON STORING TOKENS IN localStorage
   ---------------------------------
   Readable by any script injected into the page, so it is not what a
   bank would do — those keep the access token in memory and the refresh
   token in an HttpOnly cookie the JS never sees. That needs the API and
   the app on one origin (or credentialed CORS plus CSRF protection),
   which localhost:5173 → localhost:8087 is not. This is the deliberate,
   documented trade-off for a local dev build, and the short life of the
   access token is what limits the damage.
   ═══════════════════════════════════════════════════════════════════ */

export const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8087';

const ACCESS_KEY = 'sp.access';
const REFRESH_KEY = 'sp.refresh';
const USER_KEY = 'sp.user';

export interface SessionUser {
    user_id: string;
    email: string;
    name: string;
    created_at?: string;
}

interface TokenPair {
    access_token: string;
    refresh_token: string;
    access_expires_at: string;
}

/* ─── storage ─────────────────────────────────────────────────────── */

function read(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        // Safari in private mode throws on access rather than returning
        // null. An app that crashes on boot there is worse than one that
        // simply cannot stay signed in.
        return null;
    }
}

function write(key: string, value: string | null) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        /* storage unavailable — the session lives for this tab only */
    }
}

export function accessToken(): string | null {
    return read(ACCESS_KEY);
}

export function currentUser(): SessionUser | null {
    const raw = read(USER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as SessionUser;
    } catch {
        return null;
    }
}

export function storeTokens(t: TokenPair) {
    write(ACCESS_KEY, t.access_token);
    write(REFRESH_KEY, t.refresh_token);
}

export function storeUser(u: SessionUser) {
    write(USER_KEY, JSON.stringify(u));
}

export function clearSession() {
    write(ACCESS_KEY, null);
    write(REFRESH_KEY, null);
    write(USER_KEY, null);
}

/* ─── the single-flight refresh ───────────────────────────────────── */

let inFlight: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
    // Second and later callers get the first promise. This is the whole
    // point: one network refresh per burst of 401s.
    if (inFlight) return inFlight;

    inFlight = (async () => {
        const token = read(REFRESH_KEY);
        if (!token) return false;
        try {
            const res = await fetch(BASE + '/v1/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: token }),
            });
            if (!res.ok) {
                clearSession();
                return false;
            }
            storeTokens((await res.json()) as TokenPair);
            return true;
        } catch {
            // A network failure is not proof the session is dead — the
            // backend may simply be down. Keep the tokens so the user is
            // still signed in when it comes back.
            return false;
        } finally {
            inFlight = null;
        }
    })();

    return inFlight;
}

/* ─── the authenticated fetch ─────────────────────────────────────── */

export type Result<T> =
    | { ok: true; data: T }
    | { ok: false; error: string; offline: boolean; status: number };

/**
 * Calls the API with the access token attached, refreshing once on 401.
 * Never throws: every caller gets a result it can render.
 */
export async function authed<T>(
    path: string,
    init: RequestInit = {},
    timeoutMs = 12_000,
): Promise<Result<T>> {
    const attempt = async (): Promise<Response> => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const token = accessToken();
            return await fetch(BASE + path, {
                ...init,
                signal: ctrl.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(init.headers ?? {}),
                },
            });
        } finally {
            clearTimeout(timer);
        }
    };

    try {
        let res = await attempt();

        if (res.status === 401 && (await refresh())) {
            // Exactly one retry. A second 401 is a real authorisation
            // failure, and retrying it again would never terminate.
            res = await attempt();
        }

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            return {
                ok: false,
                error: (body as { error?: string }).error ?? `HTTP ${res.status}`,
                offline: false,
                status: res.status,
            };
        }

        // 204 No Content has no body to parse.
        if (res.status === 204) return { ok: true, data: undefined as T };
        return { ok: true, data: (await res.json()) as T };
    } catch (err) {
        const offline =
            err instanceof TypeError || (err as Error)?.name === 'AbortError';
        return {
            ok: false,
            error: offline
                ? 'Cannot reach the server'
                : ((err as Error)?.message ?? 'request failed'),
            offline,
            status: 0,
        };
    }
}

/* ─── the credential endpoints ────────────────────────────────────── */

async function credential(
    path: string,
    body: unknown,
): Promise<Result<SessionUser>> {
    let res: Response;
    try {
        res = await fetch(BASE + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch {
        return {
            ok: false,
            offline: true,
            status: 0,
            error: `Cannot reach the server. Is the API running on ${BASE}?`,
        };
    }

    if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        return {
            ok: false,
            offline: false,
            status: res.status,
            error: (b as { error?: string }).error ?? `HTTP ${res.status}`,
        };
    }

    storeTokens((await res.json()) as TokenPair);

    // Ask the server who we are rather than trusting what was typed into
    // the form — the server is the authority on the display name, and on
    // login the form never had it in the first place.
    const me = await authed<SessionUser>('/v1/me');
    if (!me.ok) {
        clearSession();
        return me;
    }
    storeUser(me.data);
    return me;
}

export function register(email: string, password: string, name: string) {
    return credential('/v1/auth/register', { email, password, name });
}

export function login(email: string, password: string) {
    return credential('/v1/auth/login', { email, password });
}

/**
 * `idToken` is the ID token Google Identity Services hands back to the
 * button's callback client-side — a JWT signed by Google, not a secret this
 * app minted. The server verifies its signature against Google's own public
 * keys before trusting anything in it (see internal/auth/google.go); this
 * function is just the HTTP call, identical in shape to login()/register().
 */
export function googleLogin(idToken: string) {
    return credential('/v1/auth/google', { id_token: idToken });
}

export async function logout() {
    // Best effort. If the server is unreachable the local tokens still go,
    // because a sign-out button that leaves you signed in is a bug no
    // matter what the network did.
    await authed('/v1/auth/logout', { method: 'POST' }, 4_000);
    clearSession();
}

/** Verifies a stored session is still real. Called once on boot. */
export async function restore(): Promise<SessionUser | null> {
    if (!accessToken() && !read(REFRESH_KEY)) return null;

    const me = await authed<SessionUser>('/v1/me', {}, 8_000);
    if (me.ok) {
        storeUser(me.data);
        return me.data;
    }
    // Offline: keep what we knew, so a dead backend does not look like a
    // logout. Rejected: the session is genuinely over.
    if (me.offline) return currentUser();
    clearSession();
    return null;
}
