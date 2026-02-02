/**
 * Hook to fetch and manage user notes
 *
 * Provides CRUD operations for notes attached to lab results,
 * biomarkers, or specific test values.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useEncryptedDb } from './useEncryptedDb';
import type { UserNote } from '@/types';

/**
 * Filters for notes
 */
export interface NoteFilters {
  /** Filter by lab result ID */
  labResultId?: number;
  /** Filter by biomarker ID */
  biomarkerId?: number;
  /** Filter by test value ID */
  testValueId?: number;
  /** Filter by tag */
  tag?: string;
  /** Search term for note content */
  searchTerm?: string;
  /** Start date for filtering */
  startDate?: Date;
  /** End date for filtering */
  endDate?: Date;
}

/**
 * Input for creating a new note
 */
export interface CreateNoteInput {
  /** The lab result this note is attached to */
  labResultId?: number;
  /** The biomarker this note relates to */
  biomarkerId?: number;
  /** The specific test value this note is attached to */
  testValueId?: number;
  /** The note content */
  content: string;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Input for updating an existing note
 */
export interface UpdateNoteInput {
  /** The note content */
  content?: string;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Result of useNotes hook
 */
export interface UseNotesResult {
  /** All notes matching current filters */
  notes: UserNote[];
  /** Whether data is currently loading */
  isLoading: boolean;
  /** Error message if operation failed */
  error: string | null;
  /** Current filters applied */
  filters: NoteFilters;
  /** Set filters for notes */
  setFilters: (filters: NoteFilters) => void;
  /** Create a new note */
  createNote: (input: CreateNoteInput) => Promise<number>;
  /** Update an existing note */
  updateNote: (id: number, input: UpdateNoteInput) => Promise<void>;
  /** Delete a note */
  deleteNote: (id: number) => Promise<void>;
  /** Refresh notes from database */
  refresh: () => Promise<void>;
  /** Get notes for a specific lab result */
  getNotesForLabResult: (labResultId: number) => UserNote[];
  /** Get notes for a specific biomarker */
  getNotesForBiomarker: (biomarkerId: number) => UserNote[];
  /** Get notes for a specific test value */
  getNotesForTestValue: (testValueId: number) => UserNote[];
  /** Get all unique tags */
  allTags: string[];
}

/**
 * Hook for managing user notes
 */
export function useNotes(initialFilters: NoteFilters = {}): UseNotesResult {
  const { db, isReady } = useEncryptedDb();
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<NoteFilters>(initialFilters);

  /**
   * Fetch notes from database
   */
  const fetchNotes = useCallback(async () => {
    if (!db || !isReady) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let fetchedNotes: UserNote[];

      // Fetch based on filters
      if (filters.labResultId !== undefined) {
        fetchedNotes = await db.getNotesByLabResult(filters.labResultId);
      } else if (filters.biomarkerId !== undefined) {
        fetchedNotes = await db.getNotesByBiomarker(filters.biomarkerId);
      } else if (filters.testValueId !== undefined) {
        fetchedNotes = await db.getNotesByTestValue(filters.testValueId);
      } else if (filters.tag !== undefined) {
        fetchedNotes = await db.getNotesByTag(filters.tag);
      } else {
        fetchedNotes = await db.getAllNotes();
      }

      // Apply additional filters
      let filtered = fetchedNotes;

      // Date range filter
      if (filters.startDate) {
        filtered = filtered.filter((n) => n.createdAt >= filters.startDate!);
      }
      if (filters.endDate) {
        filtered = filtered.filter((n) => n.createdAt <= filters.endDate!);
      }

      // Search term filter
      if (filters.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        filtered = filtered.filter((n) =>
          n.content.toLowerCase().includes(term)
        );
      }

      // Sort by creation date (newest first)
      filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      setNotes(filtered);
    } catch (err) {
      console.error('Failed to fetch notes:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch notes');
    } finally {
      setIsLoading(false);
    }
  }, [db, isReady, filters]);

  // Fetch notes when dependencies change
  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  /**
   * Create a new note
   */
  const createNote = useCallback(
    async (input: CreateNoteInput): Promise<number> => {
      if (!db || !isReady) {
        throw new Error('Database not available');
      }

      const now = new Date();
      const note: Omit<UserNote, 'id'> = {
        labResultId: input.labResultId,
        biomarkerId: input.biomarkerId,
        testValueId: input.testValueId,
        content: input.content,
        tags: input.tags || [],
        createdAt: now,
        updatedAt: now,
      };

      const id = await db.addNote(note);
      await fetchNotes();
      return id;
    },
    [db, isReady, fetchNotes]
  );

  /**
   * Update an existing note
   */
  const updateNote = useCallback(
    async (id: number, input: UpdateNoteInput): Promise<void> => {
      if (!db || !isReady) {
        throw new Error('Database not available');
      }

      const changes: Partial<UserNote> = {
        updatedAt: new Date(),
      };

      if (input.content !== undefined) {
        changes.content = input.content;
      }
      if (input.tags !== undefined) {
        changes.tags = input.tags;
      }

      await db.updateNote(id, changes);
      await fetchNotes();
    },
    [db, isReady, fetchNotes]
  );

  /**
   * Delete a note
   */
  const deleteNote = useCallback(
    async (id: number): Promise<void> => {
      if (!db || !isReady) {
        throw new Error('Database not available');
      }

      await db.deleteNote(id);
      await fetchNotes();
    },
    [db, isReady, fetchNotes]
  );

  /**
   * Get notes for a specific lab result
   */
  const getNotesForLabResult = useCallback(
    (labResultId: number): UserNote[] => {
      return notes.filter((n) => n.labResultId === labResultId);
    },
    [notes]
  );

  /**
   * Get notes for a specific biomarker
   */
  const getNotesForBiomarker = useCallback(
    (biomarkerId: number): UserNote[] => {
      return notes.filter((n) => n.biomarkerId === biomarkerId);
    },
    [notes]
  );

  /**
   * Get notes for a specific test value
   */
  const getNotesForTestValue = useCallback(
    (testValueId: number): UserNote[] => {
      return notes.filter((n) => n.testValueId === testValueId);
    },
    [notes]
  );

  /**
   * Get all unique tags from notes
   */
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const note of notes) {
      for (const tag of note.tags) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [notes]);

  return {
    notes,
    isLoading,
    error,
    filters,
    setFilters,
    createNote,
    updateNote,
    deleteNote,
    refresh: fetchNotes,
    getNotesForLabResult,
    getNotesForBiomarker,
    getNotesForTestValue,
    allTags,
  };
}
