import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useContext, useEffect } from 'react';
import { AuthProvider, AuthContext, type AuthContextValue } from './AuthContext';
import {
  createStoredCredentials,
  decryptString,
  encryptString,
  getEncryptionKey,
} from '@data/encryption';
import {
  createCredentialsV2,
  isCredentialsV1,
  isCredentialsV2,
  keyMatchesCredentials,
  rewrapCredentials,
  type StoredCredentialsV2,
} from '@data/encryption/keyWrapping';
import { createEncryptedDb } from '@data/db';
import { installFakeWebLocks } from '@/test/fakeWebLocks';

// The sweep that sets unreadable records aside reads the database: tested in
// encryptedDb.setAside.test.ts, here only when and how it is called
const { settleUnreadable } = vi.hoisted(() => ({
  settleUnreadable: vi.fn<() => Promise<{ returned: number; setAside: number }>>(),
}));
vi.mock('@data/db', () => ({
  createEncryptedDb: vi.fn(() => ({ settleUnreadable })),
}));

// Counted where two setups must make one data key; otherwise the real one
vi.mock('@data/encryption/keyWrapping', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@data/encryption/keyWrapping')>();
  return {
    ...actual,
    createCredentialsV2: vi.fn(actual.createCredentialsV2),
    keyMatchesCredentials: vi.fn(actual.keyMatchesCredentials),
  };
});

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

