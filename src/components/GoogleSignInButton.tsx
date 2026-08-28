import { useEffect, useRef, useState } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   Google Sign-In button.

   Google Identity Services (GIS), not a full OAuth redirect dance and
   not a heavyweight SDK — one script tag, one JS object, and a button
   Google itself renders and styles so it always looks like a real
   Google button (a hand-styled imitation is exactly the kind of thing
   phishing pages do, and would train users to trust the wrong thing).

   ON MISSING CONFIGURATION
   -------------------------
   VITE_GOOGLE_CLIENT_ID is not a secret — Google's Web Client ID is
   designed to sit in frontend JS, unlike the Gemini key mistake this
   project already fixed once (see internal/gemini's doc comment). But
   it still needs to exist for this to work, and when it doesn't this
   component renders nothing rather than a broken button — password
   sign-in still works either way, exactly like the backend degrading
   to local-only agents when GEMINI_API_KEY is unset.

   THE TOKEN THIS PRODUCES IS NOT TRUSTED HERE
   ---------------------------------------------
   `onToken` receives Google's signed ID token as-is. This component
   does not decode it, does not read the email out of it, does not
   make any decision based on its contents — that would mean trusting
   a JWT the browser cannot verify. The server verifies the signature
   against Google's own public keys before anything in the token is
   acted on (internal/auth/google.go); this is just the delivery.
   ═══════════════════════════════════════════════════════════════════ */

// The bare minimum of Google Identity Services' surface this file uses —
// not a full type-cover of the SDK, just what's actually called.
interface GoogleCredentialResponse {
    credential: string;
}

interface GoogleAccountsID {
    initialize: (config: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
    }) => void;
    renderButton: (
        parent: HTMLElement,
        options: { theme: string; size: string; width: number; text: string },
    ) => void;
}

declare global {
    interface Window {
        google?: { accounts: { id: GoogleAccountsID } };
    }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let scriptLoad: Promise<void> | null = null;

/** Loads the GIS script once no matter how many times this is called —
    every page mount would otherwise inject a fresh <script> tag. */
function loadGoogleScript(): Promise<void> {
    if (scriptLoad) return scriptLoad;
    scriptLoad = new Promise((resolve, reject) => {
        if (window.google?.accounts?.id) {
            resolve();
            return;
        }
        const el = document.createElement('script');
        el.src = SCRIPT_SRC;
        el.async = true;
        el.onload = () => resolve();
        el.onerror = () => reject(new Error('failed to load Google Sign-In'));
        document.head.appendChild(el);
    });
    return scriptLoad;
}

export function GoogleSignInButton({
    onToken,
    disabled,
}: {
    onToken: (idToken: string) => void;
    disabled?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!CLIENT_ID || !ref.current) return;
        let cancelled = false;

        loadGoogleScript()
            .then(() => {
                if (cancelled || !ref.current || !window.google) return;
                window.google.accounts.id.initialize({
                    client_id: CLIENT_ID,
                    callback: (response) => onToken(response.credential),
                });
                window.google.accounts.id.renderButton(ref.current, {
                    theme: 'outline',
                    size: 'large',
                    width: 340,
                    text: 'continue_with',
                });
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });

        return () => {
            cancelled = true;
        };
        // onToken is a store action, stable across renders — re-running
        // this on every render would re-inject the button repeatedly.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!CLIENT_ID || failed) return null;

    return (
        <div
            ref={ref}
            aria-label="Sign in with Google"
            style={{
                opacity: disabled ? 0.5 : 1,
                pointerEvents: disabled ? 'none' : 'auto',
                display: 'flex',
                justifyContent: 'center',
            }}
        />
    );
}
