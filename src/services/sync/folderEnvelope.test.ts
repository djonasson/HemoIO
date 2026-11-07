import { describe, it, expect } from 'vitest';
import { arrayBufferToBase64, base64ToArrayBuffer, encrypt } from '@data/encryption';
import { createCredentialsV2, type StoredCredentialsV2 } from '@data/encryption/keyWrapping';
import {
  FOLDER_ENVELOPE_FORMAT,
  isDamagedCopy,
  openDamagedCopy,
  openEnvelope,
  readEnvelopeHeader,
  sealDamagedCopy,
  sealEnvelope,
  showsNoLock,
} from './folderEnvelope';

const PLAIN = '{"version":4,"exportedAt":"2026-11-06T08:00:00.000Z","data":{"labResults":[]}}';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const decode = (bytes: ArrayBuffer): string => new TextDecoder().decode(bytes);
const textOf = (bytes: ArrayBuffer): string => new TextDecoder().decode(bytes);
const fileOf = (text: string): ArrayBuffer => encode(text).buffer as ArrayBuffer;

async function newSetup(): Promise<{ key: CryptoKey; lock: StoredCredentialsV2 }> {
  const { credentials, key } = await createCredentialsV2('Old-Passw0rd!', 1000);
  return { key, lock: credentials };
}

/** Change one character of a base64 string, keeping it base64 */
function oneCharChanged(text: string): string {
  const i = Math.floor(text.length / 2);
  return text.slice(0, i) + (text[i] === 'A' ? 'B' : 'A') + text.slice(i + 1);
}

