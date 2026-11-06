/**
 * The folder copy's envelope: the password lock beside the sealed data
 *
 * The file is JSON { format, version, lock, sealed }. Only the format, its
 * version and the lock (the data key, wrapped by the password) are plaintext:
 * with them a browser that lost its credentials, or another computer, can
 * open the copy with the password alone. `sealed` is base64 of the IV and the
 * AES-GCM ciphertext, sealed with the header as additional data, so a lock
 * edited in the file, or swapped for another, makes the copy fail to open
 * rather than be adopted.
 *
 * A copy written before the envelope is the raw IV and ciphertext, with no
 * lock; it is still read.
 */

import { arrayBufferToBase64, base64ToArrayBuffer, decrypt, encrypt } from '@data/encryption';
import { isCredentialsV2, type StoredCredentialsV2 } from '@data/encryption/keyWrapping';

export const FOLDER_ENVELOPE_FORMAT = 'hemoio-folder-copy';

export interface FolderEnvelopeHeader {
  format: typeof FOLDER_ENVELOPE_FORMAT;
  version: 1;
  /** The lock of the setup that wrote the copy; null when it had none */
  lock: StoredCredentialsV2 | null;
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** The lock with only the fields HemoIO knows, in a fixed order */
export function cleanLock(lock: StoredCredentialsV2): StoredCredentialsV2 {
  const { version, kekSalt, iterations, wrapIv, wrappedKey, changedAt } = lock;
  return {
    version,
    kekSalt,
    iterations,
    wrapIv,
    wrappedKey,
    ...(changedAt !== undefined && { changedAt }),
  };
}

/**
 * The additional data the body is sealed with: the header in a fixed key
 * order, so it never depends on how the file's JSON was laid out
 */
function envelopeAad(header: FolderEnvelopeHeader): Uint8Array {
  const { lock } = header;
  return new TextEncoder().encode(
    JSON.stringify({
      format: header.format,
      version: header.version,
      lock: lock && {
        version: lock.version,
        kekSalt: lock.kekSalt,
        iterations: lock.iterations,
        wrapIv: lock.wrapIv,
        wrappedKey: lock.wrappedKey,
        changedAt: lock.changedAt ?? null,
      },
    })
  );
}

/** File: JSON { format, version, lock, sealed: base64(IV + AES-GCM) }; additional data = envelopeAad(header) */
export async function sealEnvelope(
  plain: Uint8Array,
  key: CryptoKey,
  lock: StoredCredentialsV2 | null
): Promise<ArrayBuffer> {
  const header: FolderEnvelopeHeader = {
    format: FOLDER_ENVELOPE_FORMAT,
    version: 1,
    lock: lock && cleanLock(lock),
  };
  const body = plain.buffer.slice(plain.byteOffset, plain.byteOffset + plain.byteLength) as ArrayBuffer;
  const sealed = await encrypt(body, key, envelopeAad(header));
  const file = JSON.stringify({ ...header, sealed: arrayBufferToBase64(sealed) });
  return new TextEncoder().encode(file).buffer as ArrayBuffer;
}

/** The header and the sealed part, null for a legacy raw copy, or 'damaged' */
function parseEnvelope(
  bytes: ArrayBuffer
): { header: FolderEnvelopeHeader; sealed: string } | null | 'damaged' {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const file = parsed as Record<string, unknown>;
  if (file.format !== FOLDER_ENVELOPE_FORMAT) return null;

  const { version, lock, sealed } = file;
  if (version !== 1) return 'damaged';
  if (lock !== null && !isCredentialsV2(lock)) return 'damaged';
  if (typeof sealed !== 'string' || !BASE64.test(sealed)) return 'damaged';
  return {
    header: { format: FOLDER_ENVELOPE_FORMAT, version: 1, lock: lock && cleanLock(lock) },
    sealed,
  };
}

/** The header, null for a legacy raw copy (not JSON with this format), or 'damaged' */
export function readEnvelopeHeader(bytes: ArrayBuffer): FolderEnvelopeHeader | null | 'damaged' {
  const envelope = parseEnvelope(bytes);
  return envelope && envelope !== 'damaged' ? envelope.header : envelope;
}

/** Opens either format; rejects when the key does not open it */
export async function openEnvelope(
  bytes: ArrayBuffer,
  key: CryptoKey
): Promise<{ header: FolderEnvelopeHeader | null; plain: ArrayBuffer }> {
  const envelope = parseEnvelope(bytes);
  if (envelope === 'damaged') {
    // Fixed text: the file's content is not the error's to carry
    throw new Error('The folder copy is damaged');
  }
  if (envelope === null) {
    return { header: null, plain: await decrypt(bytes, key) };
  }
  const { header, sealed } = envelope;
  return {
    header,
    plain: await decrypt(base64ToArrayBuffer(sealed), key, envelopeAad(header)),
  };
}

/**
 * A file's content sealed again, unchanged (the same revision), without the
 * lock it carries: only the current copy carries a lock, so a backup or the
 * previous copy never lets an old password unwrap the data key. Rejects
 * when the key does not open it.
 */
export async function resealWithoutLock(bytes: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const { plain } = await openEnvelope(bytes, key);
  return sealEnvelope(new Uint8Array(plain), key, null);
}
