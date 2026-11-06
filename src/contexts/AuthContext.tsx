/**
 * Authentication Context
 *
 * Manages user authentication, encryption key handling, password setup and
 * password changes. The only writer of the stored credentials; setup also
 * reads them (credentialsStorage.ts) to see whether another tab came first.
 */

import { createContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
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
import { withWebLock } from '@/utils/withWebLock';
import {
  CREDENTIALS_STORAGE_KEY,
  SETUP_LOCK,
  loadStoredCredentials,
  mayChangeCredentials,
} from './credentialsStorage';

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
    console.error('Could not check stored records against this key');
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
    console.error('Could not move the credentials to the current format');
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

  const setupPassword = useCallback(
    (password: string, prepare?: (key: CryptoKey) => Promise<void>): Promise<SetupOutcome> =>
      withWebLock(SETUP_LOCK, async (): Promise<SetupOutcome> => {
        // Read again under the lock: another tab may have finished setup meanwhile
        const existing = loadStoredCredentials();
        if (existing) {
          if (await unlockWith(password, existing, true)) {
            return 'unlocked-existing';
          }
          setCredentials(existing);
          setEncryptionKey(null);
          setStatus('locked');
          return 'existing-locked';
        }

        const { credentials: newCredentials, key } = await createCredentialsV2(password);
        saveStoredCredentials(newCredentials);
        setCredentials(newCredentials);
        await settleStoredRecords(key);
        try {
          await prepare?.(key);
        } catch {
          // Once saved, the credentials are never taken back: another tab may
          // already have unlocked with them and sealed records under this key.
          // The setup choices are what is lost; the caller says so itself.
          // Fixed text: the error could name what was being stored.
          console.error('Could not store the setup choices');
        }

        // Automatically unlock after setup
        setEncryptionKey(key);
        setStatus('unlocked');
        return 'created';
      }),
    [unlockWith]
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
      console.error('Could not save the password lock from the folder');
      return false;
    }
    setCredentials(lock);
    return true;
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
        console.error('Password change failed');
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
    changePassword,
    isSetupComplete,
    storedLock,
    adoptFolderLock,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
