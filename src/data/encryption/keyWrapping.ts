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

async function deriveKek(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
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
async function legacyDataKey(
  password: string,
  creds: StoredCredentials
): Promise<CryptoKey | null> {
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
