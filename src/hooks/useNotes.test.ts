/**
 * Tests for useNotes hook
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNotes } from './useNotes';
import { useEncryptedDb } from './useEncryptedDb';
import type { UserNote } from '@/types';

// Mock useEncryptedDb
vi.mock('./useEncryptedDb', () => ({
  useEncryptedDb: vi.fn(),
}));

function createMockNote(id: number, overrides: Partial<UserNote> = {}): UserNote {
  return {
    id,
    content: `Test note ${id}`,
    tags: [],
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
    ...overrides,
  };
}

describe('useNotes', () => {
  const mockDb = {
    getAllNotes: vi.fn(),
    getNotesByLabResult: vi.fn(),
    getNotesByBiomarker: vi.fn(),
    getNotesByTestValue: vi.fn(),
    getNotesByTag: vi.fn(),
    addNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useEncryptedDb).mockReturnValue({
      db: mockDb as any,
      isReady: true,
    });
    mockDb.getAllNotes.mockResolvedValue([]);
  });

  describe('fetching notes', () => {
    it('should fetch all notes on mount', async () => {
      const notes = [createMockNote(1), createMockNote(2)];
      mockDb.getAllNotes.mockResolvedValue(notes);

      const { result } = renderHook(() => useNotes());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockDb.getAllNotes).toHaveBeenCalled();
      expect(result.current.notes).toHaveLength(2);
    });

    it('should show loading state initially', () => {
      mockDb.getAllNotes.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const { result } = renderHook(() => useNotes());

      expect(result.current.isLoading).toBe(true);
    });

    it('should handle fetch error', async () => {
      mockDb.getAllNotes.mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() => useNotes());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Database error');
    });

    it('should not fetch when db is not ready', async () => {
      vi.mocked(useEncryptedDb).mockReturnValue({
        db: null,
        isReady: false,
      });

      const { result } = renderHook(() => useNotes());

      expect(mockDb.getAllNotes).not.toHaveBeenCalled();
      expect(result.current.notes).toEqual([]);
    });
  });

  describe('filtering', () => {
    it('should filter by labResultId', async () => {
      const notes = [createMockNote(1, { labResultId: 100 })];
      mockDb.getNotesByLabResult.mockResolvedValue(notes);

      const { result } = renderHook(() =>
        useNotes({ labResultId: 100 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockDb.getNotesByLabResult).toHaveBeenCalledWith(100);
      expect(result.current.notes).toHaveLength(1);
    });

    it('should filter by biomarkerId', async () => {
      const notes = [createMockNote(1, { biomarkerId: 50 })];
      mockDb.getNotesByBiomarker.mockResolvedValue(notes);

      const { result } = renderHook(() =>
        useNotes({ biomarkerId: 50 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockDb.getNotesByBiomarker).toHaveBeenCalledWith(50);
    });

    it('should filter by testValueId', async () => {
      const notes = [createMockNote(1, { testValueId: 25 })];
      mockDb.getNotesByTestValue.mockResolvedValue(notes);

      const { result } = renderHook(() =>
        useNotes({ testValueId: 25 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockDb.getNotesByTestValue).toHaveBeenCalledWith(25);
    });

    it('should filter by tag', async () => {
      const notes = [createMockNote(1, { tags: ['symptoms'] })];
      mockDb.getNotesByTag.mockResolvedValue(notes);

      const { result } = renderHook(() =>
        useNotes({ tag: 'symptoms' })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockDb.getNotesByTag).toHaveBeenCalledWith('symptoms');
    });

    it('should filter by search term', async () => {
      const notes = [
        createMockNote(1, { content: 'headache today' }),
        createMockNote(2, { content: 'feeling good' }),
      ];
      mockDb.getAllNotes.mockResolvedValue(notes);

      const { result } = renderHook(() =>
        useNotes({ searchTerm: 'headache' })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.notes).toHaveLength(1);
      expect(result.current.notes[0].content).toBe('headache today');
    });

    it('should filter by date range', async () => {
      const notes = [
        createMockNote(1, { createdAt: new Date('2024-01-15') }),
        createMockNote(2, { createdAt: new Date('2024-02-15') }),
        createMockNote(3, { createdAt: new Date('2024-03-15') }),
      ];
      mockDb.getAllNotes.mockResolvedValue(notes);

      const { result } = renderHook(() =>
        useNotes({
          startDate: new Date('2024-01-20'),
          endDate: new Date('2024-02-20'),
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.notes).toHaveLength(1);
    });

    it('should update filters with setFilters', async () => {
      mockDb.getAllNotes.mockResolvedValue([]);

      const { result } = renderHook(() => useNotes());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setFilters({ searchTerm: 'test' });
      });

      expect(result.current.filters.searchTerm).toBe('test');
    });
  });

  describe('createNote', () => {
    it('should create a new note', async () => {
      mockDb.addNote.mockResolvedValue(1);
      mockDb.getAllNotes.mockResolvedValue([]);

      const { result } = renderHook(() => useNotes());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let noteId: number;
      await act(async () => {
        noteId = await result.current.createNote({
          content: 'New note',
          labResultId: 100,
        });
      });

      expect(noteId!).toBe(1);
      expect(mockDb.addNote).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'New note',
          labResultId: 100,
          tags: [],
        })
      );
    });

    it('should refresh notes after creation', async () => {
      mockDb.addNote.mockResolvedValue(1);
      mockDb.getAllNotes.mockResolvedValue([]);

      const { result } = renderHook(() => useNotes());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCallCount = mockDb.getAllNotes.mock.calls.length;

      await act(async () => {
        await result.current.createNote({ content: 'New note' });
      });

      expect(mockDb.getAllNotes.mock.calls.length).toBe(initialCallCount + 1);
    });

    it('should throw when db not available', async () => {
      vi.mocked(useEncryptedDb).mockReturnValue({
        db: null,
        isReady: false,
      });

      const { result } = renderHook(() => useNotes());

      await expect(
        result.current.createNote({ content: 'Test' })
      ).rejects.toThrow('Database not available');
    });
  });

  describe('updateNote', () => {
    it('should update an existing note', async () => {
      mockDb.updateNote.mockResolvedValue(1);
      mockDb.getAllNotes.mockResolvedValue([]);

      const { result } = renderHook(() => useNotes());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateNote(1, { content: 'Updated content' });
      });

      expect(mockDb.updateNote).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          content: 'Updated content',
        })
      );
    });

    it('should update tags', async () => {
      mockDb.updateNote.mockResolvedValue(1);
      mockDb.getAllNotes.mockResolvedValue([]);

      const { result } = renderHook(() => useNotes());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateNote(1, { tags: ['symptom', 'medication'] });
      });

      expect(mockDb.updateNote).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          tags: ['symptom', 'medication'],
        })
      );
    });
  });

  describe('deleteNote', () => {
    it('should delete a note', async () => {
      mockDb.deleteNote.mockResolvedValue(undefined);
      mockDb.getAllNotes.mockResolvedValue([]);

      const { result } = renderHook(() => useNotes());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.deleteNote(1);
      });

      expect(mockDb.deleteNote).toHaveBeenCalledWith(1);
    });

    it('should refresh notes after deletion', async () => {
      mockDb.deleteNote.mockResolvedValue(undefined);
      mockDb.getAllNotes.mockResolvedValue([]);

      const { result } = renderHook(() => useNotes());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCallCount = mockDb.getAllNotes.mock.calls.length;

      await act(async () => {
        await result.current.deleteNote(1);
      });

      expect(mockDb.getAllNotes.mock.calls.length).toBe(initialCallCount + 1);
    });
  });

  describe('helper methods', () => {
    it('should get notes for lab result', async () => {
      const notes = [
        createMockNote(1, { labResultId: 100 }),
        createMockNote(2, { labResultId: 200 }),
        createMockNote(3, { labResultId: 100 }),
      ];
      mockDb.getAllNotes.mockResolvedValue(notes);

      const { result } = renderHook(() => useNotes());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const filtered = result.current.getNotesForLabResult(100);
      expect(filtered).toHaveLength(2);
    });

    it('should get notes for biomarker', async () => {
      const notes = [
        createMockNote(1, { biomarkerId: 50 }),
        createMockNote(2, { biomarkerId: 60 }),
      ];
      mockDb.getAllNotes.mockResolvedValue(notes);

      const { result } = renderHook(() => useNotes());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const filtered = result.current.getNotesForBiomarker(50);
      expect(filtered).toHaveLength(1);
    });

    it('should get notes for test value', async () => {
      const notes = [
        createMockNote(1, { testValueId: 10 }),
        createMockNote(2, { testValueId: 20 }),
      ];
      mockDb.getAllNotes.mockResolvedValue(notes);

      const { result } = renderHook(() => useNotes());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const filtered = result.current.getNotesForTestValue(10);
      expect(filtered).toHaveLength(1);
    });

    it('should return all unique tags', async () => {
      const notes = [
        createMockNote(1, { tags: ['symptom', 'medication'] }),
        createMockNote(2, { tags: ['symptom', 'diet'] }),
        createMockNote(3, { tags: ['medication'] }),
      ];
      mockDb.getAllNotes.mockResolvedValue(notes);

      const { result } = renderHook(() => useNotes());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.allTags).toEqual(['diet', 'medication', 'symptom']);
    });
  });

  describe('sorting', () => {
    it('should sort notes by creation date (newest first)', async () => {
      const notes = [
        createMockNote(1, { createdAt: new Date('2024-01-15') }),
        createMockNote(2, { createdAt: new Date('2024-03-15') }),
        createMockNote(3, { createdAt: new Date('2024-02-15') }),
      ];
      mockDb.getAllNotes.mockResolvedValue(notes);

      const { result } = renderHook(() => useNotes());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.notes[0].id).toBe(2); // March
      expect(result.current.notes[1].id).toBe(3); // February
      expect(result.current.notes[2].id).toBe(1); // January
    });
  });
});
