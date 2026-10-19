/**
 * Renders a note's Markdown subset as React elements. Text is only ever
 * placed as text nodes, so no stored HTML can run.
 */
import { Fragment } from 'react';
import { Box } from '@mantine/core';
import { parseNoteMarkdown, type InlineNode } from '@services/notes';

export interface NoteContentProps {
  content: string;
  /** Search term to mark in the text */
  highlight?: string;
}

function renderInline(nodes: InlineNode[]): React.ReactNode {
  return nodes.map((node, i) => {
    if (node.type === 'bold') return <strong key={i}>{node.text}</strong>;
    if (node.type === 'italic') return <em key={i}>{node.text}</em>;
    return <Fragment key={i}>{node.text}</Fragment>;
  });
}

export function NoteContent({ content }: NoteContentProps): React.ReactNode {
  return (
    <Box fz="sm" style={{ overflowWrap: 'anywhere' }}>
      {parseNoteMarkdown(content).map((block, i) => {
        if (block.type === 'bullet-list') {
          return (
            <ul key={i} style={{ margin: 0, paddingLeft: 20 }}>
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ordered-list') {
          return (
            <ol key={i} start={block.start} style={{ margin: 0, paddingLeft: 20 }}>
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i} style={{ margin: '0 0 4px' }}>
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </Box>
  );
}
