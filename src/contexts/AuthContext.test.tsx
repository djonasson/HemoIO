import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, AuthContext } from './AuthContext';
import { useContext } from 'react';

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

// Import mocked functions for test assertions
import { createStoredCredentials, verifyPassword, getEncryptionKey } from '@data/encryption';

const mockCreateStoredCredentials = createStoredCredentials as ReturnType<typeof vi.fn>;
const mockVerifyPassword = verifyPassword as ReturnType<typeof vi.fn>;
const mockGetEncryptionKey = getEncryptionKey as ReturnType<typeof vi.fn>;

// Test component that displays auth state
function AuthStateDisplay() {
  const context = useContext(AuthContext);
  if (!context) return <div>No context</div>;

  return (
    <div>
      <span data-testid="status">{context.status}</span>
      <span data-testid="has-key">{context.encryptionKey ? 'yes' : 'no'}</span>
      <span data-testid="setup-complete">{context.isSetupComplete() ? 'yes' : 'no'}</span>
      <button onClick={() => context.lock()}>Lock</button>
      <button onClick={() => context.unlock('test-password')}>Unlock</button>
      <button onClick={() => context.setupPassword('new-password')}>Setup</button>
    </div>
  );
}

describe('AuthContext', () => {
  const CREDENTIALS_KEY = 'hemoio_credentials';
  const mockCredentials = {
    salt: 'test-salt-base64',
    verificationHash: 'test-hash-base64',
    iterations: 100000,
    version: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Initial state', () => {
    it('sets status to needs_setup when no credentials exist', () => {
      render(
        <AuthProvider>
          <AuthStateDisplay />
        </AuthProvider>
      );

      expect(screen.getByTestId('status')).toHaveTextContent('needs_setup');
      expect(screen.getByTestId('has-key')).toHaveTextContent('no');
      expect(screen.getByTestId('setup-complete')).toHaveTextContent('no');
    });

    it('sets status to locked when credentials exist', () => {
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(mockCredentials));

      render(
        <AuthProvider>
          <AuthStateDisplay />
        </AuthProvider>
      );

      expect(screen.getByTestId('status')).toHaveTextContent('locked');
      expect(screen.getByTestId('has-key')).toHaveTextContent('no');
      expect(screen.getByTestId('setup-complete')).toHaveTextContent('yes');
    });

    it('handles invalid JSON in localStorage gracefully', () => {
      localStorage.setItem(CREDENTIALS_KEY, 'invalid-json');

      render(
        <AuthProvider>
          <AuthStateDisplay />
        </AuthProvider>
      );

      expect(screen.getByTestId('status')).toHaveTextContent('needs_setup');
    });
  });

  describe('setupPassword', () => {
    it('creates credentials and unlocks', async () => {
      render(
        <AuthProvider>
          <AuthStateDisplay />
        </AuthProvider>
      );

      expect(screen.getByTestId('status')).toHaveTextContent('needs_setup');

      await act(async () => {
        screen.getByText('Setup').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
      });

      expect(mockCreateStoredCredentials).toHaveBeenCalledWith('new-password');
      expect(mockGetEncryptionKey).toHaveBeenCalled();
      expect(screen.getByTestId('has-key')).toHaveTextContent('yes');
    });

    it('saves credentials to localStorage', async () => {
      render(
        <AuthProvider>
          <AuthStateDisplay />
        </AuthProvider>
      );

      await act(async () => {
        screen.getByText('Setup').click();
      });

      await waitFor(() => {
        expect(localStorage.getItem(CREDENTIALS_KEY)).not.toBeNull();
      });

      const stored = JSON.parse(localStorage.getItem(CREDENTIALS_KEY)!);
      expect(stored).toHaveProperty('salt');
      expect(stored).toHaveProperty('verificationHash');
    });
  });

  describe('unlock', () => {
    it('unlocks with correct password', async () => {
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(mockCredentials));
      mockVerifyPassword.mockResolvedValueOnce(true);

      render(
        <AuthProvider>
          <AuthStateDisplay />
        </AuthProvider>
      );

      expect(screen.getByTestId('status')).toHaveTextContent('locked');

      await act(async () => {
        screen.getByText('Unlock').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
      });

      expect(mockVerifyPassword).toHaveBeenCalledWith('test-password', mockCredentials);
      expect(screen.getByTestId('has-key')).toHaveTextContent('yes');
    });

    it('stays locked with incorrect password', async () => {
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(mockCredentials));
      mockVerifyPassword.mockResolvedValueOnce(false);

      render(
        <AuthProvider>
          <AuthStateDisplay />
        </AuthProvider>
      );

      await act(async () => {
        screen.getByText('Unlock').click();
      });

      // Give time for async operation to complete
      await waitFor(() => {
        expect(mockVerifyPassword).toHaveBeenCalled();
      });

      expect(screen.getByTestId('status')).toHaveTextContent('locked');
      expect(screen.getByTestId('has-key')).toHaveTextContent('no');
    });

    it('returns false when no credentials exist', async () => {
      let unlockResult: boolean | undefined;

      function UnlockResultTest() {
        const context = useContext(AuthContext);
        return (
          <button
            onClick={async () => {
              if (context) {
                unlockResult = await context.unlock('password');
              }
            }}
          >
            Try Unlock
          </button>
        );
      }

      render(
        <AuthProvider>
          <UnlockResultTest />
        </AuthProvider>
      );

      await act(async () => {
        screen.getByText('Try Unlock').click();
      });

      await waitFor(() => {
        expect(unlockResult).toBe(false);
      });
    });
  });

  describe('lock', () => {
    it('clears encryption key and sets status to locked', async () => {
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(mockCredentials));
      mockVerifyPassword.mockResolvedValueOnce(true);

      render(
        <AuthProvider>
          <AuthStateDisplay />
        </AuthProvider>
      );

      // First unlock
      await act(async () => {
        screen.getByText('Unlock').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('unlocked');
      });

      // Then lock
      await act(async () => {
        screen.getByText('Lock').click();
      });

      expect(screen.getByTestId('status')).toHaveTextContent('locked');
      expect(screen.getByTestId('has-key')).toHaveTextContent('no');
    });
  });

  describe('isSetupComplete', () => {
    it('returns false when no credentials exist', () => {
      render(
        <AuthProvider>
          <AuthStateDisplay />
        </AuthProvider>
      );

      expect(screen.getByTestId('setup-complete')).toHaveTextContent('no');
    });

    it('returns true when credentials exist in localStorage', () => {
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(mockCredentials));

      render(
        <AuthProvider>
          <AuthStateDisplay />
        </AuthProvider>
      );

      expect(screen.getByTestId('setup-complete')).toHaveTextContent('yes');
    });

    it('returns true after setupPassword is called', async () => {
      render(
        <AuthProvider>
          <AuthStateDisplay />
        </AuthProvider>
      );

      expect(screen.getByTestId('setup-complete')).toHaveTextContent('no');

      await act(async () => {
        screen.getByText('Setup').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('setup-complete')).toHaveTextContent('yes');
      });
    });
  });

  describe('encryptionKey', () => {
    it('is null when locked', () => {
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(mockCredentials));

      render(
        <AuthProvider>
          <AuthStateDisplay />
        </AuthProvider>
      );

      expect(screen.getByTestId('has-key')).toHaveTextContent('no');
    });

    it('is set after successful unlock', async () => {
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(mockCredentials));
      mockVerifyPassword.mockResolvedValueOnce(true);

      render(
        <AuthProvider>
          <AuthStateDisplay />
        </AuthProvider>
      );

      await act(async () => {
        screen.getByText('Unlock').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('has-key')).toHaveTextContent('yes');
      });
    });

    it('is set after setupPassword', async () => {
      render(
        <AuthProvider>
          <AuthStateDisplay />
        </AuthProvider>
      );

      await act(async () => {
        screen.getByText('Setup').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('has-key')).toHaveTextContent('yes');
      });
    });
  });

  describe('Provider', () => {
    it('renders children', () => {
      render(
        <AuthProvider>
          <div data-testid="child">Child content</div>
        </AuthProvider>
      );

      expect(screen.getByTestId('child')).toHaveTextContent('Child content');
    });

    it('provides context to nested components', () => {
      function NestedComponent() {
        const context = useContext(AuthContext);
        return <div data-testid="nested">{context ? 'has-context' : 'no-context'}</div>;
      }

      render(
        <AuthProvider>
          <div>
            <div>
              <NestedComponent />
            </div>
          </div>
        </AuthProvider>
      );

      expect(screen.getByTestId('nested')).toHaveTextContent('has-context');
    });
  });
});
