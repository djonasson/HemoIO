/**
 * Authentication Context
 *
 * Manages user authentication, encryption key handling, password setup and
 * password changes. The only reader and writer of the stored credentials.
 */

import { createContext, useState, useCallback, type ReactNode } from 'react';
import { createEncryptedDb } from '@data/db';
import { verifyPassword, getEncryptionKey } from '@data/encryption';
import {
  createCredentialsV2,
  isCredentialsV1,
  isCredentialsV2,
  keyMatchesCredentials,
  rewrapCredentials,
  unlockV2,
} from '@data/encryption/keyWrapping';

const CREDENTIALS_STORAGE_KEY = 'hemoio_credentials';

export type AuthStatus = 'loading' | 'needs_setup' | 'locked' | 'unlocked';

export type ChangePasswordResult =
  { ok: true } | { ok: false; reason: 'wrong_password' | 'same_password' | 'failed' };

export interface AuthContextValue {
  status: AuthStatus;
  encryptionKey: CryptoKey | null;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  /**
   * Creates credentials, runs `prepare` with the session key (to store what
   * setup collected, encrypted), then unlocks: the app starts with it all
   */
  setupPassword: (password: string, prepare?: (key: CryptoKey) => Promise<void>) => Promise<void>;
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

/**
 * Loads stored credentials from localStorage. The format (v1, v2 or unknown)
 * is checked where they are used.
 */
function loadStoredCredentials(): object | null {
  try {
    const stored = localStorage.getItem(CREDENTIALS_STORAGE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function saveStoredCredentials(credentials: object): void {
  localStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
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

/**
 * Migrations that need the decrypted data, run before the app is unlocked so
 * nothing reads data that is half migrated: records earlier versions stored
 * are sealed, and unknown biomarkers stored before keys existed get the key
 * new imports of the same name get. A failure is not fatal: those records
 * stay readable by the app as they are, only less protected.
 */
async function migrateStoredData(key: CryptoKey): Promise<void> {
  try {
    await createEncryptedDb(key).migrateLegacyRecords();
  } catch {
    // Not logged with the error, which could name stored data
    console.error('Failed to migrate stored records');
  }
}

export function AuthProvider({ children }: AuthProviderProps): ReactNode {
  const storedCreds = loadStoredCredentials();

  const [status, setStatus] = useState<AuthStatus>(storedCreds ? 'locked' : 'needs_setup');
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [credentials, setCredentials] = useState<object | null>(storedCreds);

  const isSetupComplete = useCallback((): boolean => {
    return credentials !== null || loadStoredCredentials() !== null;
  }, [credentials]);

  const setupPassword = useCallback(
    async (password: string, prepare?: (key: CryptoKey) => Promise<void>): Promise<void> => {
      const { credentials: newCredentials, key } = await createCredentialsV2(password);
      saveStoredCredentials(newCredentials);
      setCredentials(newCredentials);
      await prepare?.(key);

      // Automatically unlock after setup
      setEncryptionKey(key);
      setStatus('unlocked');
    },
    []
  );

  const unlock = useCallback(
    async (password: string): Promise<boolean> => {
      // Storage first: another tab may have changed the password since this one loaded
      const storedCreds = loadStoredCredentials() ?? credentials;
      if (!storedCreds) {
        return false;
      }

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

      await migrateStoredData(key);
      setEncryptionKey(key);
      setCredentials(storedCreds);
      setStatus('unlocked');
      return true;
    },
    [credentials]
  );

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