describe('folderEnvelope', () => {
  it('seals and opens with the lock beside the data', async () => {
    const { key, lock } = await newSetup();

    const bytes = await sealEnvelope(encode(PLAIN), key, lock);

    expect(readEnvelopeHeader(bytes)).toEqual({ format: FOLDER_ENVELOPE_FORMAT, version: 1, lock });
    const opened = await openEnvelope(bytes, key);
    expect(opened.header).toEqual({ format: FOLDER_ENVELOPE_FORMAT, version: 1, lock });
    expect(decode(opened.plain)).toBe(PLAIN);
  });

  it('seals with no lock, for credentials that have none', async () => {
    const { key } = await newSetup();

    const opened = await openEnvelope(await sealEnvelope(encode(PLAIN), key, null), key);

    expect(opened.header).toEqual({ format: FOLDER_ENVELOPE_FORMAT, version: 1, lock: null });
    expect(decode(opened.plain)).toBe(PLAIN);
  });

  it('opens a legacy raw copy', async () => {
    const { key } = await newSetup();
    const legacy = await encrypt(encode(PLAIN).buffer as ArrayBuffer, key);

    expect(readEnvelopeHeader(legacy)).toBeNull();
    const opened = await openEnvelope(legacy, key);
    expect(opened.header).toBeNull();
    expect(decode(opened.plain)).toBe(PLAIN);
  });

  it('rejects a copy another key sealed', async () => {
    const { key, lock } = await newSetup();
    const other = await newSetup();

    await expect(openEnvelope(await sealEnvelope(encode(PLAIN), key, lock), other.key)).rejects.toThrow();
  });

  it('a lock edited in the file does not open', async () => {
    const { key, lock } = await newSetup();
    const file = JSON.parse(textOf(await sealEnvelope(encode(PLAIN), key, lock)));
    file.lock.wrappedKey = oneCharChanged(file.lock.wrappedKey);

    await expect(openEnvelope(fileOf(JSON.stringify(file)), key)).rejects.toThrow();
  });

  it.each(['iterations', 'kekSalt', 'wrapIv'] as const)('a lock with its %s edited does not open', async (field) => {
    const { key, lock } = await newSetup();
    const file = JSON.parse(textOf(await sealEnvelope(encode(PLAIN), key, lock)));
    file.lock[field] = field === 'iterations' ? file.lock.iterations + 1 : oneCharChanged(file.lock[field]);

    await expect(openEnvelope(fileOf(JSON.stringify(file)), key)).rejects.toThrow();
  });

  it.each([
    ['its date', (file: Record<string, Record<string, unknown>>) => {
      file.lock.changedAt = '2099-01-01T00:00:00.000Z';
    }],
    ['its date, removed', (file: Record<string, Record<string, unknown>>) => {
      delete file.lock.changedAt;
    }],
    ['the lock, removed', (file: Record<string, unknown>) => {
      file.lock = null;
    }],
  ])('a header with %s does not open', async (_label, edit) => {
    const { key, lock } = await newSetup();
    const file = JSON.parse(textOf(await sealEnvelope(encode(PLAIN), key, lock)));
    edit(file);

    await expect(openEnvelope(fileOf(JSON.stringify(file)), key)).rejects.toThrow();
  });

  it('a reordered header still opens', async () => {
    const { key, lock } = await newSetup();
    const file = JSON.parse(textOf(await sealEnvelope(encode(PLAIN), key, lock)));
    const reorderedLock = Object.fromEntries(Object.entries(file.lock).reverse());
    const reordered = { sealed: file.sealed, lock: reorderedLock, version: file.version, format: file.format };

    const opened = await openEnvelope(fileOf(JSON.stringify(reordered, null, 2)), key);

    expect(decode(opened.plain)).toBe(PLAIN);
  });

  it('the plaintext holds only format, version and lock', async () => {
    const { key, lock } = await newSetup();

    const text = textOf(await sealEnvelope(encode(PLAIN), key, lock));

    const file = JSON.parse(text);
    expect(Object.keys(file).sort()).toEqual(['format', 'lock', 'sealed', 'version']);
    expect(text).not.toContain('labResults');
    expect(text).not.toContain('exportedAt');
    // The sealed part is the IV then AES-GCM: 12 bytes, the plaintext, a 16-byte tag
    expect(base64ToArrayBuffer(file.sealed).byteLength).toBe(12 + encode(PLAIN).length + 16);
  });

  describe('readEnvelopeHeader', () => {
    it('treats anything that is not JSON in this format as a legacy copy', async () => {
      expect(readEnvelopeHeader(new ArrayBuffer(0))).toBeNull();
      expect(readEnvelopeHeader(crypto.getRandomValues(new Uint8Array(64)).buffer)).toBeNull();
      expect(readEnvelopeHeader(fileOf('sealed with a different password'))).toBeNull();
      expect(readEnvelopeHeader(fileOf('{"format":"something-else","version":1}'))).toBeNull();
      expect(readEnvelopeHeader(fileOf('[1,2,3]'))).toBeNull();
      expect(readEnvelopeHeader(fileOf('null'))).toBeNull();
    });

    it.each([
      ['an unknown version', { version: 2 }, 'newer'],
      ['a lock that is not v2 credentials', { lock: { version: 2, kekSalt: 'x' } }, 'foreign-lock'],
      ['a lock with an invalid date', { lock: 'LOCK_WITH_BAD_DATE' }, 'foreign-lock'],
      ['no sealed part', { sealed: undefined }, 'damaged'],
      ['a sealed part that is not base64', { sealed: 'not base64!' }, 'damaged'],
    ])('reports a header with %s, and does not open it', async (_label, change, state) => {
      const { key, lock } = await newSetup();
      const file = JSON.parse(textOf(await sealEnvelope(encode(PLAIN), key, lock)));
      const edited =
        (change as { lock?: unknown }).lock === 'LOCK_WITH_BAD_DATE'
          ? { ...file, lock: { ...lock, changedAt: 'soon' } }
          : { ...file, ...change };

      expect(readEnvelopeHeader(fileOf(JSON.stringify(edited)))).toBe(state);
      await expect(openEnvelope(fileOf(JSON.stringify(edited)), key)).rejects.toThrow();
    });

    it('reads the header of a large copy, without a regular expression overflow', async () => {
      const { key, lock } = await newSetup();
      // About 6 MB once sealed and base64-encoded
      const big = encode(JSON.stringify({ data: 'x'.repeat(4_500_000) }));
      const bytes = await sealEnvelope(big, key, lock);

      expect(readEnvelopeHeader(bytes)).toEqual({ format: FOLDER_ENVELOPE_FORMAT, version: 1, lock });
      expect((await openEnvelope(bytes, key)).plain.byteLength).toBe(big.length);
    });

    it.each([
      ['padding in the middle', 'AA==AAAA'],
      ['a length not a multiple of four', 'AAAAA'],
      ['three padding characters', 'A==='],
    ])('reports a sealed part with %s as damaged', async (_label, sealed) => {
      const { key, lock } = await newSetup();
      const file = JSON.parse(textOf(await sealEnvelope(encode(PLAIN), key, lock)));

      expect(readEnvelopeHeader(fileOf(JSON.stringify({ ...file, sealed })))).toBe('damaged');
    });

    it('keeps only the lock fields it knows', async () => {
      const { key, lock } = await newSetup();
      const file = JSON.parse(textOf(await sealEnvelope(encode(PLAIN), key, lock)));
      file.lock.note = 'added by hand';

      const header = readEnvelopeHeader(fileOf(JSON.stringify(file)));

      expect(header).toEqual({ format: FOLDER_ENVELOPE_FORMAT, version: 1, lock });
    });
  });

  it('seals the same data differently each time', async () => {
    const { key, lock } = await newSetup();

    const first = JSON.parse(textOf(await sealEnvelope(encode(PLAIN), key, lock))).sealed;
    const second = JSON.parse(textOf(await sealEnvelope(encode(PLAIN), key, lock))).sealed;

    expect(first).not.toBe(second);
    expect(arrayBufferToBase64(base64ToArrayBuffer(first))).toBe(first);
  });

  describe('a damaged copy kept as a backup (P41)', () => {
    it('is sealed whole under the key, with no lock, and gives its bytes back', async () => {
      const { key, lock } = await newSetup();
      const damaged = fileOf(textOf(await sealEnvelope(encode(PLAIN), key, lock)).slice(0, 200));

      const kept = await sealDamagedCopy(damaged, key);

      expect(JSON.parse(textOf(kept))).toMatchObject({ format: 'hemoio-damaged-copy', version: 1, lock: null });
      expect(textOf(kept)).not.toContain(lock.kekSalt);
      expect(isDamagedCopy(kept)).toBe(true);
      expect(isDamagedCopy(damaged)).toBe(false);
      expect(textOf(await openDamagedCopy(kept, key))).toBe(textOf(damaged));
    });

    it('does not open under another key, nor with its header changed', async () => {
      const { key } = await newSetup();
      const other = await newSetup();
      const kept = await sealDamagedCopy(fileOf('{"format":"hemoio-folder-copy"'), key);
      const file = JSON.parse(textOf(kept)) as Record<string, unknown>;

      await expect(openDamagedCopy(kept, other.key)).rejects.toThrow();
      await expect(openDamagedCopy(fileOf(JSON.stringify({ ...file, format: 'other' })), key)).rejects.toThrow();
    });
  });

  describe('what a header says about a copy that cannot be read', () => {
    const header = (fields: Record<string, unknown>): ArrayBuffer =>
      fileOf(JSON.stringify({ format: FOLDER_ENVELOPE_FORMAT, sealed: 'AAAA', ...fields }));

    it('names a newer envelope first, whatever its lock', async () => {
      const { credentials } = await createCredentialsV2('Passw0rd!', 1000);

      expect(readEnvelopeHeader(header({ version: 2, lock: credentials }))).toBe('newer');
      expect(readEnvelopeHeader(header({ version: 2, lock: { version: 3 } }))).toBe('newer');
    });

    it('names a lock that is not these credentials a foreign lock', () => {
      expect(readEnvelopeHeader(header({ version: 1, lock: { version: 3 } }))).toBe('foreign-lock');
      expect(readEnvelopeHeader(header({ version: 1, lock: 'a lock' }))).toBe('foreign-lock');
    });

    it('reads a header this build reads, names a damaged one, and nothing for no envelope', async () => {
      const { credentials } = await createCredentialsV2('Passw0rd!', 1000);

      expect(readEnvelopeHeader(header({ version: 1, lock: credentials }))).toMatchObject({ version: 1 });
      expect(readEnvelopeHeader(header({ version: 1, lock: null }))).toMatchObject({ version: 1, lock: null });
      expect(readEnvelopeHeader(header({ version: 'one', lock: null }))).toBe('damaged');
      expect(readEnvelopeHeader(fileOf('not json'))).toBeNull();
      expect(readEnvelopeHeader(fileOf(JSON.stringify({ format: 'other', version: 9 })))).toBeNull();
    });

    it('tells whether a file shows no lock in plain text', async () => {
      const { credentials, key } = await createCredentialsV2('Passw0rd!', 1000);
      const legacy = await encrypt(encode(PLAIN).buffer as ArrayBuffer, key);

      expect(showsNoLock(legacy)).toBe(true);
      expect(showsNoLock(await sealEnvelope(encode(PLAIN), key, null))).toBe(true);
      expect(showsNoLock(await sealDamagedCopy(legacy, key))).toBe(true);
      expect(showsNoLock(await sealEnvelope(encode(PLAIN), key, credentials))).toBe(false);
      expect(showsNoLock(header({ version: 1 }))).toBe(false);
      expect(showsNoLock(fileOf(JSON.stringify({ format: 'other', lock: null })))).toBe(false);
    });
  });
});
