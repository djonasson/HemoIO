/**
 * NotesSection Component
 *
 * A reusable section for displaying and managing notes.
 * Can be used in Timeline cards, Trends view, etc.
 */

import { useState } from 'react';
import { Stack, Text, Button, Collapse, Group } from '@mantine/core';
import { IconPlus, IconNote, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
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
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [showEditor, setShowEditor] = useState(showEditorByDefault);
  const [isSaving, setIsSaving] = useState(false);

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => !prev);
  };

  const handleShowEditor = () => {
    setShowEditor(true);
  };

  const handleCancelEditor = () => {
    setShowEditor(false);
  };

  const handleSaveNote = async (content: string, tags: string[]) => {
    setIsSaving(true);
    try {
      await onCreateNote(content, tags);
      setShowEditor(false);
    } finally {
      setIsSaving(false);
    }
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
