import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useContext, useEffect } from 'react';
import { AuthProvider, AuthContext, type AuthContextValue } from './AuthContext';
import { createStoredCredentials, decryptString, encryptString } from '@data/encryption';
import {
  createCredentialsV2,
  isCredentialsV2,
  rewrapCredentials,
} from '@data/encryption/keyWrapping';

const CREDENTIALS_KEY = 'hemoio_credentials';
const OLD = 'Old-Passw0rd!';
const NEW = 'New-Passw0rd!';

let auth: AuthContextValue;

function Probe() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('no AuthContext');
  // Exposes the latest value to the test after each commit
  useEffect(() => {
    auth = context;
  });
  return (
    <div>
      <span data-testid="status">{context.status}</span>
      <span data-testid="setup-complete">{context.isSetupComplete() ? 'yes' : 'no'}</span>
    </div>
  );
}

function renderAuth() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

function storedCredentials(): unknown {
  return JSON.parse(localStorage.getItem(CREDENTIALS_KEY) ?? 'null');
}

function store(credentials: unknown) {
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
}

async function setUp(password = OLD) {
  renderAuth();
  await act(async () => {
    await auth.setupPassword(password);
  });
}

async function unlock(password: string): Promise<boolean> {
  let result = false;
  await act(async () => {
    result = await auth.unlock(password);
  });
  return result;
}

