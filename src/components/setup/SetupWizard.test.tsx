import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { SetupWizard } from './SetupWizard';
import { AuthProvider } from '@contexts';
import { AuthContext, type AuthContextValue } from '@contexts/AuthContext';
import { notifications } from '@mantine/notifications';
import { encryptString } from '@data/encryption';
import type { SetupOutcome } from '@contexts/AuthContext';

// Mock the encryption module
vi.mock('@data/encryption', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@data/encryption')>()),
  encryptString: vi.fn().mockResolvedValue('encrypted'),
}));

// Unlocking settles the stored records against the key (see
// AuthContext.test.tsx); this test has no database
vi.mock('@data/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@data/db')>()),
  createEncryptedDb: () => ({
    settleUnreadable: () => Promise.resolve({ returned: 0, setAside: 0 }),
  }),
}));

// What the browser holds before setup: counted in useExistingBrowserData.test.ts
const existing = vi.hoisted(() => ({
  rows: 0 as number | null,
  clear: vi.fn<() => Promise<boolean>>(),
}));
vi.mock('@hooks/useExistingBrowserData', () => ({
  useExistingBrowserData: () => ({ rows: existing.rows, clear: existing.clear }),
}));

// Recovering from a folder copy: tested in useFolderRecovery.test.ts
const recovery = vi.hoisted(() => ({
  folderName: 'Lab Folder' as string | null,
  chooseFolder: vi.fn<() => Promise<void>>(),
  recover: vi.fn<(password: string) => Promise<string | null>>(),
}));
vi.mock('@hooks/useFolderRecovery', () => ({
  useFolderRecovery: () => recovery,
}));

/** Where the browser can open folders, as Chromium can; jsdom cannot */
function withFolderSupport(): () => void {
  Object.defineProperty(window, 'showDirectoryPicker', { value: vi.fn(), configurable: true });
  return () => {
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  };
}

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MantineProvider env="test">
      <AuthProvider>{ui}</AuthProvider>
    </MantineProvider>
  );
}

