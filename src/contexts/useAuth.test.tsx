import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuth } from './useAuth';
import { AuthProvider } from './AuthContext';
import type { ReactNode } from 'react';

// Mock the encryption module
vi.mock('@data/encryption', () => ({
  createStoredCredentials: vi.fn(async () => ({
    salt: 'test-salt-base64',
    verificationHash: 'test-hash-base64',
    iterations: 100000,
    version: 1,
  })),
  verifyPassword: vi.fn(async () => true),
  getEncryptionKey: vi.fn(async () => ({
    algorithm: { name: 'AES-GCM' },
    extractable: false,
    type: 'secret',
    usages: ['encrypt', 'decrypt'],
  } as unknown as CryptoKey)),
}));

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Without AuthProvider', () => {
    it('throws an error when used outside AuthProvider', () => {
      // Suppress console.error for this test since we expect an error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('With AuthProvider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    it('returns the auth context value', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current).toHaveProperty('status');
      expect(result.current).toHaveProperty('encryptionKey');
      expect(result.current).toHaveProperty('unlock');
      expect(result.current).toHaveProperty('lock');
      expect(result.current).toHaveProperty('setupPassword');
      expect(result.current).toHaveProperty('isSetupComplete');
    });

    it('returns needs_setup status when no credentials exist', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.status).toBe('needs_setup');
    });

    it('returns locked status when credentials exist', () => {
      localStorage.setItem(
        'hemoio_credentials',
        JSON.stringify({
          salt: 'test-salt',
          verificationHash: 'test-hash',
          iterations: 100000,
          version: 1,
        })
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.status).toBe('locked');
    });

    it('returns null encryptionKey when locked', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.encryptionKey).toBeNull();
    });

    it('provides working lock function', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(typeof result.current.lock).toBe('function');
    });

    it('provides working unlock function', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(typeof result.current.unlock).toBe('function');
    });

    it('provides working setupPassword function', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(typeof result.current.setupPassword).toBe('function');
    });

    it('provides working isSetupComplete function', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(typeof result.current.isSetupComplete).toBe('function');
      expect(result.current.isSetupComplete()).toBe(false);
    });

    it('isSetupComplete returns true when credentials exist', () => {
      localStorage.setItem(
        'hemoio_credentials',
        JSON.stringify({
          salt: 'test-salt',
          verificationHash: 'test-hash',
          iterations: 100000,
          version: 1,
        })
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.isSetupComplete()).toBe(true);
    });
  });
});