function lock() {
  act(() => auth.lock());
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('initial state', () => {
    it('needs setup when no credentials exist', () => {
      renderAuth();

      expect(screen.getByTestId('status')).toHaveTextContent('needs_setup');
      expect(screen.getByTestId('setup-complete')).toHaveTextContent('no');
      expect(auth.encryptionKey).toBeNull();
    });

    it('is locked when credentials exist', async () => {
      store((await createCredentialsV2(OLD, 1000)).credentials);

      renderAuth();

      expect(screen.getByTestId('status')).toHaveTextContent('locked');
      expect(screen.getByTestId('setup-complete')).toHaveTextContent('yes');
    });

    it('needs setup when the stored credentials are not JSON', () => {
      localStorage.setItem(CREDENTIALS_KEY, 'invalid-json');

      renderAuth();

      expect(screen.getByTestId('status')).toHaveTextContent('needs_setup');
    });
  });

  describe('setupPassword', () => {
    it('writes v2 credentials and unlocks', async () => {
      renderAuth();

      await act(async () => {
        await auth.setupPassword(OLD);
      });

      expect(isCredentialsV2(storedCredentials())).toBe(true);
      expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
      expect(auth.encryptionKey?.extractable).toBe(false);
    });

    it('runs the setup step with the session key before reporting unlocked', async () => {
      renderAuth();
      let statusDuringPrepare = '';
      let preparedWith: CryptoKey | undefined;

      await act(async () => {
        await auth.setupPassword(OLD, async (key) => {
          statusDuringPrepare = screen.getByTestId('status').textContent ?? '';
          preparedWith = key;
        });
      });

      expect(statusDuringPrepare).toBe('needs_setup');
      expect(auth.encryptionKey).toBe(preparedWith);
      expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
    });
  });

  describe('unlock', () => {
    it('unlocks v2 credentials with the right password', async () => {
      await setUp();
      lock();

      expect(await unlock(OLD)).toBe(true);
      expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
      expect(auth.encryptionKey).not.toBeNull();
    });

    it('stays locked with a wrong password', async () => {
      await setUp();
      lock();

      expect(await unlock('Wrong-Passw0rd!')).toBe(false);
      expect(screen.getByTestId('status')).toHaveTextContent('locked');
      expect(auth.encryptionKey).toBeNull();
    });

    it('unlocks v1 credentials written before key wrapping', async () => {
      store(await createStoredCredentials(OLD));
      renderAuth();

      expect(await unlock('Wrong-Passw0rd!')).toBe(false);
      expect(await unlock(OLD)).toBe(true);
      expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
    });

    it('returns false when no credentials exist', async () => {
      renderAuth();

      expect(await unlock(OLD)).toBe(false);
    });

    it('returns false for credentials of an unknown version', async () => {
      const { credentials } = await createCredentialsV2(OLD, 1000);
      store({ ...credentials, version: 3 });
      renderAuth();

      expect(await unlock(OLD)).toBe(false);
      expect(screen.getByTestId('status')).toHaveTextContent('locked');
    });

    it('returns false for tampered credentials', async () => {
      const { credentials } = await createCredentialsV2(OLD, 1000);
      store({ ...credentials, wrappedKey: credentials.wrappedKey.split('').reverse().join('') });
      renderAuth();

      expect(await unlock(OLD)).toBe(false);
    });

    it('unlock reads credentials another tab wrote', async () => {
      await setUp();
      // Another tab changes the password while this one is open
      const rewrapped = await rewrapCredentials(OLD, NEW, storedCredentials() as never, 1000);
      store(rewrapped!.credentials);
      lock();

      expect(await unlock(NEW)).toBe(true);
    });
  });

  describe('lock', () => {
    it('clears the key and locks', async () => {
      await setUp();

      lock();

      expect(screen.getByTestId('status')).toHaveTextContent('locked');
      expect(auth.encryptionKey).toBeNull();
    });
  });

  describe('changePassword', () => {
    it('changes the password, keeping the session key and status', async () => {
      await setUp();
      const keyBefore = auth.encryptionKey;

      let result;
      await act(async () => {
        result = await auth.changePassword(OLD, NEW);
      });

      expect(result).toEqual({ ok: true });
      expect(auth.encryptionKey).toBe(keyBefore);
      expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
      lock();
      expect(await unlock(OLD)).toBe(false);
      expect(await unlock(NEW)).toBe(true);
    });

    it('keeps data readable after the change', async () => {
      await setUp();
      const ciphertext = await encryptString('Annual checkup', auth.encryptionKey!);

      await act(async () => {
        await auth.changePassword(OLD, NEW);
      });
      lock();
      await unlock(NEW);

      expect(await decryptString(ciphertext, auth.encryptionKey!)).toBe('Annual checkup');
    });

    it('moves v1 credentials to v2 and keeps v1 data readable', async () => {
      store(await createStoredCredentials(OLD));
      renderAuth();
      await unlock(OLD);
      const ciphertext = await encryptString('Annual checkup', auth.encryptionKey!);

      let result;
      await act(async () => {
        result = await auth.changePassword(OLD, NEW);
      });

      expect(result).toEqual({ ok: true });
      expect(isCredentialsV2(storedCredentials())).toBe(true);
      lock();
      expect(await unlock(NEW)).toBe(true);
      expect(await decryptString(ciphertext, auth.encryptionKey!)).toBe('Annual checkup');
    });

    it('rejects a new password equal to the current one', async () => {
      await setUp();
      const before = localStorage.getItem(CREDENTIALS_KEY);

      const result = await auth.changePassword(OLD, OLD);

      expect(result).toEqual({ ok: false, reason: 'same_password' });
      expect(localStorage.getItem(CREDENTIALS_KEY)).toBe(before);
    });

    it('rejects a wrong current password without changing anything', async () => {
      await setUp();
      const before = localStorage.getItem(CREDENTIALS_KEY);

      const result = await auth.changePassword('Wrong-Passw0rd!', NEW);

      expect(result).toEqual({ ok: false, reason: 'wrong_password' });
      expect(localStorage.getItem(CREDENTIALS_KEY)).toBe(before);
    });

    it('fails and keeps the old credentials when they cannot be saved', async () => {
      await setUp();
      const before = localStorage.getItem(CREDENTIALS_KEY);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });

      const result = await auth.changePassword(OLD, NEW);

      expect(result).toEqual({ ok: false, reason: 'failed' });
      expect(localStorage.getItem(CREDENTIALS_KEY)).toBe(before);
      // A fixed message only: never the error object, which could carry key material
      expect(consoleError).toHaveBeenCalledWith('Password change failed');
      vi.restoreAllMocks();
      lock();
      expect(await unlock(OLD)).toBe(true);
    });

    it('fails when the stored credentials are missing', async () => {
      await setUp();
      localStorage.removeItem(CREDENTIALS_KEY);

      const result = await auth.changePassword(OLD, NEW);

      expect(result).toEqual({ ok: false, reason: 'failed' });
      expect(localStorage.getItem(CREDENTIALS_KEY)).toBeNull();
    });

    it('fails when the stored credentials do not hold the session key', async () => {
      await setUp();
      // Same password, different data key: the round-trip check must catch it
      const other = (await createCredentialsV2(OLD, 1000)).credentials;
      store(other);

      const result = await auth.changePassword(OLD, NEW);

      expect(result).toEqual({ ok: false, reason: 'failed' });
      expect(storedCredentials()).toEqual(other);
    });

    it('a change finishes even if the app locks meanwhile', async () => {
      await setUp();

      let result;
      await act(async () => {
        const pending = auth.changePassword(OLD, NEW);
        auth.lock();
        result = await pending;
      });

      expect(result).toEqual({ ok: true });
      expect(await unlock(NEW)).toBe(true);
    });
  });
});
