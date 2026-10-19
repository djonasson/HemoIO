/**
 * Renders a note's Markdown subset as React elements. Text is only ever
 * placed as text nodes, so no stored HTML can run.
 */
import { Fragment } from 'react';
import { Box } from '@mantine/core';
import { parseNoteMarkdown, splitForHighlight, type InlineNode } from '@services/notes';

export interface NoteContentProps {
  content: string;
  /** Search term to mark in the text */
  highlight?: string;
}

function marked(text: string, highlight: string | undefined): React.ReactNode {
  return splitForHighlight(text, highlight).map((part, i) =>
    part.match ? <mark key={i}>{part.text}</mark> : <Fragment key={i}>{part.text}</Fragment>
  );
}

function renderInline(nodes: InlineNode[], highlight?: string): React.ReactNode {
  return nodes.map((node, i) => {
    if (node.type === 'bold') return <strong key={i}>{marked(node.text, highlight)}</strong>;
    if (node.type === 'italic') return <em key={i}>{marked(node.text, highlight)}</em>;
    return <Fragment key={i}>{marked(node.text, highlight)}</Fragment>;
  });
}

export function NoteContent({ content, highlight }: NoteContentProps): React.ReactNode {
  return (
    <Box fz="sm" style={{ overflowWrap: 'anywhere' }}>
      {parseNoteMarkdown(content).map((block, i) => {
        if (block.type === 'bullet-list') {
          return (
            <ul key={i} style={{ margin: 0, paddingLeft: 20 }}>
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item, highlight)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ordered-list') {
          return (
            <ol key={i} start={block.start} style={{ margin: 0, paddingLeft: 20 }}>
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item, highlight)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i} style={{ margin: '0 0 4px' }}>
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(line, highlight)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </Box>
  );
}
