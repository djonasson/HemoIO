import { describe, it, expect } from 'vitest';
import { createStoredCredentials, decryptString, encryptString, getEncryptionKey } from './index';
import {
  KEK_PBKDF2_ITERATIONS,
  createCredentialsV2,
  isCredentialsV1,
  isCredentialsV2,
  keyMatchesCredentials,
  rewrapCredentials,
  unlockV2,
} from './keyWrapping';

// Low iteration count keeps the suite fast; one test checks the real default
const FAST = 1000;

describe('keyWrapping', () => {
  describe('createCredentialsV2', () => {
    it('creates v2 credentials whose key decrypts what the session key encrypted', async () => {
      const { credentials, key } = await createCredentialsV2('Old-Passw0rd!', FAST);

      expect(credentials.version).toBe(2);
      expect(isCredentialsV2(credentials)).toBe(true);
      const ciphertext = await encryptString('blood work', key);
      const unlocked = await unlockV2('Old-Passw0rd!', credentials);
      expect(unlocked).not.toBeNull();
      expect(await decryptString(ciphertext, unlocked!)).toBe('blood work');
    });

    it('returns a session key that cannot be exported', async () => {
      const { key } = await createCredentialsV2('Old-Passw0rd!', FAST);

      expect(key.extractable).toBe(false);
      expect(key.usages.sort()).toEqual(['decrypt', 'encrypt']);
    });

    it('uses 600 000 iterations by default', async () => {
      const { credentials } = await createCredentialsV2('Old-Passw0rd!');

      expect(KEK_PBKDF2_ITERATIONS).toBe(600_000);
      expect(credentials.iterations).toBe(600_000);
    });
  });

  describe('unlockV2', () => {
    it('returns null for a wrong password', async () => {
      const { credentials } = await createCredentialsV2('Old-Passw0rd!', FAST);

      expect(await unlockV2('Wrong-Passw0rd!', credentials)).toBeNull();
    });

    it('honours the iteration count stored in the credentials', async () => {
      const { credentials } = await createCredentialsV2('Old-Passw0rd!', 2000);

      expect(credentials.iterations).toBe(2000);
      expect(await unlockV2('Old-Passw0rd!', credentials)).not.toBeNull();
      expect(await unlockV2('Old-Passw0rd!', { ...credentials, iterations: 1000 })).toBeNull();
    });

    it('unlocks a session key that cannot be exported', async () => {
      const { credentials } = await createCredentialsV2('Old-Passw0rd!', FAST);

      const key = await unlockV2('Old-Passw0rd!', credentials);
      expect(key!.extractable).toBe(false);
    });

    it('wraps and unwraps with a password containing spaces and accents', async () => {
      const password = ' Pässwörd mit Leerzeichen 1! ';
      const { credentials } = await createCredentialsV2(password, FAST);

      expect(await unlockV2(password, credentials)).not.toBeNull();
      expect(await unlockV2(password.trim(), credentials)).toBeNull();
    });
  });

  describe('rewrapCredentials', () => {
    it('keeps the data key when changing a v2 password', async () => {
      const { credentials, key } = await createCredentialsV2('Old-Passw0rd!', FAST);
      const ciphertext = await encryptString('written before the change', key);

      const rewrapped = await rewrapCredentials(
        'Old-Passw0rd!',
        'New-Passw0rd!',
        credentials,
        FAST
      );

      const unlocked = await unlockV2('New-Passw0rd!', rewrapped!.credentials);
      expect(await decryptString(ciphertext, unlocked!)).toBe('written before the change');
      expect(await decryptString(ciphertext, rewrapped!.key)).toBe('written before the change');
      expect(await unlockV2('Old-Passw0rd!', rewrapped!.credentials)).toBeNull();
    });

    it('keeps the data key when changing a v1 password', async () => {
      const v1 = await createStoredCredentials('Old-Passw0rd!');
      const v1Key = await getEncryptionKey('Old-Passw0rd!', v1);
      const ciphertext = await encryptString('written by the old app', v1Key);

      const rewrapped = await rewrapCredentials('Old-Passw0rd!', 'New-Passw0rd!', v1, FAST);

      expect(isCredentialsV2(rewrapped!.credentials)).toBe(true);
      const unlocked = await unlockV2('New-Passw0rd!', rewrapped!.credentials);
      expect(await decryptString(ciphertext, unlocked!)).toBe('written by the old app');
    });

    it('returns null when the old v2 password is wrong', async () => {
      const { credentials } = await createCredentialsV2('Old-Passw0rd!', FAST);

      expect(await rewrapCredentials('Wrong-1!', 'New-Passw0rd!', credentials, FAST)).toBeNull();
    });

    it('returns null when the old v1 password is wrong', async () => {
      const v1 = await createStoredCredentials('Old-Passw0rd!');

      expect(await rewrapCredentials('Wrong-1!', 'New-Passw0rd!', v1, FAST)).toBeNull();
    });

    it('generates a fresh salt and IV on every change', async () => {
      const { credentials } = await createCredentialsV2('Old-Passw0rd!', FAST);

      const first = await rewrapCredentials('Old-Passw0rd!', 'New-Passw0rd!', credentials, FAST);
      const second = await rewrapCredentials('Old-Passw0rd!', 'New-Passw0rd!', credentials, FAST);

      expect(first!.credentials.kekSalt).not.toBe(credentials.kekSalt);
      expect(first!.credentials.kekSalt).not.toBe(second!.credentials.kekSalt);
      expect(first!.credentials.wrapIv).not.toBe(credentials.wrapIv);
      expect(first!.credentials.wrapIv).not.toBe(second!.credentials.wrapIv);
    });

    it('rejects credentials of an unknown version', async () => {
      const { credentials } = await createCredentialsV2('Old-Passw0rd!', FAST);
      const future = { ...credentials, version: 3 } as unknown as Parameters<
        typeof rewrapCredentials
      >[2];

      await expect(rewrapCredentials('Old-Passw0rd!', 'New-1!', future, FAST)).rejects.toThrow(
        'Unsupported credentials format'
      );
    });
  });

  describe('format guards', () => {
    it('recognises v1 and v2 credentials and nothing else', async () => {
      const v1 = await createStoredCredentials('Old-Passw0rd!');
      const { credentials: v2 } = await createCredentialsV2('Old-Passw0rd!', FAST);

      expect(isCredentialsV1(v1)).toBe(true);
      expect(isCredentialsV2(v1)).toBe(false);
      expect(isCredentialsV2(v2)).toBe(true);
      expect(isCredentialsV1(v2)).toBe(false);
      expect(isCredentialsV2({ ...v2, version: 3 })).toBe(false);
      expect(isCredentialsV1({ ...v1, version: 1 })).toBe(false);
      expect(isCredentialsV2({ ...v2, iterations: 0 })).toBe(false);
      expect(isCredentialsV1({ salt: v1.salt })).toBe(false);
      expect(isCredentialsV1(null)).toBe(false);
      expect(isCredentialsV2('v2')).toBe(false);
    });
  });

  describe('keyMatchesCredentials', () => {
    it('is true for the key the credentials wrap', async () => {
      const { credentials, key } = await createCredentialsV2('Old-Passw0rd!', FAST);

      expect(await keyMatchesCredentials(key, 'Old-Passw0rd!', credentials)).toBe(true);
    });

    it('is false for a different key', async () => {
      const { credentials } = await createCredentialsV2('Old-Passw0rd!', FAST);
      const { key: otherKey } = await createCredentialsV2('Old-Passw0rd!', FAST);

      expect(await keyMatchesCredentials(otherKey, 'Old-Passw0rd!', credentials)).toBe(false);
    });

    it('is false for a wrong password', async () => {
      const { credentials, key } = await createCredentialsV2('Old-Passw0rd!', FAST);

      expect(await keyMatchesCredentials(key, 'Wrong-1!', credentials)).toBe(false);
    });
  });
});
