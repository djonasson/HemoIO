# Change Password — Design

**Date:** 2026-10-16
**Status:** Implemented on `feature/gherkin-completion` (plan: `docs/superpowers/plans/2026-10-24-change-password.md`)
**Branch:** `feature/change-password`

## Goal

Let an unlocked user change the app password from Settings. The user enters their
current password and a new one; afterwards only the new password unlocks HemoIO,
and all existing data remains readable. The user stays unlocked throughout.

### Motivation

Routine password changes, or replacing a weak initial password. Responding to a
suspected compromise (where an attacker may hold the old password *and* a copy of
the data) is explicitly **out of scope**: that would require rotating the data key
and re-encrypting everything, which this design deliberately avoids.

### Non-goals

- Password recovery (impossible by design — no password, no key)
- Re-encrypting stored data / data-key rotation
- Silent v1 → v2 upgrade on unlock (v1 users migrate when they first change password)
- Changing backup passwords (backups use their own password and are unaffected)
- Fixing `decryptFields` swallowing decryption errors (separate follow-up)

## Current State

- `src/data/encryption/index.ts`: PBKDF2-SHA256 (100k iterations) over the password and
  a stored salt derives the AES-GCM key **directly**. A separate PBKDF2 hash with its
  own salt verifies the password.
- `src/contexts/AuthContext.tsx` stores `StoredCredentials`
  (`salt`, `verificationSalt`, `verificationHash`) in localStorage key `hemoio_credentials`.
- The session `CryptoKey` encrypts: IndexedDB fields (`labResults.labName/notes`,
  `testValues.rawText`, `settings.aiApiKey`, `userNotes.content`), the AI API key in
  localStorage (`hemoio_ai_api_key_encrypted`), and the filesystem sync file.
- `src/components/setup/SetupWizard.tsx` re-reads the credentials from localStorage and
  re-derives the key itself to encrypt the API key during setup.

## Approach: Key Wrapping

Introduce a **data key** (DEK) wrapped by a **password-derived key** (KEK). Changing the
password re-wraps the DEK; no stored data is touched.

For existing (v1) users, the DEK *is* their current key: PBKDF2 `deriveBits` with the
original salt and 100k iterations yields exactly the bytes `deriveKey` produced. Those
bytes are wrapped under the new password, so no data migration is ever required.

Rejected alternatives: migrating to a fresh random DEK on first change (re-encrypts all
data once, reintroducing partial-failure risk with no benefit for the stated goal), and
re-encrypting all data on every change (slow, not atomic across IndexedDB, localStorage
and the sync file).

## 1. Credential Format and Crypto

New module `src/data/encryption/keyWrapping.ts` — pure functions, no storage access.

```ts
interface StoredCredentialsV2 {
  version: 2;
  kekSalt: string;     // base64, regenerated on every password change
  iterations: number;  // PBKDF2 iterations for the KEK
  wrapIv: string;      // base64, AES-GCM IV used to wrap the DEK
  wrappedKey: string;  // base64, the wrapped DEK
}

type AnyStoredCredentials = StoredCredentials /* v1, no version field */ | StoredCredentialsV2;
```

- **KEK:** PBKDF2-SHA256(password, kekSalt, iterations) → AES-GCM 256 key with usages
  `wrapKey`/`unwrapKey` only. New credentials use `KEK_PBKDF2_ITERATIONS = 600_000`.
- **DEK wrapping:** `crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv })`.
  The DEK must be extractable at wrap time; it is created/imported extractable only
  transiently inside these functions.
- **Session DEK:** unwrapped as **non-extractable** AES-GCM with `encrypt`/`decrypt`,
  identical in usage to today's key. No consumer of `encryptionKey` changes.
- **Password verification:** v2 has no verification hash. AES-GCM authentication on
  unwrap fails for a wrong password; that failure is the verification.
- **Exported functions:**
  - `createCredentialsV2(password): Promise<{ credentials: StoredCredentialsV2; key: CryptoKey }>`
    — random DEK (`generateKey`, extractable), wrap, return a non-extractable session key.
  - `unlockV2(password, creds): Promise<CryptoKey | null>` — returns `null` on wrong
    password (unwrap `OperationError`).
  - `rewrapCredentials(oldPassword, newPassword, creds: AnyStoredCredentials): Promise<{ credentials: StoredCredentialsV2; key: CryptoKey } | null>`
    — returns `null` if `oldPassword` is wrong.
    - v1: verify with existing `verifyPassword`; derive raw DEK bytes with `deriveBits`
      (original `salt`, 100k iterations); import as extractable AES-GCM; wrap under a new KEK.
    - v2: unwrap with old KEK as **extractable**; wrap under a new KEK.
    - Always generates a new `kekSalt` and `wrapIv`.
  - `isCredentialsV2(creds): creds is StoredCredentialsV2`
- Unknown `version` values are rejected (treated as unreadable), never guessed at.

## 2. AuthContext (Application Layer)

`AuthContext` remains the sole reader/writer of `hemoio_credentials`.

```ts
interface AuthContextValue {
  status: AuthStatus;
  encryptionKey: CryptoKey | null;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  setupPassword: (password: string) => Promise<CryptoKey>; // was Promise<void>
  changePassword: (current: string, next: string) => Promise<ChangePasswordResult>;
  isSetupComplete: () => boolean;
}

type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: 'wrong_password' | 'same_password' | 'failed' };
```

