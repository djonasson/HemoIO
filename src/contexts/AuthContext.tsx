/**
 * Authentication Context
 *
 * Manages user authentication, encryption key handling, and password setup.
 */

import {
  createContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  type StoredCredentials,
  createStoredCredentials,
  verifyPassword,
  getEncryptionKey,
} from '@data/encryption';

const CREDENTIALS_STORAGE_KEY = 'hemoio_credentials';

export type AuthStatus = 'loading' | 'needs_setup' | 'locked' | 'unlocked';

export interface AuthContextValue {
  status: AuthStatus;
  encryptionKey: CryptoKey | null;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  setupPassword: (password: string) => Promise<void>;
  isSetupComplete: () => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export { AuthContext };

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Loads stored credentials from localStorage
 */
function loadStoredCredentials(): StoredCredentials | null {
  try {
    const stored = localStorage.getItem(CREDENTIALS_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as StoredCredentials;
  } catch {
    return null;
  }
}

/**
 * Saves credentials to localStorage
 */
function saveStoredCredentials(credentials: StoredCredentials): void {
  localStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
}

export function AuthProvider({ children }: AuthProviderProps): ReactNode {
  const storedCreds = loadStoredCredentials();
  
  const [status, setStatus] = useState<AuthStatus>(
    storedCreds ? 'locked' : 'needs_setup'
  );
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [credentials, setCredentials] = useState<StoredCredentials | null>(storedCreds);

  const isSetupComplete = useCallback((): boolean => {
    return credentials !== null || loadStoredCredentials() !== null;
  }, [credentials]);

  const setupPassword = useCallback(async (password: string): Promise<void> => {
    const newCredentials = await createStoredCredentials(password);
    saveStoredCredentials(newCredentials);
    setCredentials(newCredentials);

    // Automatically unlock after setup
    const key = await getEncryptionKey(password, newCredentials);
    setEncryptionKey(key);
    setStatus('unlocked');
  }, []);

  const unlock = useCallback(
    async (password: string): Promise<boolean> => {
      const storedCreds = credentials ?? loadStoredCredentials();
      if (!storedCreds) {
        return false;
      }

      const isValid = await verifyPassword(password, storedCreds);
      if (!isValid) {
        return false;
      }

      const key = await getEncryptionKey(password, storedCreds);
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

  const value: AuthContextValue = {
    status,
    encryptionKey,
    unlock,
    lock,
    setupPassword,
    isSetupComplete,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