/** What another tab's write of the credentials looks like to this one */
function storageEventFromAnotherTab(newValue: string | null, key: string | null = CREDENTIALS_KEY) {
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
  });
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    settleUnreadable.mockReset();
    settleUnreadable.mockResolvedValue({ returned: 0, setAside: 0 });
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

    it('moves unreadable records aside with the new key before unlocking', async () => {
      renderAuth();
      let statusDuringSweep = '';
      settleUnreadable.mockImplementation(async () => {
        statusDuringSweep = screen.getByTestId('status').textContent ?? '';
        return { returned: 0, setAside: 0 };
      });

      await act(async () => {
        await auth.setupPassword(OLD);
      });

      expect(statusDuringSweep).toBe('needs_setup');
      expect(createEncryptedDb).toHaveBeenLastCalledWith(auth.encryptionKey);
      expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
    });
  });

  describe('setup across tabs', () => {
    it('setup over credentials another tab saved unlocks with them', async () => {
      renderAuth();
      // Saved by another tab after this one loaded; its storage event not yet seen
      const theirs = (await createCredentialsV2(OLD, 1000)).credentials;
      store(theirs);

      let outcome: string | undefined;
      await act(async () => {
        outcome = await auth.setupPassword(OLD);
      });

      expect(outcome).toBe('unlocked-existing');
      expect(storedCredentials()).toEqual(theirs);
      expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
      expect(auth.encryptionKey).not.toBeNull();
    });

    it('setup with a password that does not open them goes to locked', async () => {
      renderAuth();
      const theirs = (await createCredentialsV2(OLD, 1000)).credentials;
      store(theirs);

      let outcome: string | undefined;
      await act(async () => {
        outcome = await auth.setupPassword(NEW);
      });

      expect(outcome).toBe('existing-locked');
      expect(storedCredentials()).toEqual(theirs);
      expect(screen.getByTestId('status')).toHaveTextContent('locked');
      expect(auth.encryptionKey).toBeNull();
    });

    it('setup over existing credentials does not run prepare', async () => {
      renderAuth();
      store((await createCredentialsV2(OLD, 1000)).credentials);
      const prepare = vi.fn().mockResolvedValue(undefined);

      await act(async () => {
        await auth.setupPassword(OLD, prepare);
      });
      await act(async () => {
        await auth.setupPassword(NEW, prepare);
      });

      expect(prepare).not.toHaveBeenCalled();
    });

    it('a failed setup step keeps the credentials and unlocks', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      renderAuth();

      let outcome: string | undefined;
      await act(async () => {
        outcome = await auth.setupPassword(OLD, () => Promise.reject(new Error('quota')));
      });

      // Other tabs may already use them: once written, never taken back
      expect(outcome).toBe('created');
      expect(isCredentialsV2(storedCredentials())).toBe(true);
      expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
      expect(auth.encryptionKey).not.toBeNull();
      expect(error).toHaveBeenCalledWith('Could not store the setup choices');
      expect(JSON.stringify(error.mock.calls)).not.toContain('quota');
    });

    it('a new setup reports created', async () => {
      renderAuth();

      let outcome: string | undefined;
      await act(async () => {
        outcome = await auth.setupPassword(OLD);
      });

      expect(outcome).toBe('created');
    });

    it('two setups at once create one data key', async () => {
      const locks = installFakeWebLocks();
      try {
        renderAuth();
        vi.mocked(createCredentialsV2).mockClear();

        let outcomes: string[] = [];
        await act(async () => {
          outcomes = await Promise.all([auth.setupPassword(OLD), auth.setupPassword(OLD)]);
        });

        expect(createCredentialsV2).toHaveBeenCalledTimes(1);
        expect(outcomes).toEqual(['created', 'unlocked-existing']);
        expect(locks.requests.map((request) => request.name)).toEqual(['hemoio-setup', 'hemoio-setup']);
        expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
      } finally {
        locks.uninstall();
      }
    });

    it('credentials appearing in storage leave setup', async () => {
      renderAuth();
      const theirs = JSON.stringify((await createCredentialsV2(OLD, 1000)).credentials);
      localStorage.setItem(CREDENTIALS_KEY, theirs);

      storageEventFromAnotherTab(theirs);

      expect(screen.getByTestId('status')).toHaveTextContent('locked');
      expect(await unlock(OLD)).toBe(true);
    });

    it('credentials appearing in storage leave an unlocked tab as it is', async () => {
      await setUp();
      const key = auth.encryptionKey;

      storageEventFromAnotherTab(localStorage.getItem(CREDENTIALS_KEY));

      expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
      expect(auth.encryptionKey).toBe(key);
    });

    it('credentials removed in another tab return to setup', async () => {
      await setUp();
      localStorage.removeItem(CREDENTIALS_KEY);

      storageEventFromAnotherTab(null);

      expect(screen.getByTestId('status')).toHaveTextContent('needs_setup');
      expect(screen.getByTestId('setup-complete')).toHaveTextContent('no');
      expect(auth.encryptionKey).toBeNull();
    });

    it('localStorage cleared in another tab returns to setup', async () => {
      await setUp();
      localStorage.clear();

      // What clear() sends: no key
      storageEventFromAnotherTab(null, null);

      expect(screen.getByTestId('status')).toHaveTextContent('needs_setup');
      expect(auth.encryptionKey).toBeNull();
    });

    it('a storage event with no key while credentials remain leaves setup', async () => {
      renderAuth();
      store((await createCredentialsV2(OLD, 1000)).credentials);

      storageEventFromAnotherTab(null, null);

      expect(screen.getByTestId('status')).toHaveTextContent('locked');
    });

    it.each([
      ['the credentials removed', CREDENTIALS_KEY],
      ['localStorage cleared', null],
    ])('%s in another tab drops the key, even with credentials in storage again', async (_label, key) => {
      await setUp();
      // Removed, then another setup's credentials written, before this tab hears of either
      const theirs = (await createCredentialsV2(NEW, 1000)).credentials;
      store(theirs);

      storageEventFromAnotherTab(null, key);

      expect(auth.encryptionKey).toBeNull();
      expect(screen.getByTestId('status')).toHaveTextContent('locked');
      expect(auth.storedLock).toEqual(theirs);
      expect(await unlock(NEW)).toBe(true);
    });

    it('storage events for other keys change nothing', async () => {
      renderAuth();
      localStorage.setItem('hemoio_ai_provider', 'openai');

      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: 'hemoio_ai_provider', newValue: 'openai' }));
      });

      expect(screen.getByTestId('status')).toHaveTextContent('needs_setup');
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

    it('unlock moves unreadable records aside before unlocking', async () => {
      await setUp();
      lock();
      let finishSweep: () => void = () => {};
      settleUnreadable.mockReturnValue(
        new Promise((resolve) => {
          finishSweep = () => resolve({ returned: 0, setAside: 3 });
        })
      );

      let unlocked: Promise<boolean> = Promise.resolve(false);
      act(() => {
        unlocked = auth.unlock(OLD);
      });
      await vi.waitFor(() => expect(settleUnreadable).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId('status')).toHaveTextContent('locked');

      await act(async () => {
        finishSweep();
        expect(await unlocked).toBe(true);
      });
      expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
      expect(createEncryptedDb).toHaveBeenLastCalledWith(auth.encryptionKey);
    });

    it('a failed sweep still unlocks and logs no error detail', async () => {
      await setUp();
      lock();
      settleUnreadable.mockRejectedValue(new Error('labResults row 7: Glucose'));
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(await unlock(OLD)).toBe(true);

      expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
      expect(error.mock.calls).toEqual([['Could not check stored records against this key']]);
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

  describe('v1 credentials at unlock', () => {
    it('converts v1 credentials to v2 at unlock without changing the data key', async () => {
      const v1 = await createStoredCredentials(OLD);
      store(v1);
      // Saved by the earlier app, under the key PBKDF2 derives from the password
      const ciphertext = await encryptString('Annual checkup', await getEncryptionKey(OLD, v1));
      renderAuth();

      expect(await unlock(OLD)).toBe(true);

      expect(isCredentialsV2(storedCredentials())).toBe(true);
      expect(auth.storedLock).toEqual(storedCredentials());
      expect(await decryptString(ciphertext, auth.encryptionKey!)).toBe('Annual checkup');
      lock();
      expect(await unlock('Wrong-Passw0rd!')).toBe(false);
      expect(await unlock(OLD)).toBe(true);
      expect(await decryptString(ciphertext, auth.encryptionKey!)).toBe('Annual checkup');
    });

    it('setup over v1 credentials another tab left converts them, under the setup lock it holds', async () => {
      const locks = installFakeWebLocks();
      try {
        const v1 = await createStoredCredentials(OLD);
        renderAuth();
        store(v1);
        const ciphertext = await encryptString('Annual checkup', await getEncryptionKey(OLD, v1));

        let outcome;
        await act(async () => {
          outcome = await auth.setupPassword(OLD);
        });

        expect(outcome).toBe('unlocked-existing');
        expect(isCredentialsV2(storedCredentials())).toBe(true);
        expect(await decryptString(ciphertext, auth.encryptionKey!)).toBe('Annual checkup');
        // Taken once, by setup: the conversion inside did not ask again
        expect(locks.requests.filter((r) => r.name === 'hemoio-setup')).toHaveLength(1);
      } finally {
        locks.uninstall();
      }
    });

    it('skips the conversion when another tab changed the credentials meanwhile', async () => {
      const v1 = await createStoredCredentials(OLD);
      store(v1);
      const theirs = (await createCredentialsV2(OLD, 1000)).credentials;
      vi.mocked(keyMatchesCredentials).mockImplementationOnce(async () => {
        // Another tab converts them, or changes the password, while this one checks
        store(theirs);
        return true;
      });
      renderAuth();

      expect(await unlock(OLD)).toBe(true);

      expect(storedCredentials()).toEqual(theirs);
      expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
    });

    it('a failed conversion leaves the v1 credentials and unlocks', async () => {
      const v1 = await createStoredCredentials(OLD);
      store(v1);
      vi.mocked(keyMatchesCredentials).mockResolvedValueOnce(false);
      renderAuth();

      expect(await unlock(OLD)).toBe(true);

      expect(storedCredentials()).toEqual(v1);
      expect(isCredentialsV1(storedCredentials())).toBe(true);
      expect(auth.storedLock).toBeNull();
      expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
    });
  });

  describe('recoverFromFolder', () => {
    it('recoverFromFolder saves the lock, sweeps before prepare, and unlocks', async () => {
      const locks = installFakeWebLocks();
      try {
        renderAuth();
        const { credentials: lock, key } = await createCredentialsV2(OLD, 1000);
        const order: string[] = [];
        let statusDuringPrepare = '';
        let heldDuringPrepare: string | null = null;
        settleUnreadable.mockImplementation(async () => {
          order.push('sweep started');
          await new Promise((resolve) => setTimeout(resolve, 0));
          order.push('sweep done');
          return { returned: 2, setAside: 1 };
        });
        const prepare = vi.fn(async (preparedWith: CryptoKey) => {
          order.push('prepare');
          expect(preparedWith).toBe(key);
          expect(storedCredentials()).toEqual(lock);
          statusDuringPrepare = screen.getByTestId('status').textContent ?? '';
          heldDuringPrepare = locks.held();
        });

        let outcome: string | undefined;
        await act(async () => {
          outcome = await auth.recoverFromFolder(lock, key, prepare);
        });

        expect(order).toEqual(['sweep started', 'sweep done', 'prepare']);
        expect(createEncryptedDb).toHaveBeenLastCalledWith(key);
        expect(statusDuringPrepare).toBe('needs_setup');
        expect(heldDuringPrepare).toBe('hemoio-setup');
        expect(outcome).toBe('created');
        expect(storedCredentials()).toEqual(lock);
        expect(auth.storedLock).toEqual(lock);
        expect(auth.encryptionKey).toBe(key);
        expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
      } finally {
        locks.uninstall();
      }
    });

    it('recoverFromFolder defers to credentials another tab saved', async () => {
      renderAuth();
      const theirs = (await createCredentialsV2(NEW, 1000)).credentials;
      store(theirs);
      const { credentials: lock, key } = await createCredentialsV2(OLD, 1000);
      const prepare = vi.fn().mockResolvedValue(undefined);

      let outcome: string | undefined;
      await act(async () => {
        outcome = await auth.recoverFromFolder(lock, key, prepare);
      });

      expect(outcome).toBe('existing-locked');
      expect(storedCredentials()).toEqual(theirs);
      expect(prepare).not.toHaveBeenCalled();
      expect(settleUnreadable).not.toHaveBeenCalled();
      expect(auth.encryptionKey).toBeNull();
      expect(screen.getByTestId('status')).toHaveTextContent('locked');
    });

    it('a failed restore keeps the saved lock and unlocks, logging no detail', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      renderAuth();
      const { credentials: lock, key } = await createCredentialsV2(OLD, 1000);

      let outcome: string | undefined;
      await act(async () => {
        outcome = await auth.recoverFromFolder(lock, key, () => Promise.reject(new Error('Glucose 95')));
      });

      expect(outcome).toBe('created');
      expect(storedCredentials()).toEqual(lock);
      expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
      expect(JSON.stringify(error.mock.calls)).not.toContain('Glucose');
    });
  });

  describe('the lock in the folder', () => {
    /** The lock another computer made when it changed the password to NEW */
    async function lockChangedTo(password: string, changedAt: string): Promise<StoredCredentialsV2> {
      const rewrapped = await rewrapCredentials(OLD, password, storedCredentials() as never, 1000);
      return { ...rewrapped!.credentials, changedAt };
    }

    it('adopts a later folder lock and needs the new password next unlock', async () => {
      await setUp();
      const key = auth.encryptionKey;
      const later = await lockChangedTo(NEW, new Date(Date.now() + 60_000).toISOString());

      let adopted = false;
      act(() => {
        adopted = auth.adoptFolderLock(later);
      });

      expect(adopted).toBe(true);
      expect(storedCredentials()).toEqual(later);
      expect(auth.storedLock).toEqual(later);
      expect(auth.encryptionKey).toBe(key);
      expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
      lock();
      expect(await unlock(OLD)).toBe(false);
      expect(await unlock(NEW)).toBe(true);
    });

    it('ignores an earlier folder lock', async () => {
      await setUp();
      const ours = storedCredentials();
      const earlier = await lockChangedTo(NEW, '2020-01-01T00:00:00.000Z');

      let adopted = true;
      act(() => {
        adopted = auth.adoptFolderLock(earlier);
      });

      expect(adopted).toBe(false);
      expect(storedCredentials()).toEqual(ours);
      expect(auth.storedLock).toEqual(ours);
      lock();
      expect(await unlock(OLD)).toBe(true);
    });

    it('compares with the lock in storage, which another tab may have changed', async () => {
      await setUp();
      const theirs = await lockChangedTo(NEW, new Date(Date.now() + 120_000).toISOString());
      const folder = await lockChangedTo('Folder-Passw0rd!', new Date(Date.now() + 60_000).toISOString());
      store(theirs);

      let adopted = true;
      act(() => {
        adopted = auth.adoptFolderLock(folder);
      });

      expect(adopted).toBe(false);
      expect(storedCredentials()).toEqual(theirs);
    });

    it('a lock changed in another tab is the one this tab syncs with', async () => {
      await setUp();
      const key = auth.encryptionKey;
      const theirs = await lockChangedTo(NEW, new Date(Date.now() + 60_000).toISOString());
      store(theirs);

      storageEventFromAnotherTab(JSON.stringify(theirs));

      expect(auth.storedLock).toEqual(theirs);
      expect(auth.encryptionKey).toBe(key);
      expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
    });

    it('a password change gives the new lock', async () => {
      await setUp();

      await act(async () => {
        await auth.changePassword(OLD, NEW);
      });

      expect(auth.storedLock).toEqual(storedCredentials());
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
