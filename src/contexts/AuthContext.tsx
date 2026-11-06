/**
 * Authentication Context
 *
 * Manages user authentication, encryption key handling, password setup and
 * password changes. The only reader and writer of the stored credentials.
 */

import { createContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { verifyPassword, getEncryptionKey } from '@data/encryption';
import {
  createCredentialsV2,
  isCredentialsV1,
  isCredentialsV2,
  keyMatchesCredentials,
  rewrapCredentials,
  unlockV2,
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

  /** Unlocks with these credentials; false for a wrong password or unreadable credentials */
  const unlockWith = useCallback(
    async (password: string, storedCreds: object): Promise<boolean> => {
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

      await settleStoredRecords(key);
      setEncryptionKey(key);
      setCredentials(storedCreds);
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
          if (await unlockWith(password, existing)) {
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
        try {
          await settleStoredRecords(key);
          await prepare?.(key);
        } catch (error) {
          // Taken back while the lock is held, so a retry sets up anew
          // instead of finding these credentials as if another tab saved them
          localStorage.removeItem(CREDENTIALS_STORAGE_KEY);
          setCredentials(null);
          throw error;
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

  // Another tab's setup, or its Start over: the storage event fires only in
  // the other tabs, never in the one that wrote
  useEffect(() => {
    const handleStorage = (event: StorageEvent): void => {
      if (!mayChangeCredentials(event)) return;

      const stored = loadStoredCredentials();
      if (stored) {
        setCredentials(stored);
        setStatus((current) => (current === 'needs_setup' ? 'locked' : current));
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
