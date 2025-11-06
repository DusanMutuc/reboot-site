// src/components/coach/LibraryItemPickerDialog.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  TextField,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import { supabase } from '@/lib/supabaseClient';

export type LibraryItemLite = {
  id: number;
  title: string | null;
  description?: string | null;
  slug?: string | null;
  node_type: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (item: LibraryItemLite) => void;
};

export default function LibraryItemPickerDialog({ open, onClose, onSelect }: Props) {
  const [rootId, setRootId] = useState<number | null>(null);
  const [items, setItems] = useState<LibraryItemLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Resolve Library root id (same logic as LibraryPage)
  useEffect(() => {
    if (!open) return;
    if (rootId != null) return; // already resolved

    let cancelled = false;

    async function resolveRoot() {
      try {
        setError(null);

        let root: number | null = null;

        // 1) site_settings.library_root_id
        const { data: ss } = await supabase
          .from('site_settings')
          .select('value')
          .eq('key', 'library_root_id')
          .maybeSingle();

        if (ss?.value && !Number.isNaN(Number(ss.value))) {
          root = Number(ss.value);
        }

        // 2) slug = 'library'
        if (!root) {
          const { data: libSlug } = await supabase
            .from('content_nodes')
            .select('id')
            .eq('slug', 'library')
            .maybeSingle();
          if (libSlug?.id) root = libSlug.id;
        }

        // 3) latest collection
        if (!root) {
          const { data: anyCollection } = await supabase
            .from('content_nodes')
            .select('id')
            .eq('node_type', 'collection')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (anyCollection?.id) root = anyCollection.id;
        }

        if (!root) {
          throw new Error(
            'No Library collection found. Create one or set site_settings.library_root_id.'
          );
        }

        if (!cancelled) setRootId(root);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to resolve Library root.';
        if (!cancelled) setError(msg);
      }
    }

    void resolveRoot();

    return () => {
      cancelled = true;
    };
  }, [open, rootId]);

  // Load Library children under root
  useEffect(() => {
    if (!open) return;
    if (!rootId) return;
    if (items.length > 0) return; // already loaded

    let cancelled = false;

    async function loadChildren() {
      setLoading(true);
      setError(null);
      try {
        // 1) node_children for ordering
        const { data: links, error: linkErr } = await supabase
          .from('node_children')
          .select('child_id, position')
          .eq('parent_id', rootId)
          .order('position', { ascending: true });

        if (linkErr) throw linkErr;

        const childIds = (links ?? []).map((l) => l.child_id);
        if (childIds.length === 0) {
          if (!cancelled) setItems([]);
          return;
        }

        // 2) fetch the child nodes
        const { data: nodes, error: nodeErr } = await supabase
          .from('content_nodes')
          .select('id, title, description, slug, node_type')
          .in('id', childIds);

        if (nodeErr) throw nodeErr;

        const nodeMap = new Map<number, LibraryItemLite>();
        (nodes ?? []).forEach((n) => {
          nodeMap.set(n.id as number, {
            id: n.id as number,
            title: n.title ?? null,
            description: n.description ?? null,
            slug: n.slug ?? null,
            node_type: n.node_type ?? 'page',
          });
        });

        const stitched: LibraryItemLite[] = (links ?? [])
          .map((l) => {
            const child = nodeMap.get(l.child_id);
            return child ?? null;
          })
          .filter((x): x is LibraryItemLite => x !== null);

        if (!cancelled) setItems(stitched);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load Library items.';
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadChildren();

    return () => {
      cancelled = true;
    };
  }, [open, rootId, items.length]);

  // Filter by search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((it) => {
      const title = (it.title ?? '').toLowerCase();
      const desc = (it.description ?? '').toLowerCase();
      return title.includes(q) || desc.includes(q);
    });
  }, [items, search]);

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle>Choose a Library item</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            size="small"
            label="Search Library"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Box>

        {loading && (
          <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {!loading && error && (
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        )}

        {!loading && !error && filtered.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No Library items found.
          </Typography>
        )}

        {!loading && !error && filtered.length > 0 && (
          <List
            dense
            sx={{
              maxHeight: 360,
              overflowY: 'auto',
            }}
          >
            {filtered.map((item) => (
              <ListItemButton
                key={item.id}
                onClick={() => {
                  onSelect(item);
                  handleClose();
                }}
              >
                <ListItemText
                  primary={
                    <Typography sx={{ fontWeight: 600 }}>
                      {item.title || 'Untitled'}
                    </Typography>
                  }
                  secondary={
                    <>
                      {item.node_type && (
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                          sx={{ textTransform: 'capitalize', mr: 1 }}
                        >
                          {item.node_type}
                        </Typography>
                      )}
                      {item.description && (
                        <Typography
                          component="span"
                          variant="body2"
                          color="text.secondary"
                        >
                          · {item.description}
                        </Typography>
                      )}
                    </>
                  }
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
