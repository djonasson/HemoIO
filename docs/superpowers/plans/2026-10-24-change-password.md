# Change Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An unlocked user changes the app password from a new Settings → Security tab; afterwards only the new password unlocks HemoIO, and all existing data stays readable.

**Architecture:** A random data key (DEK) is wrapped by a password-derived key (KEK) and stored as v2 credentials. Changing the password re-wraps the DEK, so no stored data is touched. For v1 users the DEK is the key PBKDF2 derived from their password, so their first change wraps those same bytes. `AuthContext` stays the only reader/writer of `hemoio_credentials`.

**Tech Stack:** React 19, Mantine 8, Web Crypto API (PBKDF2, AES-GCM `wrapKey`/`unwrapKey`), Vitest + RTL (real `crypto.subtle` in jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-16-change-password-design.md` (sub-project 6 of `docs/superpowers/specs/2026-10-17-gherkin-completion-design.md`)

## Global Constraints

- Credentials key in localStorage: `hemoio_credentials`. v1 shape `{ salt, verificationSalt, verificationHash }` (no `version`); v2 shape `{ version: 2, kekSalt, iterations, wrapIv, wrappedKey }`.
- New credentials use `KEK_PBKDF2_ITERATIONS = 600_000`. v1 keys use the existing 100 000 iterations.
- The session key is non-extractable AES-GCM with usages `encrypt`/`decrypt`, exactly as today. No consumer of `encryptionKey` changes.
- Unknown `version` values are rejected, never guessed at.
- `changePassword` never changes `encryptionKey` or `status`.
- Logging: fixed strings only; never passwords, keys, salts, or raw error objects from crypto operations (CLAUDE.md Security Requirements).
- Copy, verbatim:
  - Success: "Password changed. Use your new password next time you unlock HemoIO."
  - Wrong current: "Current password is incorrect"
  - Same password: "New password must be different from your current password"
  - Failure: "Password could not be changed. Your existing password still works."
  - Intro: "Your data stays encrypted. Changing your password does not affect existing backup files, which use their own backup password."
- Field labels: "Current password" (`autocomplete="current-password"`), "New password" and "Confirm new password" (`autocomplete="new-password"`). Button: "Change password". Tab: "Security" with `IconLock`, after "Data".
- Tests must run with no console output (`src/test/setup.ts` fails a test on any). Expected logs are asserted with `vi.spyOn(console, 'error').mockImplementation(() => {})`.
- Gates: `npm run build`, `npm run lint`, `npx vitest run --maxWorkers=4` (no output besides results), `npx playwright test --workers=2` in both browsers.
- Prettier style: single quotes, print width 100, trailing commas es5. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Another tab changed the password.** This tab is locked later and unlocked with the new password: it must read the latest stored credentials, not the copy it loaded at startup. Pinned by Task 3 "unlock reads credentials another tab wrote".
2. **Corrupted stored credentials** (a tampered `wrappedKey`, or an unknown `version`): unlocking says the password is wrong instead of crashing the login screen. Pinned by Task 3 "unlock returns false for tampered credentials".
3. **Lock during a change.** The write still happens, so the next unlock needs the new password. Pinned by Task 3 "a change finishes even if the app locks meanwhile".
4. **Pressing Enter twice, or clicking twice, while a change is running** must start only one change. Pinned by Task 5 "starts only one change while one is running".
5. **Passwords with spaces and non-ASCII characters** must round-trip exactly, without trimming or normalising. Pinned by Task 2 "wraps and unwraps with a password containing spaces and accents".

Known cost: 600 000 PBKDF2 iterations make every setup and unlock slower (about 0.2–1 s per derivation, slowest in Firefox). That is what the spec asks for. If E2E timeouts appear, raise the timeout of the waiting assertion. Do not lower the iteration count.

---

## File Structure

| File | Responsibility |
|---|---|
| `features/change-password.feature` (create) | Business-language scenarios |
| `src/data/encryption/index.ts` (modify) | Export `PBKDF2_ITERATIONS` so v1 key bytes can be re-derived |
| `src/data/encryption/keyWrapping.ts` (create) | Pure crypto: create, unlock, rewrap v2 credentials, format guards, key round-trip check |
| `src/data/encryption/keyWrapping.test.ts` (create) | Real Web Crypto tests |
| `src/contexts/AuthContext.tsx` (modify) | v2 setup, v1/v2 unlock, `changePassword` |
| `src/contexts/AuthContext.test.tsx` (rewrite) | Real-crypto tests of every result |
| `src/contexts/index.ts` (modify) | Export the `ChangePasswordResult` type |
| `src/components/setup/SetupWizard.tsx` (+ test) (modify) | Encrypt the API key with the key `setupPassword` returns |
| `src/components/common/PasswordStrengthMeter.tsx` (+ test) (create) | Strength bar, label and requirements checklist |
| `src/components/setup/PasswordStep.tsx` (modify) | Uses the meter |
| `src/components/settings/ChangePassword.tsx` (+ test) (create) | The form |
| `src/components/settings/SettingsPage.tsx` (+ test) (modify) | Security tab |
| `e2e/steps/changePassword.steps.ts` (create) | `SecuritySettingsPage` page object, v1 seeding, lock helper |
| `e2e/change-password.spec.ts` (create) | E2E scenarios |

`keyWrapping.ts` imports from `./index`. `index.ts` does **not** re-export it, which avoids an import cycle. Consumers import from `@data/encryption/keyWrapping`.

---

### Task 1: Gherkin feature

**Files:**
- Create: `features/change-password.feature`

**Interfaces:**
- Consumes: nothing
- Produces: the scenarios Task 7 implements, one E2E test each

- [ ] **Step 1: Write the feature file**

```gherkin
Feature: Change password
  As a HemoIO user
  I want to change my password from Settings
  So that I can replace a weak password, or change it routinely, without losing my data

  Scenario: Changing the password
    Given I am logged into the application
    And I am on the Security tab of Settings
    When I enter my current password
    And I enter and confirm a new strong password
    And I click "Change password"
    Then I should see "Password changed. Use your new password next time you unlock HemoIO."
    And the password fields should be empty
    When I lock the application
    Then my old password should no longer unlock HemoIO
    And my new password should unlock HemoIO

  Scenario: My data stays readable after the change
    Given I am logged into the application
    And I have lab results with a note
    And I have saved an API key for my AI provider
    When I change my password
    And I lock the application and unlock it with my new password
    Then I should see my lab results
    And I should see my note
    And my AI provider should still have its saved API key

  Scenario: The current password is wrong
    Given I am logged into the application
    And I am on the Security tab of Settings
    When I enter an incorrect current password
    And I enter and confirm a new strong password
    And I click "Change password"
    Then I should see "Current password is incorrect"
    And the current password field should have focus
    And my new password should still be entered
    When I lock the application
    Then my old password should still unlock HemoIO

  Scenario: The confirmation does not match
    Given I am logged into the application
    And I am on the Security tab of Settings
    When I enter my current password
    And I enter a new strong password with a different confirmation
    Then I should see "Passwords do not match"
    And I should not be able to click "Change password"

  Scenario: The new password is too weak
    Given I am logged into the application
    And I am on the Security tab of Settings
    When I enter my current password
    And I enter and confirm the new password "weak"
    Then I should see which password requirements are not met
    And I should not be able to click "Change password"

  Scenario: The new password is the same as the current one
    Given I am logged into the application
    And I am on the Security tab of Settings
    When I enter my current password
    And I enter and confirm my current password as the new password
    Then I should see "New password must be different from your current password"
    And I should not be able to click "Change password"

  Scenario: A user who set up HemoIO before password changes existed
    Given I set up HemoIO with an earlier version of the app
    And I have lab results
    When I change my password
    And I lock the application and unlock it with my new password
    Then I should see my lab results
    And my old password should no longer unlock HemoIO

  Scenario: Changing the password with the keyboard only
    Given I am logged into the application
    And I am on the Security tab of Settings
    When I fill in the form using only the keyboard
    And I press Enter
    Then I should see "Password changed. Use your new password next time you unlock HemoIO."

  Scenario: Backups are not affected
    Given I am logged into the application
    When I am on the Security tab of Settings
    Then I should be told that existing backup files keep their own backup password
```

- [ ] **Step 2: Commit**

```bash
git add features/change-password.feature
git commit -m "docs(features): describe changing the password

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Key wrapping module

**Files:**
- Modify: `src/data/encryption/index.ts` (the `PBKDF2_ITERATIONS` declaration, line 13)
- Create: `src/data/encryption/keyWrapping.ts`
- Test: `src/data/encryption/keyWrapping.test.ts`

**Interfaces:**
- Consumes: `verifyPassword`, `encrypt`, `decrypt`, `encryptString`, `decryptString`, `generateSalt`, `generateIV`, `generateRandomBytes`, base64 helpers, `StoredCredentials`, `createStoredCredentials`, `getEncryptionKey` from `./index`
- Produces (all from `@data/encryption/keyWrapping`):
  - `KEK_PBKDF2_ITERATIONS = 600_000`
  - `interface StoredCredentialsV2 { version: 2; kekSalt: string; iterations: number; wrapIv: string; wrappedKey: string }`
  - `type AnyStoredCredentials = StoredCredentials | StoredCredentialsV2`
  - `interface UnlockedCredentials { credentials: StoredCredentialsV2; key: CryptoKey }`
  - `isCredentialsV1(creds: unknown): creds is StoredCredentials`
  - `isCredentialsV2(creds: unknown): creds is StoredCredentialsV2`
  - `createCredentialsV2(password: string, iterations?: number): Promise<UnlockedCredentials>`
  - `unlockV2(password: string, creds: StoredCredentialsV2): Promise<CryptoKey | null>`
  - `rewrapCredentials(oldPassword: string, newPassword: string, creds: AnyStoredCredentials, iterations?: number): Promise<UnlockedCredentials | null>` (throws on an unknown format)
  - `keyMatchesCredentials(sessionKey: CryptoKey, password: string, creds: StoredCredentialsV2): Promise<boolean>`

The optional `iterations` parameter keeps unit tests fast. The app always uses the default.

- [ ] **Step 1: Write the failing tests**

`src/data/encryption/keyWrapping.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createStoredCredentials,
  decryptString,
  encryptString,
  getEncryptionKey,
} from './index';
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

      const rewrapped = await rewrapCredentials('Old-Passw0rd!', 'New-Passw0rd!', credentials, FAST);

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/data/encryption/keyWrapping.test.ts`
Expected: FAIL, "Failed to resolve import "./keyWrapping"" (or "Cannot find module").

- [ ] **Step 3: Export the legacy iteration count**

In `src/data/encryption/index.ts`, change line 13:

```ts
/** PBKDF2 iterations of v1 credentials; v1 data keys are derived with this count */
export const PBKDF2_ITERATIONS = 100000;
```

- [ ] **Step 4: Write the implementation**

`src/data/encryption/keyWrapping.ts`:

```ts
/**
 * Key wrapping for the app password
 *
 * A data key (DEK) encrypts everything. It is stored wrapped by a key derived
 * from the password (KEK), so changing the password re-wraps the DEK and no
 * stored data is re-encrypted. For credentials written before key wrapping
 * (v1), the DEK is the key PBKDF2 derived directly from the password; the
 * first change wraps those same bytes, so v1 data never needs migrating.
 */

import {
  PBKDF2_ITERATIONS,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  base64ToUint8Array,
  decrypt,
  encrypt,
  generateIV,
  generateRandomBytes,
  generateSalt,
  uint8ArrayToBase64,
  verifyPassword,
  type StoredCredentials,
} from './index';

/** PBKDF2 iterations for new key-encryption keys */
export const KEK_PBKDF2_ITERATIONS = 600_000;

/** Credentials with a password-wrapped data key */
export interface StoredCredentialsV2 {
  version: 2;
  /** base64, regenerated on every password change */
  kekSalt: string;
  /** PBKDF2 iterations used to derive the KEK */
  iterations: number;
  /** base64 AES-GCM IV used to wrap the data key */
  wrapIv: string;
  /** base64 wrapped data key */
  wrappedKey: string;
}

export type AnyStoredCredentials = StoredCredentials | StoredCredentialsV2;

/** Credentials plus the session key they unlock */
export interface UnlockedCredentials {
  credentials: StoredCredentialsV2;
  key: CryptoKey;
}

const AES_GCM = { name: 'AES-GCM', length: 256 } as const;
const DATA_KEY_USAGES: KeyUsage[] = ['encrypt', 'decrypt'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Whether stored credentials are v2. Any other `version` is rejected.
 */
export function isCredentialsV2(creds: unknown): creds is StoredCredentialsV2 {
  return (
    isRecord(creds) &&
    creds.version === 2 &&
    typeof creds.kekSalt === 'string' &&
    typeof creds.wrapIv === 'string' &&
    typeof creds.wrappedKey === 'string' &&
    Number.isInteger(creds.iterations) &&
    (creds.iterations as number) > 0
  );
}

/**
 * Whether stored credentials are v1, which has no `version` field
 */
export function isCredentialsV1(creds: unknown): creds is StoredCredentials {
  return (
    isRecord(creds) &&
    !('version' in creds) &&
    typeof creds.salt === 'string' &&
    typeof creds.verificationSalt === 'string' &&
    typeof creds.verificationHash === 'string'
  );
}

async function importPassword(password: string, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    usage,
  ]);
}

async function deriveKek(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await importPassword(password, 'deriveKey');
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations, hash: 'SHA-256' },
    baseKey,
    AES_GCM,
    false,
    ['wrapKey', 'unwrapKey']
  );
}

async function wrapDataKey(
  dataKey: CryptoKey,
  password: string,
  iterations: number
): Promise<StoredCredentialsV2> {
  const kekSalt = generateSalt();
  const wrapIv = generateIV();
  const kek = await deriveKek(password, kekSalt, iterations);
  const wrapped = await crypto.subtle.wrapKey('raw', dataKey, kek, {
    name: 'AES-GCM',
    iv: wrapIv.buffer as ArrayBuffer,
  });
  return {
    version: 2,
    kekSalt: uint8ArrayToBase64(kekSalt),
    iterations,
    wrapIv: uint8ArrayToBase64(wrapIv),
    wrappedKey: arrayBufferToBase64(wrapped),
  };
}

/**
 * Unwraps the data key. A wrong password fails AES-GCM authentication
 * (OperationError); that failure is the password check, so it returns null.
 */
async function unwrapDataKey(
  password: string,
  creds: StoredCredentialsV2,
  extractable: boolean
): Promise<CryptoKey | null> {
  const kek = await deriveKek(password, base64ToUint8Array(creds.kekSalt), creds.iterations);
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      base64ToArrayBuffer(creds.wrappedKey),
      kek,
      { name: 'AES-GCM', iv: base64ToArrayBuffer(creds.wrapIv) },
      AES_GCM,
      extractable,
      DATA_KEY_USAGES
    );
  } catch (error) {
    // Compared by name: jsdom and the browser have different DOMException classes
    if (isRecord(error) && error.name === 'OperationError') return null;
    throw error;
  }
}

/** A non-extractable copy of an extractable data key, for the session */
async function toSessionKey(dataKey: CryptoKey): Promise<CryptoKey> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', dataKey));
  try {
    return await crypto.subtle.importKey('raw', raw, AES_GCM, false, DATA_KEY_USAGES);
  } finally {
    raw.fill(0);
  }
}

/** The v1 data key, extractable so it can be wrapped; null for a wrong password */
async function legacyDataKey(password: string, creds: StoredCredentials): Promise<CryptoKey | null> {
  if (!(await verifyPassword(password, creds))) return null;
  const baseKey = await importPassword(password, 'deriveBits');
  // The same bytes deriveKey produced for the v1 session key
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: base64ToUint8Array(creds.salt).buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );
  const raw = new Uint8Array(bits);
  try {
    return await crypto.subtle.importKey('raw', raw, AES_GCM, true, DATA_KEY_USAGES);
  } finally {
    raw.fill(0);
  }
}

/**
 * Creates v2 credentials with a new random data key
 */
export async function createCredentialsV2(
  password: string,
  iterations: number = KEK_PBKDF2_ITERATIONS
): Promise<UnlockedCredentials> {
  const dataKey = await crypto.subtle.generateKey(AES_GCM, true, DATA_KEY_USAGES);
  return {
    credentials: await wrapDataKey(dataKey, password, iterations),
    key: await toSessionKey(dataKey),
  };
}

/**
 * Unlocks v2 credentials; null when the password is wrong
 */
export function unlockV2(password: string, creds: StoredCredentialsV2): Promise<CryptoKey | null> {
  return unwrapDataKey(password, creds, false);
}

/**
 * Wraps the existing data key under a new password, with a fresh salt and IV.
 * Returns null when the old password is wrong; throws for an unknown format.
 */
export async function rewrapCredentials(
  oldPassword: string,
  newPassword: string,
  creds: AnyStoredCredentials,
  iterations: number = KEK_PBKDF2_ITERATIONS
): Promise<UnlockedCredentials | null> {
  let dataKey: CryptoKey | null;
  if (isCredentialsV2(creds)) {
    dataKey = await unwrapDataKey(oldPassword, creds, true);
  } else if (isCredentialsV1(creds)) {
    dataKey = await legacyDataKey(oldPassword, creds);
  } else {
    throw new Error('Unsupported credentials format');
  }
  if (!dataKey) return null;

  return {
    credentials: await wrapDataKey(dataKey, newPassword, iterations),
    key: await toSessionKey(dataKey),
  };
}

/**
 * Whether the credentials, unlocked with the password, hold the same key as
 * the session key. Checked by encrypting a random value with one and
 * decrypting it with the other.
 */
export async function keyMatchesCredentials(
  sessionKey: CryptoKey,
  password: string,
  creds: StoredCredentialsV2
): Promise<boolean> {
  const probe = generateRandomBytes(16);
  const ciphertext = await encrypt(probe.buffer as ArrayBuffer, sessionKey);
  const key = await unlockV2(password, creds);
  if (!key) return false;
  try {
    const plain = new Uint8Array(await decrypt(ciphertext, key));
    return plain.length === probe.length && plain.every((byte, i) => byte === probe[i]);
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/data/encryption/`
Expected: PASS, every test in `keyWrapping.test.ts` and `encryption.test.ts`, no console output.

- [ ] **Step 6: Commit**

```bash
git add src/data/encryption/index.ts src/data/encryption/keyWrapping.ts src/data/encryption/keyWrapping.test.ts
git commit -m "feat(encryption): wrap the data key with a password-derived key

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: AuthContext — v2 setup, v1/v2 unlock, changePassword; SetupWizard uses the returned key

**Files:**
- Modify: `src/contexts/AuthContext.tsx` (whole file)
- Rewrite: `src/contexts/AuthContext.test.tsx`
- Modify: `src/contexts/index.ts` (add the type export)
- Modify: `src/components/setup/SetupWizard.tsx:33-41,108-136`
- Modify: `src/components/setup/SetupWizard.test.tsx:9-31` (the `@data/encryption` mock) and add one test

**Interfaces:**
- Consumes: everything Task 2 produces, from `@data/encryption/keyWrapping`; `verifyPassword`, `getEncryptionKey` from `@data/encryption`
- Produces:
  - `type ChangePasswordResult = { ok: true } | { ok: false; reason: 'wrong_password' | 'same_password' | 'failed' }`, exported from `@contexts`
  - `AuthContextValue.setupPassword: (password: string) => Promise<CryptoKey>`
  - `AuthContextValue.changePassword: (current: string, next: string) => Promise<ChangePasswordResult>`, which never throws

Why `SetupWizard` changes in this task: once setup writes v2 credentials, the wizard's re-derivation (`SetupWizard.tsx:121-129`) reads v2 credentials as v1 and throws, so the API key entered during setup is lost. The two changes must land together.

The real 600 000-iteration derivation runs in these tests: a test covers what the app really does. Expect the file to take several seconds. If any single test passes 5 s, give that test a 15 000 ms timeout and ledger it. Do not mock the crypto.

- [ ] **Step 1: Write the failing AuthContext tests**

Replace `src/contexts/AuthContext.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useContext } from 'react';
import { AuthProvider, AuthContext, type AuthContextValue } from './AuthContext';
import {
  createStoredCredentials,
  decryptString,
  encryptString,
} from '@data/encryption';
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
  auth = context;
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
    it('writes v2 credentials, unlocks, and returns the session key', async () => {
      renderAuth();

      let key: CryptoKey | undefined;
      await act(async () => {
        key = await auth.setupPassword(OLD);
      });

      expect(isCredentialsV2(storedCredentials())).toBe(true);
      expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
      expect(auth.encryptionKey).toBe(key);
      expect(key!.extractable).toBe(false);
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/contexts/AuthContext.test.tsx`
Expected: FAIL. `setupPassword` writes v1 credentials (`isCredentialsV2` false), `auth.changePassword is not a function`, and the unknown-version test unlocks v1-style. The initial-state and v1-unlock tests may already pass; that is fine.

- [ ] **Step 3: Rewrite AuthContext**

`src/contexts/AuthContext.tsx`:

```tsx
/**
 * Authentication Context
 *
 * Manages user authentication, encryption key handling, password setup and
 * password changes. The only reader and writer of the stored credentials.
 */

import { createContext, useState, useCallback, type ReactNode } from 'react';
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
  | { ok: true }
  | { ok: false; reason: 'wrong_password' | 'same_password' | 'failed' };

export interface AuthContextValue {
  status: AuthStatus;
  encryptionKey: CryptoKey | null;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  /** Creates credentials, unlocks, and returns the session key */
  setupPassword: (password: string) => Promise<CryptoKey>;
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

export function AuthProvider({ children }: AuthProviderProps): ReactNode {
  const storedCreds = loadStoredCredentials();

  const [status, setStatus] = useState<AuthStatus>(storedCreds ? 'locked' : 'needs_setup');
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [credentials, setCredentials] = useState<object | null>(storedCreds);

  const isSetupComplete = useCallback((): boolean => {
    return credentials !== null || loadStoredCredentials() !== null;
  }, [credentials]);

  const setupPassword = useCallback(async (password: string): Promise<CryptoKey> => {
    const { credentials: newCredentials, key } = await createCredentialsV2(password);
    saveStoredCredentials(newCredentials);
    setCredentials(newCredentials);

    // Automatically unlock after setup
    setEncryptionKey(key);
    setStatus('unlocked');
    return key;
  }, []);

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
```

In `src/contexts/index.ts`, change the first line to:

```ts
export { AuthProvider, type ChangePasswordResult } from './AuthContext';
```

- [ ] **Step 4: Run the AuthContext tests to verify they pass**

Run: `npx vitest run src/contexts/AuthContext.test.tsx src/contexts/useAuth.test.tsx`
Expected: PASS, no console output. If `useAuth.test.tsx` builds an `AuthContextValue` literal, it now lacks `changePassword`: add `changePassword: vi.fn()` to it and make its `setupPassword` mock resolve to a key object.

- [ ] **Step 5: Write the failing SetupWizard test**

In `src/components/setup/SetupWizard.test.tsx`, replace the `vi.mock('@data/encryption', ...)` block (lines 9-31). The real module is needed now, because `AuthProvider` creates real v2 credentials through `keyWrapping`, which imports `./index`:

```tsx
vi.mock('@data/encryption', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@data/encryption')>()),
  encryptString: vi.fn().mockResolvedValue('encrypted'),
}));
```

Add `import { encryptString } from '@data/encryption';` to the imports, plus `userEvent` if the file lacks it. Then add this test inside `describe('SetupWizard')`:

```tsx
  it('encrypts the API key with the key the password setup returned', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

    await user.type(screen.getByPlaceholderText('Enter your password'), 'Str0ng-Passw0rd!');
    await user.type(screen.getByPlaceholderText('Confirm your password'), 'Str0ng-Passw0rd!');
    await user.click(screen.getByRole('button', { name: 'Go to next step' }));
    await user.click(screen.getByRole('button', { name: 'Go to next step' }));

    await user.click(screen.getByRole('textbox', { name: 'AI Provider' }));
    await user.click(await screen.findByRole('option', { name: 'Anthropic (Claude)' }));
    await user.type(screen.getByLabelText('API Key'), 'sk-ant-test-1234');
    await user.click(screen.getByRole('button', { name: 'Go to next step' }));
    await user.click(screen.getByRole('button', { name: 'Complete setup and get started' }));

    await waitFor(() => expect(mockOnComplete).toHaveBeenCalled());
    expect(encryptString).toHaveBeenCalledWith(
      'sk-ant-test-1234',
      expect.objectContaining({ type: 'secret', extractable: false })
    );
    expect(localStorage.getItem('hemoio_ai_api_key_encrypted')).toBe('encrypted');
  }, 15000);
```

If the provider select's accessible role differs in jsdom, locate it with `screen.getByLabelText('AI Provider')`.

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/components/setup/SetupWizard.test.tsx`
Expected: FAIL. The wizard reads the v2 credentials as v1, `getEncryptionKey` throws, and the test fails on the unexpected console output "Setup failed: ..." (or `onComplete` is never called). The other SetupWizard tests pass.

- [ ] **Step 7: Use the returned key in SetupWizard**

In `src/components/setup/SetupWizard.tsx`, replace the encryption import block (lines 33-37) with:

```tsx
import { encryptString } from '@data/encryption';
```

Delete the line `const CREDENTIALS_STORAGE_KEY = 'hemoio_credentials';`. In `handleComplete`, replace `await setupPassword(password);` with:

```tsx
      // Setup password and get the session encryption key
      const encryptionKey = await setupPassword(password);
```

and replace the whole `if (apiKey) { ... }` block with:

```tsx
        // Encrypt API key if provided
        if (apiKey) {
          const encryptedApiKey = await encryptString(apiKey, encryptionKey);
          localStorage.setItem(ENCRYPTED_API_KEY_STORAGE_KEY, encryptedApiKey);
        }
```

- [ ] **Step 8: Run the affected tests to verify they pass**

Run: `npx vitest run src/components/setup src/contexts`
Expected: PASS, no console output.

- [ ] **Step 9: Type-check and commit**

Run: `npx tsc -b`
Expected: no errors. A test elsewhere that mocks `useAuth` and types `setupPassword` as `Promise<void>` fails here; give that mock a `changePassword: vi.fn()` and let `setupPassword` resolve to `{} as CryptoKey`.

```bash
git add src/contexts src/components/setup/SetupWizard.tsx src/components/setup/SetupWizard.test.tsx
git commit -m "feat(auth): store a wrapped data key and let the password change

Setup writes v2 credentials and returns the session key, which the setup
wizard now uses to encrypt the API key instead of re-deriving it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Shared password strength meter

**Files:**
- Create: `src/components/common/PasswordStrengthMeter.tsx`
- Test: `src/components/common/PasswordStrengthMeter.test.tsx`
- Modify: `src/components/common/index.ts` (add the export)
- Modify: `src/components/setup/PasswordStep.tsx` (remove the meter code, use the component)

**Interfaces:**
- Consumes: `checkPasswordStrength` from `@data/encryption`
- Produces: `PasswordStrengthMeter({ password }: PasswordStrengthMeterProps): React.ReactNode`, from `@components/common/PasswordStrengthMeter`. It renders the strength bar and label (only when `password` is non-empty) and always renders the "Password requirements:" checklist.

Mantine's `PasswordInput` sets its own `aria-describedby` (from its error and description) and ignores one passed in. So the current `aria-describedby="password-requirements"` in `PasswordStep` never reaches the input. The meter follows the input in reading order instead; do not add another `aria-describedby`.

- [ ] **Step 1: Write the failing tests**

`src/components/common/PasswordStrengthMeter.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

function renderMeter(password: string) {
  return render(
    <MantineProvider env="test">
      <PasswordStrengthMeter password={password} />
    </MantineProvider>
  );
}

describe('PasswordStrengthMeter', () => {
  it('lists the requirements without a strength bar while the password is empty', () => {
    renderMeter('');

    expect(screen.getByText('Password requirements:')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByText(/Password strength:/)).not.toBeInTheDocument();
  });

  it('labels a weak password', () => {
    renderMeter('abc');

    expect(screen.getByText('Password strength: Weak')).toBeInTheDocument();
    expect(screen.getByLabelText('Password strength: Weak')).toBeInTheDocument();
  });

  it('labels a strong password', () => {
    renderMeter('Str0ng-Passw0rd!');

    expect(screen.getByText('Password strength: Strong')).toBeInTheDocument();
  });

  it('marks each requirement as met or not with an icon and text', () => {
    renderMeter('abcdefgh');

    const list = screen.getByRole('list');
    expect(within(list).getByText('At least 8 characters')).toBeInTheDocument();
    expect(within(list).getByText('At least one lowercase letter')).toBeInTheDocument();
    expect(within(list).getByText('At least one uppercase letter')).toBeInTheDocument();
    expect(within(list).getByText('At least one number')).toBeInTheDocument();
    expect(within(list).getByText('At least one special character')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/common/PasswordStrengthMeter.test.tsx`
Expected: FAIL, cannot resolve `./PasswordStrengthMeter`.

- [ ] **Step 3: Create the component**

`src/components/common/PasswordStrengthMeter.tsx` holds the code moved out of `PasswordStep.tsx`. Its text, colours and icons are unchanged.

```tsx
/**
 * Password strength bar, label and requirements checklist.
 * Used by the setup wizard and by Settings → Security.
 */

import { Stack, Text, Progress, List, ThemeIcon, Group } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { checkPasswordStrength, type PasswordStrengthResult } from '@data/encryption';

export interface PasswordStrengthMeterProps {
  password: string;
}

function getProgressColor(score: number): string {
  if (score <= 1) return 'red';
  if (score <= 2) return 'orange';
  if (score <= 3) return 'yellow';
  return 'green';
}

function getStrengthLabel(score: number): string {
  if (score <= 1) return 'Weak';
  if (score <= 2) return 'Fair';
  if (score <= 3) return 'Good';
  return 'Strong';
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps): React.ReactNode {
  const strength = checkPasswordStrength(password);
  const label = getStrengthLabel(strength.score);

  return (
    <Stack gap="lg">
      {password.length > 0 && (
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Password strength: {label}
            </Text>
          </Group>
          <Progress
            value={(strength.score / 5) * 100}
            color={getProgressColor(strength.score)}
            size="sm"
            aria-label={`Password strength: ${label}`}
          />
        </Stack>
      )}

      <div>
        <Text size="sm" fw={500} mb="xs">
          Password requirements:
        </Text>
        <PasswordRequirements strength={strength} />
      </div>
    </Stack>
  );
}

interface PasswordRequirementsProps {
  strength: PasswordStrengthResult;
}

function PasswordRequirements({ strength }: PasswordRequirementsProps): React.ReactNode {
  const requirements = [
    { label: 'At least 8 characters', met: strength.checks.minLength },
    { label: 'At least one uppercase letter', met: strength.checks.hasUppercase },
    { label: 'At least one lowercase letter', met: strength.checks.hasLowercase },
    { label: 'At least one number', met: strength.checks.hasNumber },
    { label: 'At least one special character', met: strength.checks.hasSpecial },
  ];

  return (
    <List spacing="xs" size="sm" center>
      {requirements.map((req) => (
        <List.Item
          key={req.label}
          icon={
            <ThemeIcon color={req.met ? 'green' : 'gray'} size="sm" radius="xl" aria-hidden="true">
              {req.met ? <IconCheck size={12} /> : <IconX size={12} />}
            </ThemeIcon>
          }
        >
          <Text size="sm" c={req.met ? 'green' : 'dimmed'}>
            {req.label}
          </Text>
        </List.Item>
      ))}
    </List>
  );
}
```

`PasswordRequirements` is a private helper in the same file. That follows the existing `PasswordStep.tsx` layout.

Add to `src/components/common/index.ts`:

```ts
export { PasswordStrengthMeter, type PasswordStrengthMeterProps } from './PasswordStrengthMeter';
```

- [ ] **Step 4: Use it in PasswordStep**

In `src/components/setup/PasswordStep.tsx`:
- remove `getProgressColor`, `getStrengthLabel`, `strength`, the strength `Stack`, the `id="password-requirements"` div, `PasswordRequirements` and its props interface;
- remove the now-unused imports (`Progress`, `List`, `ThemeIcon`, `Group`, `IconCheck`, `IconX`, `checkPasswordStrength`, `PasswordStrengthResult`);
- remove `aria-describedby="password-requirements"` from the first `PasswordInput` (Mantine ignores it, see above);
- import `PasswordStrengthMeter` from `@components/common/PasswordStrengthMeter` and render `<PasswordStrengthMeter password={password} />` where the strength block and requirements were, between the two inputs.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/common src/components/setup`
Expected: PASS, including the unchanged `PasswordStep.test.tsx`, with no console output.

- [ ] **Step 6: Commit**

```bash
git add src/components/common src/components/setup/PasswordStep.tsx
git commit -m "refactor(setup): share the password strength meter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: ChangePassword form

**Files:**
- Create: `src/components/settings/ChangePassword.tsx`
- Test: `src/components/settings/ChangePassword.test.tsx`
- Modify: `src/components/settings/index.ts` (add the export)

**Interfaces:**
- Consumes: `useAuth()` from `@contexts`, whose `changePassword(current, next): Promise<ChangePasswordResult>` never throws (Task 3); `PasswordStrengthMeter` (Task 4); `isPasswordStepValid(password, confirm)` from `@components/setup/passwordUtils`; `useFormKeyboardSubmit({ canSubmit })` from `@hooks`
- Produces: `ChangePassword(): React.ReactNode` (no props), from `./ChangePassword`

Ruling made in this plan: the spec disables the button when the new password equals the current one, so a `same_password` result cannot come from the form. The form therefore shows the same-password error **live**, under "New password", whenever both fields are filled and equal. The Gherkin scenario needs a visible message, and this is the only way to show one.

- [ ] **Step 1: Write the failing tests**

`src/components/settings/ChangePassword.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import type { ChangePasswordResult } from '@contexts';
import { ChangePassword } from './ChangePassword';

const mockChangePassword = vi.hoisted(() =>
  vi.fn<(current: string, next: string) => Promise<ChangePasswordResult>>()
);
vi.mock('@contexts', () => ({
  useAuth: () => ({ changePassword: mockChangePassword }),
}));

const CURRENT = 'Old-Passw0rd!';
const NEXT = 'New-Passw0rd!';

function renderForm() {
  return render(
    <MantineProvider env="test">
      <ChangePassword />
    </MantineProvider>
  );
}

const current = () => screen.getByLabelText('Current password');
const next = () => screen.getByLabelText('New password');
const confirm = () => screen.getByLabelText('Confirm new password');
const submit = () => screen.getByRole('button', { name: 'Change password' });

async function fill(user: ReturnType<typeof userEvent.setup>, c = CURRENT, n = NEXT, k = n) {
  if (c) await user.type(current(), c);
  if (n) await user.type(next(), n);
  if (k) await user.type(confirm(), k);
}

describe('ChangePassword', () => {
  beforeEach(() => {
    mockChangePassword.mockReset();
  });

  it('explains that data stays encrypted and backups keep their own password', () => {
    renderForm();

    expect(
      screen.getByText(
        'Your data stays encrypted. Changing your password does not affect existing backup files, which use their own backup password.'
      )
    ).toBeInTheDocument();
  });

  it('labels the fields and sets their autocomplete hints', () => {
    renderForm();

    expect(current()).toHaveAttribute('autocomplete', 'current-password');
    expect(next()).toHaveAttribute('autocomplete', 'new-password');
    expect(confirm()).toHaveAttribute('autocomplete', 'new-password');
  });

  it('enables the button only for a valid, confirmed, different new password', async () => {
    const user = userEvent.setup();
    renderForm();
    expect(submit()).toBeDisabled();

    await fill(user);

    expect(submit()).toBeEnabled();
  });

  it('keeps the button disabled without the current password', async () => {
    const user = userEvent.setup();
    renderForm();

    await fill(user, '');

    expect(submit()).toBeDisabled();
  });

  it('keeps the button disabled for a weak new password', async () => {
    const user = userEvent.setup();
    renderForm();

    await fill(user, CURRENT, 'weak');

    expect(submit()).toBeDisabled();
    expect(screen.getByText('Password strength: Weak')).toBeInTheDocument();
  });

  it('shows a mismatch and keeps the button disabled', async () => {
    const user = userEvent.setup();
    renderForm();

    await fill(user, CURRENT, NEXT, 'New-Passw0rd?');

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  it('says the new password must differ, and keeps the button disabled', async () => {
    const user = userEvent.setup();
    renderForm();

    await fill(user, CURRENT, CURRENT);

    expect(
      screen.getByText('New password must be different from your current password')
    ).toBeInTheDocument();
    expect(next()).toHaveAttribute('aria-invalid', 'true');
    expect(submit()).toBeDisabled();
  });

  it('changes the password, confirms with a status message, and clears the fields', async () => {
    const user = userEvent.setup();
    mockChangePassword.mockResolvedValue({ ok: true });
    renderForm();
    await fill(user);

    await user.click(submit());

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(
      'Password changed. Use your new password next time you unlock HemoIO.'
    );
    expect(mockChangePassword).toHaveBeenCalledWith(CURRENT, NEXT);
    expect(current()).toHaveValue('');
    expect(next()).toHaveValue('');
    expect(confirm()).toHaveValue('');
  });

  it('submits with Enter', async () => {
    const user = userEvent.setup();
    mockChangePassword.mockResolvedValue({ ok: true });
    renderForm();
    await fill(user);

    await user.keyboard('{Enter}');

    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(mockChangePassword).toHaveBeenCalledTimes(1);
  });

  it('disables the form and shows progress while changing', async () => {
    const user = userEvent.setup();
    let finish: (result: ChangePasswordResult) => void = () => {};
    mockChangePassword.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderForm();
    await fill(user);

    await user.click(submit());

    expect(current()).toBeDisabled();
    expect(next()).toBeDisabled();
    expect(confirm()).toBeDisabled();
    expect(submit()).toHaveAttribute('data-loading', 'true');
    finish({ ok: true });
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('starts only one change while one is running', async () => {
    const user = userEvent.setup();
    let finish: (result: ChangePasswordResult) => void = () => {};
    mockChangePassword.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderForm();
    await fill(user);

    await user.click(submit());
    await user.click(submit());
    await user.keyboard('{Enter}');

    expect(mockChangePassword).toHaveBeenCalledTimes(1);
    finish({ ok: true });
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('flags a wrong current password, focuses it, and keeps the new password', async () => {
    const user = userEvent.setup();
    mockChangePassword.mockResolvedValue({ ok: false, reason: 'wrong_password' });
    renderForm();
    await fill(user);

    await user.click(submit());

    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
    expect(current()).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(current()).toHaveFocus());
    expect(next()).toHaveValue(NEXT);
    expect(confirm()).toHaveValue(NEXT);
  });

  it('clears the wrong-password error once the current password is edited', async () => {
    const user = userEvent.setup();
    mockChangePassword.mockResolvedValue({ ok: false, reason: 'wrong_password' });
    renderForm();
    await fill(user);
    await user.click(submit());
    await screen.findByText('Current password is incorrect');

    await user.type(current(), 'x');

    expect(screen.queryByText('Current password is incorrect')).not.toBeInTheDocument();
  });

  it('reports a failure as an alert', async () => {
    const user = userEvent.setup();
    mockChangePassword.mockResolvedValue({ ok: false, reason: 'failed' });
    renderForm();
    await fill(user);

    await user.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Password could not be changed. Your existing password still works.'
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('ignores the result if it arrives after the form is gone', async () => {
    const user = userEvent.setup();
    let finish: (result: ChangePasswordResult) => void = () => {};
    mockChangePassword.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { unmount } = renderForm();
    await fill(user);
    await user.click(submit());

    unmount();
    finish({ ok: true });

    // The console guard fails the test if React warns about the unmounted form
    await Promise.resolve();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/settings/ChangePassword.test.tsx`
Expected: FAIL, cannot resolve `./ChangePassword`.

- [ ] **Step 3: Write the component**

`src/components/settings/ChangePassword.tsx`:

```tsx
/**
 * ChangePassword Component
 *
 * Settings → Security form that changes the app password. The data key is
 * re-wrapped, so stored data and existing backups are untouched.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Stack, Title, Text, PasswordInput, Button, Alert } from '@mantine/core';
import { IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { useAuth } from '@contexts';
import { useFormKeyboardSubmit } from '@hooks';
import { PasswordStrengthMeter } from '@components/common/PasswordStrengthMeter';
import { isPasswordStepValid } from '@components/setup/passwordUtils';

const WRONG_PASSWORD = 'Current password is incorrect';
const SAME_PASSWORD = 'New password must be different from your current password';

type Outcome = 'success' | 'failed' | null;

export function ChangePassword(): React.ReactNode {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const currentRef = useRef<HTMLInputElement>(null);
  // Guards against a second submit before React re-renders the disabled button
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // After a wrong password the inputs are enabled again only on the next
  // render, so focus moves once the error has rendered
  useEffect(() => {
    if (currentError) currentRef.current?.focus();
  }, [currentError]);

  const isSame = newPassword.length > 0 && newPassword === currentPassword;
  const confirmMismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    isPasswordStepValid(newPassword, confirmPassword) &&
    !isSame &&
    !isSubmitting;

  const { formRef } = useFormKeyboardSubmit({ canSubmit });

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!canSubmit || submittingRef.current) return;

      submittingRef.current = true;
      setIsSubmitting(true);
      setOutcome(null);
      setCurrentError(null);
      const result = await changePassword(currentPassword, newPassword);
      submittingRef.current = false;
      if (!mountedRef.current) return;

      setIsSubmitting(false);
      if (result.ok) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setOutcome('success');
      } else if (result.reason === 'wrong_password') {
        setCurrentError(WRONG_PASSWORD);
      } else if (result.reason === 'failed') {
        setOutcome('failed');
      }
      // same_password cannot be submitted: the form shows it live
    },
    [canSubmit, changePassword, currentPassword, newPassword]
  );

  return (
    <Stack gap="md" maw={480}>
      <Title order={4}>Change password</Title>
      <Text size="sm" c="dimmed">
        Your data stays encrypted. Changing your password does not affect existing backup files,
        which use their own backup password.
      </Text>

      {outcome === 'success' && (
        <Alert role="status" color="green" variant="light" icon={<IconCheck size={16} />}>
          Password changed. Use your new password next time you unlock HemoIO.
        </Alert>
      )}
      {outcome === 'failed' && (
        <Alert role="alert" color="red" variant="light" icon={<IconAlertCircle size={16} />}>
          Password could not be changed. Your existing password still works.
        </Alert>
      )}

      <form ref={formRef} onSubmit={handleSubmit} noValidate>
        <Stack gap="md">
          <PasswordInput
            ref={currentRef}
            label="Current password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => {
              setCurrentPassword(event.currentTarget.value);
              setCurrentError(null);
            }}
            error={currentError ?? undefined}
            disabled={isSubmitting}
          />
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.currentTarget.value)}
            error={isSame ? SAME_PASSWORD : undefined}
            disabled={isSubmitting}
          />
          <PasswordStrengthMeter password={newPassword} />
          <PasswordInput
            label="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.currentTarget.value)}
            error={confirmMismatch ? 'Passwords do not match' : undefined}
            disabled={isSubmitting}
          />
          <Button
            type="submit"
            loading={isSubmitting}
            disabled={!canSubmit && !isSubmitting}
            style={{ alignSelf: 'flex-start' }}
          >
            Change password
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
```

`disabled={!canSubmit && !isSubmitting}` lets Mantine's `loading` state own the button while submitting; a loading Mantine button is already inert. The `submittingRef` covers Enter pressed again before the re-render.

Add to `src/components/settings/index.ts`:

```ts
export { ChangePassword } from './ChangePassword';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/settings/ChangePassword.test.tsx`
Expected: PASS, no console output. If the loading assertion fails because this Mantine version does not set `data-loading` on the button, assert `toBeDisabled()` instead and ledger the ruling.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/ChangePassword.tsx src/components/settings/ChangePassword.test.tsx src/components/settings/index.ts
git commit -m "feat(settings): add the change password form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Security tab in Settings

**Files:**
- Modify: `src/components/settings/SettingsPage.tsx` (icon imports and the `Tabs` block)
- Modify: `src/components/settings/SettingsPage.test.tsx` (an `@contexts` mock plus two tests)

**Interfaces:**
- Consumes: `ChangePassword` (Task 5)
- Produces: a "Security" tab (`value="security"`) placed after "Data". Its panel renders `<ChangePassword />`.

- [ ] **Step 1: Write the failing tests**

In `src/components/settings/SettingsPage.test.tsx`, add this mock next to the other `vi.mock` calls:

```tsx
vi.mock('@contexts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@contexts')>()),
  useAuth: () => ({ changePassword: vi.fn() }),
}));
```

Add these tests to `describe('tab navigation')`. They follow the existing tab tests' render helper and `act` pattern (see the "Personal Targets" tab test at line 249):

```tsx
    it('places the Security tab right after Data', async () => {
      await renderSettingsPage();

      const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
      expect(tabs.indexOf('Security')).toBe(tabs.indexOf('Data') + 1);
    });

    it('should switch to Security tab when clicked', async () => {
      const user = userEvent.setup();
      await renderSettingsPage();

      await user.click(screen.getByRole('tab', { name: 'Security' }));

      expect(screen.getByRole('heading', { name: 'Change password' })).toBeInTheDocument();
      expect(screen.getByLabelText('Current password')).toBeInTheDocument();
    });
```

If the file's render helper has a different name, use that helper.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/settings/SettingsPage.test.tsx`
Expected: FAIL: no tab named "Security" (`indexOf` returns -1, which is not `indexOf('Data') + 1`).

- [ ] **Step 3: Add the tab**

In `src/components/settings/SettingsPage.tsx`:
- add `IconLock` to the `@tabler/icons-react` import;
- add `import { ChangePassword } from './ChangePassword';` after the `BackupRestore` import;
- after the Data `Tabs.Tab`, insert:

```tsx
          <Tabs.Tab value="security" leftSection={<IconLock size={16} />}>
            Security
          </Tabs.Tab>
```

- after the Data `Tabs.Panel`, insert:

```tsx
        <Tabs.Panel value="security" pt="md">
          <ChangePassword />
        </Tabs.Panel>
```

- [ ] **Step 4: Run the settings tests to verify they pass**

Run: `npx vitest run src/components/settings`
Expected: PASS, no console output.

- [ ] **Step 5: Run the whole unit suite, build and lint**

Run: `npx vitest run --maxWorkers=4 > .superpowers/sdd/2026-10-24-change-password/vitest.log 2>&1; tail -5 .superpowers/sdd/2026-10-24-change-password/vitest.log; npm run build 2>&1 | tail -5; npm run lint`
Expected: every test passes; the log shows no stderr or stdout besides results; the build succeeds (only the known chunk-size warning); lint is clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/SettingsPage.tsx src/components/settings/SettingsPage.test.tsx
git commit -m "feat(settings): add a Security tab with the password change

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: E2E

**Files:**
- Create: `e2e/steps/changePassword.steps.ts`
- Create: `e2e/change-password.spec.ts`

**Interfaces:**
- Consumes: `TEST_PASSWORD`, `setupOrUnlock`, `unlockApp` (`e2e/steps/app.steps.ts`); `seedLabData` (`data.steps.ts`); `seedNotesData`, `noteSeed`, `goToNotes`, `noteCards` (`userNotes.steps.ts`); `mockAnthropicApi`, `configureAnthropic` (`aiModelSelection.steps.ts`; the key ends in `0000`)
- Produces:
  - `NEW_PASSWORD`
  - `class SecuritySettingsPage`
  - `lockApp(page)`
  - `expectPasswordRejected(page, password)`
  - `seedV1Credentials(page, password)`

Do not edit `src/` while Playwright runs: its web server reuses the dev server on :5173.

- [ ] **Step 1: Write the steps file**

`e2e/steps/changePassword.steps.ts`:

```ts
/**
 * Step definitions for features/change-password.feature
 */

import { expect, type Locator, type Page } from '@playwright/test';

export const NEW_PASSWORD = 'N3w-Secure-Passw0rd!';

/**
 * Settings → Security, where the password is changed
 */
export class SecuritySettingsPage {
  readonly currentPassword: Locator;
  readonly newPassword: Locator;
  readonly confirmPassword: Locator;
  readonly submit: Locator;
  readonly success: Locator;

  constructor(private readonly page: Page) {
    this.currentPassword = page.getByLabel('Current password', { exact: true });
    this.newPassword = page.getByLabel('New password', { exact: true });
    this.confirmPassword = page.getByLabel('Confirm new password', { exact: true });
    this.submit = page.getByRole('button', { name: 'Change password' });
    this.success = page
      .getByRole('status')
      .filter({ hasText: 'Password changed. Use your new password next time you unlock HemoIO.' });
  }

  /** And I am on the Security tab of Settings */
  async open(): Promise<void> {
    await this.page.locator('nav').getByText('Settings', { exact: true }).click();
    await this.page.getByRole('tab', { name: 'Security' }).click();
    await expect(this.page.getByRole('heading', { name: 'Change password' })).toBeVisible();
  }

  async fill(current: string, next: string, confirm: string = next): Promise<void> {
    await this.currentPassword.fill(current);
    await this.newPassword.fill(next);
    await this.confirmPassword.fill(confirm);
  }

  /** When I change my password (and it succeeds) */
  async change(current: string, next: string): Promise<void> {
    await this.open();
    await this.fill(current, next);
    await this.submit.click();
    await expect(this.success).toBeVisible();
  }
}

/** When I lock the application */
export async function lockApp(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Lock application' }).click();
  await expect(page.getByText('Enter your password to unlock your lab data')).toBeVisible();
}

/** Then <password> should no longer unlock HemoIO (stays on the login screen) */
export async function expectPasswordRejected(page: Page, password: string): Promise<void> {
  const field = page.getByRole('textbox', { name: 'Password', exact: true });
  await field.fill(password);
  await page.getByRole('button', { name: /unlock/i }).click();
  await expect(page.getByText('Incorrect password')).toBeVisible();
  await field.fill('');
}

/**
 * Given I set up HemoIO with an earlier version of the app
 *
 * Writes credentials in the pre-key-wrapping (v1) format, as the earlier
 * app's createStoredCredentials did: a random salt for the data key, and a
 * PBKDF2-SHA256 (100 000 iterations) verification hash with its own salt.
 * Ends on the login screen.
 */
export async function seedV1Credentials(page: Page, password: string): Promise<void> {
  await page.goto('/');
  await page.evaluate(async (pw) => {
    const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const verificationSalt = crypto.getRandomValues(new Uint8Array(16));
    const baseKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(pw),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const hash = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: verificationSalt, iterations: 100000, hash: 'SHA-256' },
      baseKey,
      256
    );
    localStorage.clear();
    localStorage.setItem(
      'hemoio_credentials',
      JSON.stringify({
        salt: toBase64(salt),
        verificationSalt: toBase64(verificationSalt),
        verificationHash: toBase64(new Uint8Array(hash)),
      })
    );
  }, password);
  await page.reload();
  await expect(page.getByText('Enter your password to unlock your lab data')).toBeVisible();
}

/** The format of the stored credentials: 2, or undefined for v1 */
export async function storedCredentialsVersion(page: Page): Promise<unknown> {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem('hemoio_credentials') ?? '{}').version
  );
}
```

- [ ] **Step 2: Write the spec**

`e2e/change-password.spec.ts`:

```ts
/**
 * E2E tests for features/change-password.feature
 */

import { test, expect } from '@playwright/test';
import { TEST_PASSWORD, setupOrUnlock, unlockApp } from './steps/app.steps';
import { seedLabData } from './steps/data.steps';
import { goToNotes, noteCards, noteSeed, seedNotesData } from './steps/userNotes.steps';
import { configureAnthropic, mockAnthropicApi } from './steps/aiModelSelection.steps';
import {
  NEW_PASSWORD,
  SecuritySettingsPage,
  expectPasswordRejected,
  lockApp,
  seedV1Credentials,
  storedCredentialsVersion,
} from './steps/changePassword.steps';

test.describe('Change password', () => {
  test('changing the password', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    const security = new SecuritySettingsPage(page);
    await security.open();

    await security.fill(TEST_PASSWORD, NEW_PASSWORD);
    await security.submit.click();

    await expect(security.success).toBeVisible();
    await expect(security.currentPassword).toHaveValue('');
    await expect(security.newPassword).toHaveValue('');
    await expect(security.confirmPassword).toHaveValue('');
    await lockApp(page);
    await expectPasswordRejected(page, TEST_PASSWORD);
    await unlockApp(page, NEW_PASSWORD);
  });

  test('my data stays readable after the change', async ({ page }) => {
    await mockAnthropicApi(page);
    await page.goto('/');
    await setupOrUnlock(page);
    await seedNotesData(page, [noteSeed(1, { labResultId: 1 }, 'Fasted for twelve hours')]);
    await configureAnthropic(page);

    await new SecuritySettingsPage(page).change(TEST_PASSWORD, NEW_PASSWORD);
    await lockApp(page);
    await unlockApp(page, NEW_PASSWORD);

    await page.locator('nav').getByText('Timeline', { exact: true }).click();
    await expect(page.getByText('Quest Diagnostics')).toBeVisible();
    const notes = await goToNotes(page);
    await expect(noteCards(notes).filter({ hasText: 'Fasted for twelve hours' })).toBeVisible();
    await page.locator('nav').getByText('Settings', { exact: true }).click();
    await page.getByRole('tab', { name: 'AI Configuration' }).click();
    await expect(page.getByText('••••••••0000')).toBeVisible();
  });

  test('the current password is wrong', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    const security = new SecuritySettingsPage(page);
    await security.open();

    await security.fill('Not-My-Passw0rd!', NEW_PASSWORD);
    await security.submit.click();

    await expect(page.getByText('Current password is incorrect')).toBeVisible();
    await expect(security.currentPassword).toBeFocused();
    await expect(security.newPassword).toHaveValue(NEW_PASSWORD);
    await expect(security.confirmPassword).toHaveValue(NEW_PASSWORD);
    await lockApp(page);
    await unlockApp(page, TEST_PASSWORD);
  });

  test('the confirmation does not match', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    const security = new SecuritySettingsPage(page);
    await security.open();

    await security.fill(TEST_PASSWORD, NEW_PASSWORD, `${NEW_PASSWORD}x`);

    await expect(page.getByText('Passwords do not match')).toBeVisible();
    await expect(security.submit).toBeDisabled();
  });

  test('the new password is too weak', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    const security = new SecuritySettingsPage(page);
    await security.open();

    await security.fill(TEST_PASSWORD, 'weak');

    await expect(page.getByText('Password strength: Weak')).toBeVisible();
    await expect(page.getByText('At least 8 characters')).toBeVisible();
    await expect(security.submit).toBeDisabled();
  });

  test('the new password is the same as the current one', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    const security = new SecuritySettingsPage(page);
    await security.open();

    await security.fill(TEST_PASSWORD, TEST_PASSWORD);

    await expect(
      page.getByText('New password must be different from your current password')
    ).toBeVisible();
    await expect(security.submit).toBeDisabled();
  });

  test('a user who set up HemoIO before password changes existed', async ({ page }) => {
    await seedV1Credentials(page, TEST_PASSWORD);
    await unlockApp(page, TEST_PASSWORD);
    // Encrypted with the v1 key, as the earlier app would have stored it
    await seedLabData(page);

    await new SecuritySettingsPage(page).change(TEST_PASSWORD, NEW_PASSWORD);
    expect(await storedCredentialsVersion(page)).toBe(2);
    await lockApp(page);
    await expectPasswordRejected(page, TEST_PASSWORD);
    await unlockApp(page, NEW_PASSWORD);

    await page.locator('nav').getByText('Timeline', { exact: true }).click();
    await expect(page.getByText('Quest Diagnostics')).toBeVisible();
  });

  test('changing the password with the keyboard only', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    const security = new SecuritySettingsPage(page);
    await security.open();

    // From the Security tab, Tab moves into the panel and on to the first field
    for (let i = 0; i < 10 && !(await security.currentPassword.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(security.currentPassword).toBeFocused();
    await page.keyboard.type(TEST_PASSWORD);
    await page.keyboard.press('Tab');
    await expect(security.newPassword).toBeFocused();
    await page.keyboard.type(NEW_PASSWORD);
    await page.keyboard.press('Tab');
    await expect(security.confirmPassword).toBeFocused();
    await page.keyboard.type(NEW_PASSWORD);
    await page.keyboard.press('Enter');

    await expect(security.success).toBeVisible();
  });

  test('backups are not affected', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);

    await new SecuritySettingsPage(page).open();

    await expect(
      page.getByText(
        'Changing your password does not affect existing backup files, which use their own backup password.',
        { exact: false }
      )
    ).toBeVisible();
  });
});
```

The keyboard test's loop presses Tab until the field has focus, with at most 10 presses. That keeps it independent of how many tab stops Mantine's tab list has. The `expect(...).toBeFocused()` after the loop is the real assertion. Run prettier over the file so the long `for` line is wrapped.

- [ ] **Step 3: Run the new spec in both browsers**

Run: `npx playwright test e2e/change-password.spec.ts --workers=2`
Expected: 18 passed (9 tests × 2 browsers).

If the "Timeline" nav item is not text-matchable, follow the pattern in `e2e/timeline-view.spec.ts`. If the timeline is already shown after unlock, drop that click. Any change of that kind is ledgered as a ruling.

- [ ] **Step 4: Verify in the browser**

With the dev server on :5173, use chrome-devtools to:
1. set up;
2. restore a backup;
3. change the password in Settings → Security;
4. lock, and check that the old password is rejected;
5. unlock with the new one, and check the lab results;
6. confirm `list_console_messages` shows no errors and no password, key or salt.

- [ ] **Step 5: Run the specs that set up or unlock the app**

These are the specs most likely to notice the slower 600 000-iteration setup and unlock.

Run: `npx playwright test e2e/authentication.spec.ts e2e/first-run-setup.spec.ts e2e/settings.spec.ts --workers=2`
Expected: all pass in both browsers.

- [ ] **Step 6: Commit**

```bash
npx prettier --single-quote --print-width 100 --trailing-comma es5 --write e2e/change-password.spec.ts e2e/steps/changePassword.steps.ts
git add e2e/change-password.spec.ts e2e/steps/changePassword.steps.ts
git commit -m "test(e2e): cover changing the password

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the tasks

These steps follow the sub-project process in the gherkin-completion spec's Progress section:
1. Run the whole-branch review on the most capable model, and do one fix pass, test first.
2. Pass all four gates. That includes the full E2E suite in both browsers, since every test now sets up with 600 000 iterations.
3. Add an Outcome section to this plan.
4. Mark sub-project 6 done in the spec's Progress section.
5. Set the change-password spec's **Status** to "Implemented on `feature/gherkin-completion`".
6. Delete the workspace.
