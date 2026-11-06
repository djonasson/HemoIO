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
const folder = vi.hoisted(() => ({ on: false, push: vi.fn<() => Promise<boolean>>() }));
vi.mock('@data/storage/storageChoice', () => ({ isFolderStorageOn: () => folder.on }));
vi.mock('@services/sync/folderLockPush', () => ({ pushLockToFolder: folder.push }));

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
    folder.on = false;
    folder.push.mockReset();
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

  it('puts the new lock into the folder at once, with folder storage on', async () => {
    const user = userEvent.setup();
    folder.on = true;
    folder.push.mockResolvedValue(true);
    mockChangePassword.mockResolvedValue({ ok: true });
    renderForm();
    await fill(user);

    await user.click(submit());

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Password changed. Use your new password next time you unlock HemoIO.'
    );
    expect(folder.push).toHaveBeenCalledTimes(1);
  });

  it('says when the folder could not take the new lock yet', async () => {
    const user = userEvent.setup();
    folder.on = true;
    folder.push.mockResolvedValue(false);
    mockChangePassword.mockResolvedValue({ ok: true });
    renderForm();
    await fill(user);

    await user.click(submit());

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Password changed. HemoIO could not update the lock in your folder yet; it will try again at the next sync.'
    );
    expect(current()).toHaveValue('');
  });

  it('asks nothing of the folder when the password was not changed', async () => {
    const user = userEvent.setup();
    folder.on = true;
    mockChangePassword.mockResolvedValue({ ok: false, reason: 'wrong_password' });
    renderForm();
    await fill(user);

    await user.click(submit());

    await waitFor(() => expect(current()).toHaveFocus());
    expect(folder.push).not.toHaveBeenCalled();
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

  it('says when the password was changed elsewhere meanwhile', async () => {
    const user = userEvent.setup();
    mockChangePassword.mockResolvedValue({ ok: false, reason: 'changed_elsewhere' });
    renderForm();
    await fill(user);

    await user.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Password not changed: it was changed meanwhile, in another tab or on another computer. Try again with the current password.'
    );
    expect(folder.push).not.toHaveBeenCalled();
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
