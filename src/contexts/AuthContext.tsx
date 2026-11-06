/**
 * Authentication Context
 *
 * Manages user authentication, encryption key handling, password setup and
 * password changes. The only writer of the stored credentials; setup also
 * reads them (credentialsStorage.ts) to see whether another tab came first.
 */

import {
  createContext,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { verifyPassword, getEncryptionKey, type StoredCredentials } from '@data/encryption';
import {
  createCredentialsV2,
  isCredentialsV1,
  isCredentialsV2,
  isLaterLock,
  keyMatchesCredentials,
  rewrapCredentials,
  unlockV2,
  type StoredCredentialsV2,
} from '@data/encryption/keyWrapping';
import { createEncryptedDb } from '@data/db';
import { clearStoredDataButSetAside } from '@data/db/storedRows';
import { clearLocalHemoIOStorage } from '@data/storage/browserStorage';
import { FOLDER_SYNC_LOCK, SETUP_LOCK, withLocks } from '@/utils/locks';
import { withWebLock } from '@/utils/withWebLock';
import { reloadPage } from '@/utils/reloadPage';
import {
  CREDENTIALS_STORAGE_KEY,
  loadStoredCredentials,
  mayChangeCredentials,
} from './credentialsStorage';
import { logFailure } from '@/utils/logFailure';

export type AuthStatus = 'loading' | 'needs_setup' | 'locked' | 'unlocked';

/**
 * How a setup ended: new credentials, or those another tab saved first,
 * which this password opened or did not
 */
export type SetupOutcome = 'created' | 'unlocked-existing' | 'existing-locked';

export type ChangePasswordResult =
  { ok: true } | { ok: false; reason: 'wrong_password' | 'same_password' | 'failed' };

export interface AuthContextValue {
  status: AuthStatus;
  encryptionKey: CryptoKey | null;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  /**
   * Creates credentials, runs `prepare` with the session key (to store what
   * setup collected, encrypted), then unlocks: the app starts with it all.
   * If another tab saved credentials first, tries this password on those
   * instead and never runs `prepare`: that tab's setup stored its choices.
   */
  setupPassword: (
    password: string,
    prepare?: (key: CryptoKey) => Promise<void>
  ) => Promise<SetupOutcome>;
  /**
   * Sets up from a folder copy: saves the copy's password lock as the
   * credentials, keeping its password, and unlocks with the data key it
   * wraps. Records are settled against that key before `prepare` runs (to
   * restore the copy), so it sees only rows the key opens. `onSaved` runs
   * right after the lock is saved, before the sweep: what must hold even if
   * the page reloads before the restore (the folder choice). If another tab
   * saved credentials first, stores nothing and goes to the login screen.
   */
  recoverFromFolder: (
    lock: StoredCredentialsV2,
    key: CryptoKey,
    prepare?: (key: CryptoKey) => Promise<void>,
    onSaved?: () => Promise<void>
  ) => Promise<SetupOutcome>;
  /** Re-wraps the data key under a new password; never throws */
  changePassword: (current: string, next: string) => Promise<ChangePasswordResult>;
  isSetupComplete: () => boolean;
  /** This browser's stored credentials, the lock kept beside the folder copy; null unless v2 */
  storedLock: StoredCredentialsV2 | null;
  /**
   * Saves a lock found beside the folder copy as the stored credentials when
   * it is later than theirs (a password changed on another computer), keeping
   * the session key: the next unlock needs that password. Whether it did.
   */
  adoptFolderLock: (lock: StoredCredentialsV2) => boolean;
  /**
   * Deletes this browser's HemoIO data and returns to first run: the key
   * leaves memory at once, then, once any folder sync in flight is done,
   * every table but the rows set aside, and every HemoIO key in
   * localStorage, are cleared. The rows set aside stay for setup, which
   * offers to recover, keep or clear them. Never
   * touches the folder. Then the page reloads, whatever the outcome, so no
   * state of the old setup stays in memory; a failure is logged first, and
   * setup finds what is left.
   */
  startOver: () => Promise<void>;
  /** From the moment startOver begins until the page reloads */
  startingOver: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export { AuthContext };

interface AuthProviderProps {
  children: ReactNode;
}

const FAILED: ChangePasswordResult = { ok: false, reason: 'failed' };

function saveStoredCredentials(credentials: object): void {
  localStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
}

/**
 * Move the records this key cannot open aside, and return those that now
 * open, before the app reads any. A failure leaves them where they are,
 * skipped as before, and does not stop the unlock.
 */
async function settleStoredRecords(key: CryptoKey): Promise<void> {
  try {
    await createEncryptedDb(key).settleUnreadable();
  } catch {
    // Not logged with the error, which could name stored data
    logFailure('Could not check stored records against this key');
  }
}

/**
 * v1 credentials as v2, wrapping the same data key under the same password,
 * saved unless another tab changed them meanwhile. Null when they were not
 * saved: the v1 credentials stay, and still unlock.
 */
async function convertToV2(
  password: string,
  v1: StoredCredentials,
  key: CryptoKey,
  holdsSetupLock: boolean
): Promise<StoredCredentialsV2 | null> {
  try {
    const rewrapped = await rewrapCredentials(password, password, v1);
    // Never store credentials that would not unlock the key the data uses
    if (!rewrapped || !(await keyMatchesCredentials(key, password, rewrapped.credentials))) {
      return null;
    }
    const save = async (): Promise<StoredCredentialsV2 | null> => {
      // Another tab may have converted them, or changed the password, meanwhile
      if (JSON.stringify(loadStoredCredentials()) !== JSON.stringify(v1)) return null;
      saveStoredCredentials(rewrapped.credentials);
      return rewrapped.credentials;
    };
    return await (holdsSetupLock ? save() : withWebLock(SETUP_LOCK, save));
  } catch {
    // Fixed text: never the error, which could carry key material
    logFailure('Could not move the credentials to the current format');
    return null;
  }
}

/** The session key, or null for a wrong password or unreadable credentials */
async function unlockCredentials(password: string, credentials: object): Promise<CryptoKey | null> {
  if (isCredentialsV2(credentials)) {
    return unlockV2(password, credentials);
  }
  if (isCredentialsV1(credentials)) {
    return (await verifyPassword(password, credentials))
      ? getEncryptionKey(password, credentials)
      : null;
  }
  return null;
}

export function AuthProvider({ children }: AuthProviderProps): ReactNode {
  const storedCreds = loadStoredCredentials();

  const [status, setStatus] = useState<AuthStatus>(storedCreds ? 'locked' : 'needs_setup');
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [credentials, setCredentials] = useState<object | null>(storedCreds);
  const [startingOver, setStartingOver] = useState(false);
  // Read by the storage listener, which is registered once. Updated as the
  // status is committed, not after paint: a storage event handled in between
  // would otherwise see the status before
  const statusRef = useRef(status);
  useLayoutEffect(() => {
    statusRef.current = status;
  }, [status]);

  const isSetupComplete = useCallback((): boolean => {
    return credentials !== null || loadStoredCredentials() !== null;
  }, [credentials]);

  /**
   * Unlocks with these credentials; false for a wrong password or unreadable
   * credentials. v1 credentials are moved to v2 first, so the folder copy can
   * carry a lock; `holdsSetupLock` when the caller holds it already.
   */
  const unlockWith = useCallback(
    async (password: string, storedCreds: object, holdsSetupLock = false): Promise<boolean> => {
      let key: CryptoKey | null;
      try {
        key = await unlockCredentials(password, storedCreds);
      } catch {
        // Malformed credentials cannot be unlocked by any password
        key = null;
      }
      if (!key) {
        return false;
      }

      const converted = isCredentialsV1(storedCreds)
        ? await convertToV2(password, storedCreds, key, holdsSetupLock)
        : null;
      await settleStoredRecords(key);
      setEncryptionKey(key);
      setCredentials(converted ?? storedCreds);
      setStatus('unlocked');
      return true;
    },
    []
  );

  /** Another tab finished setup meanwhile: its credentials, and the unlock screen */
  const showLocked = useCallback((existing: object): SetupOutcome => {
    setCredentials(existing);
    setEncryptionKey(null);
    setStatus('locked');
    return 'existing-locked';
  }, []);

  /**
   * Save new credentials, then unlock with their key. Once saved, the
   * credentials are never taken back: another tab may already have unlocked
   * with them and sealed records under this key. So a failed `onSaved` or
   * `prepare` is logged (`failure`, fixed text: the error could name what
   * was being stored) and setup goes on; the caller says what was lost.
   * Before `prepare`: rows set aside earlier that this key opens come back,
   * and rows it cannot open go aside, so what `prepare` stores neither
   * duplicates the one nor is hidden by the other.
   */
  const saveAndUnlock = useCallback(
    async (
      credentials: StoredCredentialsV2,
      key: CryptoKey,
      prepare: ((key: CryptoKey) => Promise<void>) | undefined,
      failure: string,
      onSaved?: () => Promise<void>
    ): Promise<SetupOutcome> => {
      saveStoredCredentials(credentials);
      setCredentials(credentials);
      if (onSaved) {
        try {
          await onSaved();
        } catch {
          logFailure('Could not keep the folder choice');
        }
      }
      await settleStoredRecords(key);
      try {
        await prepare?.(key);
      } catch {
        logFailure(failure);
      }
      setEncryptionKey(key);
      setStatus('unlocked');
      return 'created';
    },
    []
  );

  const setupPassword = useCallback(
    (password: string, prepare?: (key: CryptoKey) => Promise<void>): Promise<SetupOutcome> =>
      withWebLock(SETUP_LOCK, async (): Promise<SetupOutcome> => {
        // Read again under the lock: another tab may have finished setup meanwhile
        const existing = loadStoredCredentials();
        if (existing) {
          return (await unlockWith(password, existing, true)) ? 'unlocked-existing' : showLocked(existing);
        }
        const { credentials, key } = await createCredentialsV2(password);
        return saveAndUnlock(credentials, key, prepare, 'Could not store the setup choices');
      }),
    [unlockWith, showLocked, saveAndUnlock]
  );

  const recoverFromFolder = useCallback(
    (
      lock: StoredCredentialsV2,
      key: CryptoKey,
      prepare?: (key: CryptoKey) => Promise<void>,
      onSaved?: () => Promise<void>
    ): Promise<SetupOutcome> =>
      withWebLock(SETUP_LOCK, async (): Promise<SetupOutcome> => {
        // Read again under the lock: another tab may have finished setup meanwhile
        const existing = loadStoredCredentials();
        if (existing) return showLocked(existing);
        return saveAndUnlock(lock, key, prepare, 'Could not restore the folder copy', onSaved);
      }),
    [showLocked, saveAndUnlock]
  );

  const unlock = useCallback(
    async (password: string): Promise<boolean> => {
      // Storage first: another tab may have changed the password since this one loaded
      const storedCreds = loadStoredCredentials() ?? credentials;
      return storedCreds ? unlockWith(password, storedCreds) : false;
    },
    [credentials, unlockWith]
  );

  // Another tab's setup, its Start over, or its password change or adopted
  // folder lock (kept as this tab's lock, with the session key unchanged):
  // the storage event fires only in the other tabs, never in the one that wrote
  useEffect(() => {
    const handleStorage = (event: StorageEvent): void => {
      if (!mayChangeCredentials(event)) return;

      const stored = loadStoredCredentials();
      // Removed or cleared: whatever storage holds by now (another setup's
      // credentials, written before this tab heard) need not wrap this
      // session's key, so the key leaves memory and the next unlock decides
      const removed = event.newValue === null || event.key === null;
      // A tab that held this setup reloads, so nothing of it (API key
      // caches, AI choices, preferences, notices) outlives it in memory. Not
      // a tab already in setup: what its wizard had begun stays as it was.
      const hadSetup = statusRef.current === 'locked' || statusRef.current === 'unlocked';
      if (removed && hadSetup) reloadPage();
      if (stored) {
        setCredentials(stored);
        if (removed) {
          setEncryptionKey(null);
          setStatus('locked');
        } else {
          setStatus((current) => (current === 'needs_setup' ? 'locked' : current));
        }
      } else {
        // The key leaves memory; the data layer closes as on any lock
        setCredentials(null);
        setEncryptionKey(null);
        setStatus('needs_setup');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const lock = useCallback((): void => {
    setEncryptionKey(null);
    setStatus('locked');
  }, []);

  const storedLock = useMemo(
    () => (isCredentialsV2(credentials) ? credentials : null),
    [credentials]
  );

  const adoptFolderLock = useCallback((lock: StoredCredentialsV2): boolean => {
    // Compared with storage, not state: another tab may have changed the
    // password or adopted a lock since. Synchronous, so the read and the
    // write leave another tab only the gap between two storage calls.
    const stored = loadStoredCredentials();
    // Removed in another tab (Start over): there is nothing to replace
    if (!stored) return false;
    if (!isLaterLock(lock, isCredentialsV2(stored) ? stored : null)) return false;
    try {
      saveStoredCredentials(lock);
    } catch {
      logFailure('Could not save the password lock from the folder');
      return false;
    }
    setCredentials(lock);
    return true;
  }, []);

  const startOver = useCallback(async (): Promise<void> => {
    // First, so no sync or decryption starts with the key from here on
    setEncryptionKey(null);
    setCredentials(null);
    setStatus('needs_setup');
    setStartingOver(true);

    try {
      // Both locks: waits for a setup in another tab, and for a sync in
      // flight, which may still write its state or the folder copy. No sync
      // writes after the clear.
      const cleared = await withLocks([SETUP_LOCK, FOLDER_SYNC_LOCK], async (): Promise<boolean> => {
        let ok = true;
        try {
          // The rows set aside stay: no key here opened them, but one
          // recovered from a folder copy may, and setup offers them
          await clearStoredDataButSetAside();
        } catch {
          ok = false;
        }
        // Even when the rows stay: without the credentials, setup offers to
        // keep them aside or delete them. Removed, never overwritten, so
        // other tabs return to setup too.
        try {
          await clearLocalHemoIOStorage();
        } catch {
          ok = false;
        }
        return ok;
      });
      if (!cleared) {
        // Fixed text: the error could name stored data
        logFailure('Could not clear the data stored in this browser');
        throw new Error('Start over did not finish');
      }
    } finally {
      // Whatever happened, with the locks released: nothing of the old setup
      // stays in this page's memory
      reloadPage();
    }
  }, []);

  const changePassword = useCallback(
    async (current: string, next: string): Promise<ChangePasswordResult> => {
      if (current === next) {
        return { ok: false, reason: 'same_password' };
      }
      try {
        const stored = loadStoredCredentials();
        if (!encryptionKey || !(isCredentialsV1(stored) || isCredentialsV2(stored))) {
          return FAILED;
        }

        const rewrapped = await rewrapCredentials(current, next, stored);
        if (!rewrapped) {
          return { ok: false, reason: 'wrong_password' };
        }

        // Never store credentials that would not unlock the key the data uses
        if (!(await keyMatchesCredentials(encryptionKey, next, rewrapped.credentials))) {
          return FAILED;
        }

        saveStoredCredentials(rewrapped.credentials);
        setCredentials(rewrapped.credentials);
        return { ok: true };
      } catch {
        logFailure('Password change failed');
        return FAILED;
      }
    },
    [encryptionKey]
  );

  const value: AuthContextValue = {
    status,
    encryptionKey,
    unlock,
    lock,
    setupPassword,
    recoverFromFolder,
    changePassword,
    isSetupComplete,
    storedLock,
    adoptFolderLock,
    startOver,
    startingOver,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
