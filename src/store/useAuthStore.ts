import { create } from 'zustand';
import {
    login as apiLogin,
    register as apiRegister,
    googleLogin as apiGoogleLogin,
    logout as apiLogout,
    restore as apiRestore,
    currentUser,
    type SessionUser,
} from '../lib/session';
import { applyIdentity, bindStorageToUser, useAppStore } from './useAppStore';
import { useWalletStore } from './useWalletStore';

/* ═══════════════════════════════════════════════════════════════════
   Who is signed in.

   Deliberately NOT part of useAppStore, and deliberately not persisted
   by zustand. The session lives in lib/session.ts next to the tokens it
   belongs with; this store is the React-facing view of it.

   THE ISOLATION BUG THIS EXISTS TO CLOSE
   --------------------------------------
   The app persists its financial profile to a single localStorage key.
   With a real login that is a data leak on any shared machine: A signs
   out, B signs in, and B is looking at A's salary, debts, and holdings —
   the store simply rehydrates whatever was in the key. Worse, B then
   edits it, and A gets B's numbers back on their next visit.

   So the storage key is namespaced by user id, and switching users
   rebinds it before any screen renders. See bindStorageToUser.
   ═══════════════════════════════════════════════════════════════════ */

type Status = 'checking' | 'authenticated' | 'anonymous';

interface AuthState {
    status: Status;
    user: SessionUser | null;
    /** Message from the last failed credential attempt, for the form. */
    error: string | null;
    busy: boolean;

    boot: () => Promise<void>;
    signIn: (email: string, password: string) => Promise<boolean>;
    signUp: (email: string, password: string, name: string) => Promise<boolean>;
    /** Same account whether this is someone's first Google sign-in or
        their hundredth — there is no separate "register with Google". */
    signInWithGoogle: (idToken: string) => Promise<boolean>;
    signOut: () => Promise<void>;
    clearError: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
    // 'checking' rather than 'anonymous', so the router shows nothing
    // instead of flashing the login page for the moment it takes to
    // verify a session that is perfectly valid.
    status: 'checking',
    user: null,
    error: null,
    busy: false,

    boot: async () => {
        // Bind storage optimistically from the cached user so the first
        // paint reads the right namespace even before /v1/me answers.
        const cached = currentUser();
        if (cached) await bindStorageToUser(cached.user_id);

        const user = await apiRestore();
        if (user) {
            await bindStorageToUser(user.user_id);
            applyIdentity(user);
            set({ status: 'authenticated', user });
        } else {
            await bindStorageToUser(null);
            set({ status: 'anonymous', user: null });
        }
    },

    signIn: async (email, password) => {
        set({ busy: true, error: null });
        const res = await apiLogin(email, password);
        if (!res.ok) {
            set({ busy: false, error: res.error });
            return false;
        }
        // Rebind BEFORE marking authenticated. If this ran after, the
        // dashboard would render one frame against the previous user's
        // data — the exact leak this store exists to prevent.
        await bindStorageToUser(res.data.user_id);
        applyIdentity(res.data);
        set({ busy: false, status: 'authenticated', user: res.data });
        return true;
    },

    signUp: async (email, password, name) => {
        set({ busy: true, error: null });
        const res = await apiRegister(email, password, name);
        if (!res.ok) {
            set({ busy: false, error: res.error });
            return false;
        }
        await bindStorageToUser(res.data.user_id);
        applyIdentity(res.data);
        set({ busy: false, status: 'authenticated', user: res.data });
        return true;
    },

    signInWithGoogle: async (idToken) => {
        set({ busy: true, error: null });
        const res = await apiGoogleLogin(idToken);
        if (!res.ok) {
            set({ busy: false, error: res.error });
            return false;
        }
        // Same rebind-before-authenticated ordering as signIn/signUp above,
        // and for the same reason.
        await bindStorageToUser(res.data.user_id);
        applyIdentity(res.data);
        set({ busy: false, status: 'authenticated', user: res.data });
        return true;
    },

    signOut: async () => {
        set({ busy: true });
        await apiLogout();
        // Unbind, but do not delete. The user's data stays under their own
        // key so signing back in restores it — a sign-out that quietly
        // destroys months of tracking is not a sign-out.
        await bindStorageToUser(null);
        useAppStore.getState().logout();
        // The wallet lives on the server and is never persisted here, but
        // the in-memory copy would otherwise still be on screen for the
        // next person to sign in on this machine.
        useWalletStore.getState().clear();
        set({ busy: false, status: 'anonymous', user: null, error: null });
    },

    clearError: () => set({ error: null }),
}));
