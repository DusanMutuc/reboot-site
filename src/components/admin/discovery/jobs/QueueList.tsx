'use client';

import { useEffect, useRef } from 'react';
import { Box, Checkbox, Chip, Stack, Typography } from '@mui/material';
import { discoveryJobFormatLabel, refKey, splitTitleMarker } from '@/lib/discoveryJobTypes';
import type { DiscoveryItemRef, DiscoveryQueueItem } from '@/lib/discoveryJobTypes';

/**
 * A queue is a single-selection LISTBOX, not a set of buttons.
 *
 * One tab stop with roving selection: the container is focusable, arrow keys move `aria-activedescendant`,
 * and each row is an `option` carrying `aria-selected` and a name. Making every row its own tab stop
 * would force a keyboard user through the entire queue before reaching the panel.
 *
 * Rows never change height and never expand. The evidence and the decision live in the panel, so
 * moving focus produces no layout motion at all.
 */
export default function QueueList({
  items, focusIndex, onFocusIndex, selected, onToggleSelect, height, selectable = true, listId,
  emptyMessage, renderMeta,
}: {
  items: DiscoveryQueueItem[];
  focusIndex: number;
  onFocusIndex: (index: number) => void;
  selected?: Set<string>;
  onToggleSelect?: (ref: DiscoveryItemRef) => void;
  height: number;
  selectable?: boolean;
  listId: string;
  emptyMessage?: string;
  /** The middle column. Topics by default; other queues show whatever their decision needs. */
  renderMeta?: (item: DiscoveryQueueItem) => React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the focused option in view as selection roves, without moving the page.
  useEffect(() => {
    const container = scrollRef.current;
    const row = container?.querySelector<HTMLElement>('[data-focused="true"]');
    if (!container || !row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < container.scrollTop) container.scrollTop = top - 6;
    else if (bottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = bottom - container.clientHeight + 6;
    }
  }, [focusIndex, items]);

  const move = (delta: number) => {
    const next = Math.min(items.length - 1, Math.max(0, focusIndex + delta));
    if (next !== focusIndex) onFocusIndex(next);
  };

  return (
    <Box
      ref={scrollRef}
      role="listbox"
      tabIndex={0}
      id={listId}
      aria-label="Items needing a decision"
      aria-activedescendant={items[focusIndex] ? `${listId}-${refKey(items[focusIndex])}` : undefined}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
        else if (event.key === 'Home') { event.preventDefault(); onFocusIndex(0); }
        else if (event.key === 'End') { event.preventDefault(); onFocusIndex(items.length - 1); }
      }}
      sx={{
        height, overflowY: 'auto', overflowX: 'hidden',
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
      }}
    >
      {items.map((item, index) => {
        const key = refKey(item);
        const focused = index === focusIndex;
        const { subject, marker } = splitTitleMarker(item.title);
        const isSelected = selected?.has(key) ?? false;
        return (
          <Box
            key={key}
            id={`${listId}-${key}`}
            role="option"
            aria-selected={focused}
            data-focused={focused}
            aria-label={`${item.title}, ${discoveryJobFormatLabel(item)}, ${
              item.stale ? 'needs another look' : item.decided ? 'done' : 'not yet decided'}`}
            onClick={() => onFocusIndex(index)}
            sx={{
              display: 'grid', alignItems: 'center', gap: 1.5, px: 1.75, py: 1,
              gridTemplateColumns: `${selectable ? '32px ' : ''}96px minmax(0, 1fr) 240px 116px`,
              borderBottom: '1px solid', borderColor: 'divider', cursor: 'pointer', position: 'relative',
              bgcolor: focused ? 'action.selected' : 'transparent',
              opacity: item.decided ? 0.55 : 1,
              '&:hover': { bgcolor: focused ? 'action.selected' : 'action.hover' },
              '&::before': focused ? {
                content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, bgcolor: 'primary.main',
              } : undefined,
            }}
          >
            {selectable && (
              <Checkbox
                size="small" checked={isSelected} tabIndex={-1}
                inputProps={{ 'aria-label': `Select ${item.title} for bulk topic assignment` }}
                onClick={(event) => { event.stopPropagation(); onToggleSelect?.({ kind: item.kind, id: item.id }); }}
                sx={{ p: 0.25 }}
              />
            )}
            <Box>
              <Chip
                label={discoveryJobFormatLabel(item)} size="small"
                color={item.kind === 'node' ? 'primary' : 'default'}
                variant={item.kind === 'node' ? 'outlined' : 'filled'}
                sx={{ height: 20, fontSize: 11 }}
              />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{
                fontWeight: focused ? 600 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {subject}
                {marker && <Box component="span" sx={{ color: 'text.disabled', fontWeight: 400 }}>{marker}</Box>}
              </Typography>
              {!!item.placements.length && (
                <Typography variant="caption" color="text.disabled" sx={{
                  display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  in {item.placements[0].nodeTitle}
                  {item.placements.length > 1 ? ` +${item.placements.length - 1} more` : ''}
                </Typography>
              )}
            </Box>
            <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ minWidth: 0 }}>
              {renderMeta ? renderMeta(item) : (
                item.answer === 'none_needed' && !item.topics.length
                  ? <Typography variant="caption" color="text.disabled">No topic needed</Typography>
                  : item.topics.length
                    ? item.topics.slice(0, 3).map((topic) => (
                      <Chip key={topic.id} label={topic.name} size="small" variant="outlined"
                        sx={{ height: 20, fontSize: 11 }} />
                    ))
                    : <Typography variant="caption" color="text.disabled">—</Typography>
              )}
              {!renderMeta && item.topics.length > 3 && (
                <Typography variant="caption" color="text.disabled">+{item.topics.length - 3}</Typography>
              )}
            </Stack>
            {/* Blank until there is something to say. A column reading "Not decided" on every
                row is noise: the whole list is undecided by default. */}
            <Box sx={{ textAlign: 'right' }}>
              {item.stale ? (
                <Typography variant="caption" sx={{ color: 'warning.dark', fontWeight: 600 }}
                  title="Answered before, but the item has changed since">
                  Needs another look
                </Typography>
              ) : item.decided ? (
                <Typography variant="caption" sx={{ color: 'primary.dark', fontWeight: 600 }}>Done</Typography>
              ) : null}
            </Box>
          </Box>
        );
      })}
      {!items.length && emptyMessage && (
        <Box sx={{ p: 5, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">{emptyMessage}</Typography>
        </Box>
      )}
    </Box>
  );
}