- **`setupPassword`** writes v2 credentials via `createCredentialsV2` and returns the
  session key. `SetupWizard` uses the returned key to encrypt the API key instead of
  re-reading credentials and re-deriving (fixes `SetupWizard.tsx:121-129`, which would
  break under v2), and drops its duplicate `CREDENTIALS_STORAGE_KEY` constant.
- **`unlock`** dispatches on format: v2 → `unlockV2`; v1 → existing
  `verifyPassword` + `getEncryptionKey`; unknown version → `false`.
- **`changePassword(current, next)`:**
  1. `current === next` → `same_password`.
  2. Load credentials; missing/unparseable → `failed`.
  3. `rewrapCredentials(current, next, creds)`; `null` → `wrong_password`.
  4. **Round-trip check:** encrypt a random 16-byte value with the current session
     `encryptionKey`, decrypt it with the key unwrapped from the *new* credentials
     using `unlockV2(next, newCreds)`, compare bytes. Mismatch/throw → `failed`.
  5. `localStorage.setItem` the new credentials (single write); throw → `failed`.
  6. `setCredentials(newCreds)`. `encryptionKey` and `status` are **not** changed.
  - Any unexpected exception → `failed`, logging only a fixed message.
- Other tabs keep their in-memory key (still valid) and pick up new credentials on
  their next unlock.

## 3. Settings UI

- New **Security** tab in `SettingsPage` (`IconLock`), placed after "Data".
- New component `src/components/settings/ChangePassword.tsx` (`ChangePasswordProps`
  empty or omitted; it uses `useAuth()` directly, consistent with other settings hooks).
- Form fields (Mantine `PasswordInput`):
  - Current password — `autocomplete="current-password"`
  - New password — `autocomplete="new-password"`, with strength meter
  - Confirm new password — `autocomplete="new-password"`
- Submit button "Change password" enabled only when: current non-empty, new passes
  `isPasswordStepValid` rules, confirmation matches, and new ≠ current. Enter submits
  via `useFormKeyboardSubmit`.
- Extract the strength meter (progress bar, label, checklist) from
  `src/components/setup/PasswordStep.tsx` into
  `src/components/common/PasswordStrengthMeter.tsx`; both setup and settings use it.
- While submitting: button `loading`, all inputs disabled.
- Outcomes:
  - **Success:** green `Alert` with `role="status"`: "Password changed. Use your new
    password next time you unlock HemoIO." All fields cleared.
  - **wrong_password:** field error on current password "Current password is
    incorrect"; focus moves to it; new-password fields retain their values.
  - **same_password:** field error on new password "New password must be different
    from your current password".
  - **failed:** red `Alert` with `role="alert"`: "Password could not be changed. Your
    existing password still works."
- Explanatory text above the form: "Your data stays encrypted. Changing your password
  does not affect existing backup files, which use their own backup password."
- Accessibility: visible labels on all inputs; errors associated via Mantine's
  `aria-describedby`; status never conveyed by color alone (icon + text); visible focus.
- If the component unmounts mid-change, the result is ignored (no state update).

## 4. Error Handling and Edge Cases

| Situation | Behavior |
|---|---|
| Failure before the credentials write | Stored state untouched; old password still works |
| `localStorage.setItem` throws (quota/private mode) | `failed`; old credentials remain (setItem is all-or-nothing) |
| Credentials missing/corrupt while unlocked | `failed`; nothing written |
| Unknown credentials `version` | `unlock` returns false; `changePassword` returns `failed` |
| Concurrent change in two tabs | Last write wins; both wrap the same DEK, data stays readable |
| `lock()` during a change | Write still proceeds (DEK valid either way) |
| Filesystem sync file | Unaffected — encrypted with the unchanged DEK |
| Backups | Unaffected — separate backup password |

Logging: fixed strings only; never passwords, keys, salts, or raw error objects from
crypto operations.

## 5. Testing

Order per project rules: Gherkin → E2E → unit tests → implementation.

- **`features/change-password.feature`** (business language):
  - Successful change; lock; unlock with new password succeeds, old password rejected
  - Lab results, notes, and the saved AI key remain readable after the change
  - Wrong current password → error, password unchanged
  - Confirmation mismatch; weak new password; new equals current
  - User with pre-update (v1) credentials changes password and keeps all data
  - Keyboard-only completion of the form
- **`e2e/change-password.spec.ts`** with a `SecuritySettingsPage` page object, following
  `e2e/authentication.spec.ts` patterns. The v1 scenario seeds v1 credentials and
  v1-encrypted data via `page.evaluate` before app load. State-based waits only.
- **Unit tests:**
  - `src/data/encryption/keyWrapping.test.ts` — create/unlock round trip; wrong password
    → `null`; rewrap from v2 and from v1 preserves the DEK (ciphertext created before the
    change decrypts after); fresh `kekSalt`/`wrapIv` per rewrap; stored `iterations`
    honored; unknown version rejected.
  - `src/contexts/AuthContext.test.tsx` — each `changePassword` result incl. `failed` via
    throwing `setItem`; credentials unchanged on failure; `encryptionKey` identity
    preserved on success; `unlock` for v1 and v2; `setupPassword` returns a key and
    writes v2.
  - `src/components/settings/ChangePassword.test.tsx` — validation, disabled states,
    loading state, each outcome's message and `role`, focus on wrong password.
  - `src/components/common/PasswordStrengthMeter.test.tsx`; existing `PasswordStep`,
    `SetupWizard`, and `SettingsPage` tests updated and passing.
- **Manual verification** with chrome-devtools on the dev server: change password, lock,
  unlock with new password, confirm data and an import still work.
- **Done when** `npm run build`, `npm run lint`, `npm run test`, and the touched
  Playwright specs all pass.