describe('SetupWizard', () => {
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    existing.rows = 0;
    existing.clear.mockResolvedValue(true);
  });

  describe('Form Structure', () => {
    it('renders the wizard with form element', () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      // The form should exist
      const form = document.querySelector('form');
      expect(form).toBeInTheDocument();
    });

    it('has submit type button for Next', () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      const nextButton = screen.getByRole('button', { name: /go to next step/i });
      expect(nextButton).toHaveAttribute('type', 'submit');
    });

    it('has button type for Back to prevent form submission', () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      const backButton = screen.getByRole('button', { name: /go to previous step/i });
      expect(backButton).toHaveAttribute('type', 'button');
    });
  });

  describe('Navigation Buttons', () => {
    it('renders Back button disabled on first step', () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      const backButton = screen.getByRole('button', { name: /go to previous step/i });
      expect(backButton).toBeDisabled();
    });

    it('renders Next button disabled when password is empty', () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      const nextButton = screen.getByRole('button', { name: /go to next step/i });
      expect(nextButton).toBeDisabled();
    });

    it('enables Next button when password is valid', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      await user.type(screen.getByPlaceholderText('Enter your password'), 'TestPassword123!');
      await user.type(screen.getByPlaceholderText('Confirm your password'), 'TestPassword123!');

      const nextButton = screen.getByRole('button', { name: /go to next step/i });
      expect(nextButton).not.toBeDisabled();
    });

    it('keeps Next button disabled when passwords do not match', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      await user.type(screen.getByPlaceholderText('Enter your password'), 'TestPassword123!');
      await user.type(screen.getByPlaceholderText('Confirm your password'), 'DifferentPassword123!');

      const nextButton = screen.getByRole('button', { name: /go to next step/i });
      expect(nextButton).toBeDisabled();
    });

    it('navigates to next step when Next button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      // Fill valid password
      await user.type(screen.getByPlaceholderText('Enter your password'), 'TestPassword123!');
      await user.type(screen.getByPlaceholderText('Confirm your password'), 'TestPassword123!');

      // Click next (this triggers form submission)
      const nextButton = screen.getByRole('button', { name: /go to next step/i });
      await user.click(nextButton);

      // Should be on storage step - the text is in the StorageStep component
      expect(screen.getByText(/choose where to store/i)).toBeInTheDocument();
    });
  });

  describe('Keyboard Submission', () => {
    it('form has proper structure for Enter key submission', () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      // Verify the form structure allows Enter key submission:
      // 1. Form element exists
      const form = document.querySelector('form');
      expect(form).toBeInTheDocument();

      // 2. Submit button is inside the form
      const submitButton = screen.getByRole('button', { name: /go to next step/i });
      expect(form?.contains(submitButton)).toBe(true);

      // 3. Input fields are inside the form
      const passwordInput = screen.getByPlaceholderText('Enter your password');
      expect(form?.contains(passwordInput)).toBe(true);
    });

    it('does not submit form when password is invalid (button disabled)', async () => {
      const user = userEvent.setup();
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      // Fill invalid password (too short)
      await user.type(screen.getByPlaceholderText('Enter your password'), 'short');

      // Button should be disabled, preventing form submission
      const nextButton = screen.getByRole('button', { name: /go to next step/i });
      expect(nextButton).toBeDisabled();
    });
  });

  describe('Step Progression', () => {
    it('shows all four steps in stepper', () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      expect(screen.getByText('Security')).toBeInTheDocument();
      expect(screen.getByText('Storage')).toBeInTheDocument();
      expect(screen.getByText('AI Setup')).toBeInTheDocument();
      expect(screen.getByText('Complete')).toBeInTheDocument();
    });

    it('starts on first step', () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      // First step content should be visible
      expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    });
  });

  it('stores the AI setup before the app unlocks, so the app starts with it', async () => {
    const user = userEvent.setup();
    let storedBeforeUnlock = false;
    const auth = {
      status: 'needs_setup',
      encryptionKey: null,
      unlock: vi.fn(),
      lock: vi.fn(),
      changePassword: vi.fn(),
      isSetupComplete: () => false,
      storedLock: null,
      adoptFolderLock: () => false,
      recoverFromFolder: vi.fn(),
      // Unlocks once the setup step has run, as AuthProvider does
      setupPassword: vi.fn(async (_password: string, prepare?: (key: CryptoKey) => Promise<void>) => {
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
          'encrypt',
          'decrypt',
        ]);
        await prepare?.(key);
        storedBeforeUnlock = localStorage.getItem('hemoio_ai_api_key_encrypted') !== null;
        return 'created' as const;
      }),
    } satisfies AuthContextValue;
    render(
      <MantineProvider env="test">
        <AuthContext.Provider value={auth}>
          <SetupWizard onComplete={mockOnComplete} />
        </AuthContext.Provider>
      </MantineProvider>
    );

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
    expect(storedBeforeUnlock).toBe(true);
    expect(localStorage.getItem('hemoio_ai_provider')).toBe('anthropic');
  }, 15000);

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
  describe('submitting', () => {
    function renderWithAuth(setupPassword: AuthContextValue['setupPassword']) {
      const auth = {
        status: 'needs_setup',
        encryptionKey: null,
        unlock: vi.fn(),
        lock: vi.fn(),
        changePassword: vi.fn(),
        isSetupComplete: () => false,
        storedLock: null,
        adoptFolderLock: () => false,
        recoverFromFolder: vi.fn(),
        setupPassword,
      } satisfies AuthContextValue;
      render(
        <MantineProvider env="test">
          <AuthContext.Provider value={auth}>
            <SetupWizard onComplete={mockOnComplete} />
          </AuthContext.Provider>
        </MantineProvider>
      );
    }

    async function goToCompletion() {
      const user = userEvent.setup();
      await user.type(screen.getByPlaceholderText('Enter your password'), 'Str0ng-Passw0rd!');
      await user.type(screen.getByPlaceholderText('Confirm your password'), 'Str0ng-Passw0rd!');
      await user.click(screen.getByRole('button', { name: 'Go to next step' }));
      await user.click(screen.getByRole('button', { name: 'Go to next step' }));
      await user.click(screen.getByRole('button', { name: 'Go to next step' }));
      await screen.findByRole('heading', { name: "You're all set!" });
    }

    it('a second submit while the first runs is ignored', async () => {
      let finish!: (outcome: SetupOutcome) => void;
      const setupPassword = vi.fn(
        () => new Promise<SetupOutcome>((resolve) => (finish = resolve))
      );
      renderWithAuth(setupPassword);
      await goToCompletion();

      // Both before React re-renders the loading button
      const form = document.querySelector('form')!;
      fireEvent.submit(form);
      fireEvent.submit(form);
      finish('created');

      await waitFor(() => expect(mockOnComplete).toHaveBeenCalledTimes(1));
      expect(setupPassword).toHaveBeenCalledTimes(1);
    }, 15000);

    it('tells me to unlock when another tab set up with another password', async () => {
      const show = vi.spyOn(notifications, 'show').mockReturnValue('');
      renderWithAuth(vi.fn().mockResolvedValue('existing-locked'));
      await goToCompletion();

      await userEvent.click(screen.getByRole('button', { name: 'Complete setup and get started' }));

      await waitFor(() =>
        expect(show).toHaveBeenCalledWith(
          expect.objectContaining({
            message:
              'HemoIO was set up in another tab. Unlock with that password. ' +
              'The choices made here were not saved; set them in Settings.',
            autoClose: false,
          })
        )
      );
      expect(mockOnComplete).not.toHaveBeenCalled();
      show.mockRestore();
    }, 15000);

    it('says which choices were not saved when another tab set up first', async () => {
      const show = vi.spyOn(notifications, 'show').mockReturnValue('');
      const user = userEvent.setup();
      renderWithAuth(vi.fn().mockResolvedValue('unlocked-existing'));
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
      expect(show).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Already set up',
          message:
            'HemoIO was set up in another tab. The choices made here (AI provider and API key) ' +
            'were not saved; set them in Settings.',
          autoClose: false,
        })
      );
      expect(JSON.stringify(show.mock.calls)).not.toContain('sk-ant-test-1234');
      show.mockRestore();
    }, 15000);

    it('says which choices were not saved when storing them fails', async () => {
      const show = vi.spyOn(notifications, 'show').mockReturnValue('');
      vi.mocked(encryptString).mockRejectedValueOnce(new Error('detail'));
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

      // Set up all the same: the password lock is saved
      await waitFor(() => expect(mockOnComplete).toHaveBeenCalled());
      expect(localStorage.getItem('hemoio_credentials')).not.toBeNull();
      expect(show).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            'HemoIO is set up, but the choices made here (AI provider and API key) ' +
            'were not saved; set them in Settings.',
          autoClose: false,
        })
      );
      expect(JSON.stringify(show.mock.calls)).not.toContain('sk-ant-test-1234');
      show.mockRestore();
    }, 15000);

    it('a failed setup says so, and can be submitted again', async () => {
      const show = vi.spyOn(notifications, 'show').mockReturnValue('');
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const setupPassword = vi
        .fn<AuthContextValue['setupPassword']>()
        .mockRejectedValueOnce(new Error('detail that could name the credentials'))
        .mockResolvedValueOnce('created');
      renderWithAuth(setupPassword);
      await goToCompletion();
      const getStarted = screen.getByRole('button', { name: 'Complete setup and get started' });

      await userEvent.click(getStarted);

      await waitFor(() =>
        expect(show).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Setup failed',
            message: 'HemoIO could not be set up. Please try again.',
          })
        )
      );
      expect(JSON.stringify(show.mock.calls)).not.toContain('detail');
      expect(error).toHaveBeenCalledWith('Setup failed');
      expect(mockOnComplete).not.toHaveBeenCalled();

      await waitFor(() => expect(getStarted).toBeEnabled());
      await userEvent.click(getStarted);

      await waitFor(() => expect(mockOnComplete).toHaveBeenCalledTimes(1));
      expect(setupPassword).toHaveBeenCalledTimes(2);
      show.mockRestore();
      error.mockRestore();
    }, 15000);
  });

  describe('another tab finishing setup', () => {
    function otherTabSavesCredentials() {
      localStorage.setItem('hemoio_credentials', JSON.stringify({ version: 2 }));
      // AuthProvider leaves setup for the login screen
      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', { key: 'hemoio_credentials', newValue: '{"version":2}' })
        );
      });
    }

    it('tells a tab I had begun why it leaves setup', async () => {
      const show = vi.spyOn(notifications, 'show').mockReturnValue('');
      const user = userEvent.setup();
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);
      await user.type(screen.getByPlaceholderText('Enter your password'), 'Str0ng');

      otherTabSavesCredentials();

      expect(show).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Already set up',
          message:
            'HemoIO was set up in another tab. Unlock with that password. ' +
            'The choices made here were not saved; set them in Settings.',
          autoClose: false,
        })
      );
      show.mockRestore();
    });

    it('says nothing to a tab where setup was not begun', () => {
      const show = vi.spyOn(notifications, 'show').mockReturnValue('');
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      otherTabSavesCredentials();

      expect(show).not.toHaveBeenCalled();
      show.mockRestore();
    });
  });

  describe('existing browser data', () => {
    const TITLE = 'This browser already holds HemoIO data';

    it('shows the existing-data step when rows exist', async () => {
      existing.rows = 3;
      const user = userEvent.setup();
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      expect(screen.getByRole('region', { name: TITLE })).toBeInTheDocument();
      // Before anything else
      expect(screen.queryByPlaceholderText('Enter your password')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Keep it aside and set up anew' }));

      expect(screen.queryByRole('region', { name: TITLE })).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
      expect(existing.clear).not.toHaveBeenCalled();
    });

    it('starts on the password step when the browser holds nothing', () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      expect(screen.queryByRole('region', { name: TITLE })).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    });

    it('shows neither while the browser data is being counted', () => {
      existing.rows = null;
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      expect(screen.queryByRole('region', { name: TITLE })).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Enter your password')).not.toBeInTheDocument();
    });

    it('clearing asks first', async () => {
      existing.rows = 3;
      existing.clear.mockImplementation(async () => {
        existing.rows = 0;
        return true;
      });
      const user = userEvent.setup();
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      await user.click(screen.getByRole('button', { name: 'Clear it and set up anew…' }));
      expect(existing.clear).not.toHaveBeenCalled();
      await user.click(await screen.findByRole('button', { name: 'Clear and set up anew' }));

      expect(existing.clear).toHaveBeenCalledTimes(1);
      expect(await screen.findByPlaceholderText('Enter your password')).toBeInTheDocument();
    });
  });
  describe('the folder copy', () => {
    const FOLDER_COPY = 'I already have a folder copy';
    const TITLE = 'This browser already holds HemoIO data';
    let removeFolderSupport: () => void = () => {};

    afterEach(() => removeFolderSupport());

    it('offers the folder copy only where folders are supported', async () => {
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);
      // Without folders, setup starts on the password step, as before
      expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: FOLDER_COPY })).not.toBeInTheDocument();
      cleanup();

      existing.rows = 3;
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);
      expect(screen.getByRole('region', { name: TITLE })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: FOLDER_COPY })).not.toBeInTheDocument();
      cleanup();

      removeFolderSupport = withFolderSupport();
      existing.rows = 0;
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);
      const setUp = screen.getByRole('button', { name: 'Set up HemoIO' });
      expect(screen.getByRole('button', { name: FOLDER_COPY })).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Enter your password')).not.toBeInTheDocument();
      await waitFor(() => expect(setUp).toHaveFocus());
      cleanup();

      existing.rows = 3;
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);
      const region = screen.getByRole('region', { name: TITLE });
      expect(within(region).getByRole('button', { name: FOLDER_COPY })).toBeInTheDocument();
      await waitFor(() =>
        expect(within(region).getByRole('button', { name: 'Keep it aside and set up anew' })).toHaveFocus()
      );
    });

    it('"Set up HemoIO" goes on to the password step', async () => {
      removeFolderSupport = withFolderSupport();
      const user = userEvent.setup();
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      await user.click(screen.getByRole('button', { name: 'Set up HemoIO' }));

      expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    });

    it('goes back from the folder copy step to the screen before it', async () => {
      removeFolderSupport = withFolderSupport();
      const user = userEvent.setup();
      existing.rows = 3;
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      await user.click(screen.getByRole('button', { name: FOLDER_COPY }));
      expect(screen.getByRole('region', { name: 'Restore from your folder copy' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Back' }));

      expect(screen.getByRole('region', { name: TITLE })).toBeInTheDocument();
    });

    it('a recovered copy finishes setup', async () => {
      removeFolderSupport = withFolderSupport();
      recovery.recover.mockResolvedValue(null);
      const user = userEvent.setup();
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      await user.click(screen.getByRole('button', { name: FOLDER_COPY }));
      await user.type(screen.getByLabelText('Password you used'), 'Folder-Passw0rd!');
      await user.click(screen.getByRole('button', { name: 'Unlock and restore' }));

      await waitFor(() => expect(mockOnComplete).toHaveBeenCalledTimes(1));
      expect(recovery.recover).toHaveBeenCalledWith('Folder-Passw0rd!');
    });

    it('says to unlock when another tab set up first', async () => {
      removeFolderSupport = withFolderSupport();
      const show = vi.spyOn(notifications, 'show').mockReturnValue('');
      recovery.recover.mockResolvedValue('existing-locked');
      const user = userEvent.setup();
      renderWithProviders(<SetupWizard onComplete={mockOnComplete} />);

      await user.click(screen.getByRole('button', { name: FOLDER_COPY }));
      await user.type(screen.getByLabelText('Password you used'), 'Folder-Passw0rd!');
      await user.click(screen.getByRole('button', { name: 'Unlock and restore' }));

      await waitFor(() =>
        expect(show).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Already set up',
            message: expect.stringContaining('HemoIO was set up in another tab. Unlock with that password.'),
          })
        )
      );
      expect(mockOnComplete).not.toHaveBeenCalled();
      show.mockRestore();
    });
  });
});
