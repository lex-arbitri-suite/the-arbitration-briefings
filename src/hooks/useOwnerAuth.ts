/**
 * useOwnerAuth.ts
 *
 * Determines whether the current session belongs to the application owner.
 *
 * On localhost (development mode), the forced-owner bypass is used by
 * default — this avoids requiring a Google Sign-In on every local run.
 * When VITE_DEV_REAL_AUTH === 'true', dev uses the real Firebase auth path.
 *
 * On the live site, the hook listens to Firebase Authentication state and
 * compares the authenticated user's UID against the owner UID stored in
 * the environment variable VITE_OWNER_UID.
 *
 * This replaces the previous localStorage/VITE_ADMIN_TOKEN mechanism,
 * which was machine-specific and trivially bypassable.
 */

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

const OWNER_UID = import.meta.env.VITE_OWNER_UID as string | undefined;
const IS_DEV = import.meta.env.DEV;
const DEV_REAL_AUTH = import.meta.env.VITE_DEV_REAL_AUTH === 'true';
const USE_DEV_BYPASS = IS_DEV && !DEV_REAL_AUTH;

/**
 * Returns { isOwner, authLoading, uid }.
 *
 * isOwner: true if the current session belongs to the application owner.
 * authLoading: true while Firebase Authentication state is being resolved.
 * uid: the authenticated user's Firebase UID, tracked reactively with auth state.
 * Exported but not used to gate the top-level render — the app renders
 * immediately in visitor mode and transitions to owner mode once the
 * auth state resolves.
 *
 * Production auth misclassification is observable: missing or empty
 * VITE_OWNER_UID is logged via console.error, while configured UID
 * mismatch is logged via console.warn.
 */
export function useOwnerAuth(): { isOwner: boolean; authLoading: boolean; uid: string | null } {
  const [isOwner, setIsOwner] = useState<boolean>(USE_DEV_BYPASS);
  const [authLoading, setAuthLoading] = useState<boolean>(!USE_DEV_BYPASS);
  const [uid, setUid] = useState<string | null>(USE_DEV_BYPASS ? OWNER_UID ?? null : null);

  useEffect(() => {
    /* On the dev bypass path, skip the Firebase check entirely. */
    if (USE_DEV_BYPASS) {
      setIsOwner(true);
      setUid(OWNER_UID ?? null);
      setAuthLoading(false);
      return;
    }

    /**
     * onAuthStateChanged fires once on page load with the current auth
     * state, and again whenever the state changes (sign-in or sign-out).
     * Returns an unsubscribe function used for cleanup.
     */
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      const configuredOwnerUid = OWNER_UID?.trim();

      if (!user) {
        setIsOwner(false);
        setAuthLoading(false);
        return;
      }

      if (!configuredOwnerUid) {
        console.error(
          'useOwnerAuth: VITE_OWNER_UID is missing or empty in the production build; authenticated user is being treated as a visitor.',
        );
        setIsOwner(false);
        setAuthLoading(false);
        return;
      }

      if (user.uid === configuredOwnerUid) {
        setIsOwner(true);
        setAuthLoading(false);
        return;
      }

      console.warn(
        `useOwnerAuth: authenticated UID does not match configured OWNER_UID; user is being treated as a visitor. configured OWNER_UID=${configuredOwnerUid}; authenticated UID=${user.uid}`,
      );
      setIsOwner(false);
      setAuthLoading(false);
    });

    /* Cancel the listener when the component unmounts. */
    return unsubscribe;
  }, []);

  return { isOwner, authLoading, uid };
}
