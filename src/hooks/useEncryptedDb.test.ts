/**
 * Tests for useEncryptedDb hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEncryptedDb } from './useEncryptedDb';

// Mock the dependencies
vi.mock('@contexts', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@data/db', () => ({
  createEncryptedDb: vi.fn((key) => ({ key, mockDb: true })),
  EncryptedDb: vi.fn(),
}));

import { useAuth } from '@contexts';
import { createEncryptedDb } from '@data/db';

describe('useEncryptedDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null db when not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      status: 'locked',
      encryptionKey: null,
      unlock: vi.fn(),
      lock: vi.fn(),
      setupPassword: vi.fn(),
      isSetupComplete: vi.fn(),
    });

    const { result } = renderHook(() => useEncryptedDb());

    expect(result.current.db).toBeNull();
    expect(result.current.isReady).toBe(false);
  });

  it('should return null db when status is needs_setup', () => {
    vi.mocked(useAuth).mockReturnValue({
      status: 'needs_setup',
      encryptionKey: null,
      unlock: vi.fn(),
      lock: vi.fn(),
      setupPassword: vi.fn(),
      isSetupComplete: vi.fn(),
    });

    const { result } = renderHook(() => useEncryptedDb());

    expect(result.current.db).toBeNull();
    expect(result.current.isReady).toBe(false);
  });

  it('should return db instance when authenticated', () => {
    const mockKey = {} as CryptoKey;
    vi.mocked(useAuth).mockReturnValue({
      status: 'unlocked',
      encryptionKey: mockKey,
      unlock: vi.fn(),
      lock: vi.fn(),
      setupPassword: vi.fn(),
      isSetupComplete: vi.fn(),
    });

    const { result } = renderHook(() => useEncryptedDb());

    expect(createEncryptedDb).toHaveBeenCalledWith(mockKey);
    expect(result.current.db).not.toBeNull();
    expect(result.current.isReady).toBe(true);
  });

  it('should memoize the db instance', () => {
    const mockKey = {} as CryptoKey;
    vi.mocked(useAuth).mockReturnValue({
      status: 'unlocked',
      encryptionKey: mockKey,
      unlock: vi.fn(),
      lock: vi.fn(),
      setupPassword: vi.fn(),
      isSetupComplete: vi.fn(),
    });

    const { result, rerender } = renderHook(() => useEncryptedDb());
    const firstDb = result.current.db;

    // Rerender with same key
    rerender();
    const secondDb = result.current.db;

    // Should be the same instance
    expect(firstDb).toBe(secondDb);
    // createEncryptedDb should only be called once
    expect(createEncryptedDb).toHaveBeenCalledTimes(1);
  });

  it('should create new db instance when encryption key changes', () => {
    const mockKey1 = { id: 1 } as unknown as CryptoKey;
    const mockKey2 = { id: 2 } as unknown as CryptoKey;

    vi.mocked(useAuth).mockReturnValue({
      status: 'unlocked',
      encryptionKey: mockKey1,
      unlock: vi.fn(),
      lock: vi.fn(),
      setupPassword: vi.fn(),
      isSetupComplete: vi.fn(),
    });

    const { result, rerender } = renderHook(() => useEncryptedDb());
    const firstDb = result.current.db;

    // Change the key
    vi.mocked(useAuth).mockReturnValue({
      status: 'unlocked',
      encryptionKey: mockKey2,
      unlock: vi.fn(),
      lock: vi.fn(),
      setupPassword: vi.fn(),
      isSetupComplete: vi.fn(),
    });

    rerender();
    const secondDb = result.current.db;

    // Should be different instances
    expect(firstDb).not.toBe(secondDb);
    expect(createEncryptedDb).toHaveBeenCalledTimes(2);
  });

  it('should return isReady false when status is unlocked but key is null', () => {
    vi.mocked(useAuth).mockReturnValue({
      status: 'unlocked',
      encryptionKey: null,
      unlock: vi.fn(),
      lock: vi.fn(),
      setupPassword: vi.fn(),
      isSetupComplete: vi.fn(),
    });

    const { result } = renderHook(() => useEncryptedDb());

    expect(result.current.db).toBeNull();
    expect(result.current.isReady).toBe(false);
  });
});
