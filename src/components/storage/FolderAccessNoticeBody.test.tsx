import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { chooseFolder } from '@data/storage/chooseFolder';
import { grantFolderAccess } from '@data/storage/grantFolderAccess';
import {
  ACCESS_BLOCKED_TEXT,
  ACCESS_NEEDED_TEXT,
  ACCESS_NOT_GIVEN_TEXT,
  FolderAccessNoticeBody,
} from './FolderAccessNoticeBody';

vi.mock('@data/storage/chooseFolder', () => ({ chooseFolder: vi.fn() }));
vi.mock('@data/storage/grantFolderAccess', () => ({ grantFolderAccess: vi.fn() }));

function renderBody(blocked: boolean) {
  const onLookAgain = vi.fn();
  render(
    <MantineProvider env="test">
      <FolderAccessNoticeBody blocked={blocked} onLookAgain={onLookAgain} />
    </MantineProvider>
  );
  return { onLookAgain };
}

describe('FolderAccessNoticeBody', () => {
  beforeEach(() => {
    vi.mocked(chooseFolder).mockReset().mockResolvedValue('chosen');
    vi.mocked(grantFolderAccess).mockReset().mockResolvedValue('granted');
  });

  it('asks for access from the click, saying nothing more once it is given', async () => {
    const { onLookAgain } = renderBody(false);

    expect(screen.getByText(ACCESS_NEEDED_TEXT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    expect(grantFolderAccess).toHaveBeenCalledTimes(1);
    // Given, every tab is told: the notice goes without being asked to look
    expect(onLookAgain).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['answers without giving it', () => vi.mocked(grantFolderAccess).mockResolvedValue('prompt')],
    ['fails to ask', () => vi.mocked(grantFolderAccess).mockRejectedValue(new Error('No directory selected'))],
  ])('says access was not given when the browser %s, letting the user try again', async (_, arrange) => {
    arrange();
    renderBody(false);

    await userEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    // Fixed text: an error could name the folder
    expect(await screen.findByRole('alert')).toHaveTextContent(ACCESS_NOT_GIVEN_TEXT);
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeEnabled();
  });

  it.each([
    ['answers denied', () => vi.mocked(grantFolderAccess).mockResolvedValue('denied')],
    ['fails to ask', () => vi.mocked(grantFolderAccess).mockRejectedValue(new Error('No directory selected'))],
  ])('looks at access again when the browser %s, as it may now block it', async (_, arrange) => {
    arrange();
    const { onLookAgain } = renderBody(false);

    await userEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    expect(onLookAgain).toHaveBeenCalledTimes(1);
  });

  it('offers another folder where the browser blocks access, as it no longer asks', async () => {
    renderBody(true);

    expect(screen.getByText(ACCESS_BLOCKED_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grant access' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Choose another folder' }));

    expect(chooseFolder).toHaveBeenCalledTimes(1);
  });

  it('tells the caller when folder storage was switched off meanwhile', async () => {
    vi.mocked(chooseFolder).mockResolvedValue('off');
    const { onLookAgain } = renderBody(true);

    await userEvent.click(screen.getByRole('button', { name: 'Choose another folder' }));

    expect(onLookAgain).toHaveBeenCalledTimes(1);
  });
});
