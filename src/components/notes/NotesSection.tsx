/**
 * NotesSection Component
 *
 * A reusable section for displaying and managing notes.
 * Can be used in Timeline cards, Trends view, etc.
 */

import { useState } from 'react';
import { Stack, Text, Button, Collapse, Group } from '@mantine/core';
import { IconPlus, IconNote, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { SaveFailedAlert } from '@components/common/SaveFailedAlert';
import { useSaveState } from '@hooks/useSaveState';
import type { UserNote } from '@/types';
import { NoteEditor } from './NoteEditor';
import { NoteDisplay } from './NoteDisplay';

/**
 * Props for NotesSection component
 */
export interface NotesSectionProps {
  /** Notes to display */
  notes: UserNote[];
  /** Called when creating a new note */
  onCreateNote: (content: string, tags: string[]) => Promise<void>;
  /** Called when updating a note */
  onUpdateNote: (id: number, content: string, tags: string[]) => Promise<void>;
  /** Called when deleting a note */
  onDeleteNote: (id: number) => Promise<void>;
  /** Optional title for the section */
  title?: string;
  /** Whether to show the section collapsed by default */
  defaultCollapsed?: boolean;
  /** Whether operations are currently processing */
  isProcessing?: boolean;
  /** Whether the section is initially showing the editor */
  showEditorByDefault?: boolean;
  /** Placeholder text for the editor */
  editorPlaceholder?: string;
}

/**
 * Section for displaying and managing notes
 */
export function NotesSection({
  notes,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  title = 'Notes',
  defaultCollapsed = false,
  isProcessing = false,
  showEditorByDefault = false,
  editorPlaceholder,
}: NotesSectionProps): React.ReactNode {
  // Follow defaultCollapsed until the user toggles: callers may only know
  // the right default once their notes have loaded
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null);
  const isCollapsed = userCollapsed ?? defaultCollapsed;
  const [showEditor, setShowEditor] = useState(showEditorByDefault);
  // Shown in the editor, which keeps the note to save again; notified once
  // the editor is gone
  const { isSaving, error: saveError, run, clear } = useSaveState('Note not saved');

  const handleToggleCollapse = () => {
    // Not while a note saves: hidden, its failure would be seen by no one
    if (isSaving) return;
    setUserCollapsed(!isCollapsed);
  };

  const handleShowEditor = () => {
    setShowEditor(true);
  };

  const handleCancelEditor = () => {
    setShowEditor(false);
    clear();
  };

  const handleSaveNote = async (content: string, tags: string[]) => {
    if (await run(() => onCreateNote(content, tags))) setShowEditor(false);
  };

  const handleUpdateNote = async (id: number, content: string, tags: string[]) => {
    await onUpdateNote(id, content, tags);
  };

  const handleDeleteNote = async (id: number) => {
    await onDeleteNote(id);
  };

  const hasNotes = notes.length > 0;

  return (
    <Stack gap="sm">
      {/* Header with toggle */}
      <Group
        justify="space-between"
        onClick={handleToggleCollapse}
        style={{ cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggleCollapse();
          }
        }}
        aria-expanded={!isCollapsed}
        aria-label={`${title} section, ${isCollapsed ? 'collapsed' : 'expanded'}`}
      >
        <Group gap="xs">
          <IconNote size={16} />
          <Text fw={500} size="sm">
            {title}
          </Text>
          {hasNotes && (
            <Text size="xs" c="dimmed">
              ({notes.length})
            </Text>
          )}
        </Group>
        {isCollapsed ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
      </Group>

      {/* Content */}
      <Collapse in={!isCollapsed}>
        <Stack gap="sm">
          {/* Existing notes */}
          {notes.map((note) => (
            <NoteDisplay
              key={note.id}
              note={note}
              onUpdate={handleUpdateNote}
              onDelete={handleDeleteNote}
              isProcessing={isProcessing}
            />
          ))}

          {/* Empty state */}
          {!hasNotes && !showEditor && (
            <Text size="sm" c="dimmed" ta="center" py="sm">
              No notes yet
            </Text>
          )}

          {/* Note editor */}
          {showEditor && saveError !== null && (
            <SaveFailedAlert title="Note not saved" error={saveError} />
          )}
          {showEditor ? (
            <NoteEditor
              onSave={handleSaveNote}
              onCancel={handleCancelEditor}
              isSaving={isSaving}
              placeholder={editorPlaceholder}
            />
          ) : (
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={handleShowEditor}
              disabled={isProcessing}
            >
              Add Note
            </Button>
          )}
        </Stack>
      </Collapse>
    </Stack>
  );
}
