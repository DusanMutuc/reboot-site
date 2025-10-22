'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Stack, Tab, Tabs, Typography, Checkbox, FormControlLabel
} from '@mui/material';
import Image from 'next/image';
import CloseIcon from '@mui/icons-material/Close';
import { supabase } from '@/lib/supabaseClient';
import Grid from '@mui/material/Grid'; // Grid v2 (stable in MUI v6)

const BUCKET = 'course-heroes';

type StorageItem = {
  name: string; // relative name within current prefix (e.g. "uuid.webp" or "42" when listing root)
  id?: string;
  updated_at?: string;
  metadata?: any; // files have metadata.mimetype; folders generally do not
};

export default function HeroImageManagerDialog(props: {
  open: boolean;
  courseId: number | null;
  currentPath?: string | null;
  onClose: () => void;
  onChangePath: (newPath: string | null) => void; // write to DB in parent
}) {
  const { open, onClose, courseId, currentPath, onChangePath } = props;

  const [tab, setTab] = useState<'upload' | 'reuse'>('upload');
  const [items, setItems] = useState<StorageItem[] | null>(null);
  const [page, setPage] = useState(0);
  const [deletingOld, setDeletingOld] = useState(false);
  const [busy, setBusy] = useState(false);

  // Drill-down prefix (e.g. "", "42/", "42/sub/")
  const [prefix, setPrefix] = useState<string>('');

  // Initialize prefix on open to the course's folder (nice default)
  useEffect(() => {
    if (open) {
      setPage(0);
      setTab((t) => t); // keep active tab
      setPrefix(courseId ? `${courseId}/` : '');
    }
  }, [open, courseId]);

  // Helpers
  const isFolder = (it: StorageItem) => !it?.metadata?.mimetype;
  const join = (base: string, name: string) => (base ? `${base.replace(/\/?$/, '/')}${name}` : name);
  const parentOf = (p: string) => {
    const parts = p.replace(/\/$/, '').split('/');
    parts.pop();
    return parts.length ? parts.join('/') + '/' : '';
  };

  const load = useCallback(async () => {
    if (tab !== 'reuse') return;
    setItems(null);
    const { data, error } = await supabase
      .storage
      .from(BUCKET)
      .list(prefix, { limit: 24, offset: page * 24, sortBy: { column: 'updated_at', order: 'desc' } });
    if (error) {
      setItems([]);
      return;
    }
    setItems(data as StorageItem[]);
  }, [prefix, page, tab]);

  useEffect(() => { void load(); }, [load]);

  // Use plain /object/ public URL (no transform) for reliability
  const toUrl = useCallback(
    (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
    []
  );

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!file || !courseId) return;
    if (!file.type.startsWith('image/')) return alert('Please choose an image file.');
    if (file.size > 5 * 1024 * 1024) return alert('Max file size is 5MB.');

    setBusy(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const key = `${courseId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(key, file, { upsert: true, cacheControl: '3600', contentType: file.type });
      if (upErr) throw upErr;

      if (deletingOld && currentPath && currentPath !== key) {
        await supabase.storage.from(BUCKET).remove([currentPath]).catch(() => {});
      }

      onChangePath(key); // parent updates DB
      onClose();
    } catch (err: any) {
      alert(err?.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleUse(path: string) {
    setBusy(true);
    try {
      if (deletingOld && currentPath && currentPath !== path) {
        await supabase.storage.from(BUCKET).remove([currentPath]).catch(() => {});
      }
      onChangePath(path);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    setBusy(true);
    try {
      if (deletingOld && currentPath) {
        await supabase.storage.from(BUCKET).remove([currentPath]).catch(() => {});
      }
      onChangePath(null);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const headerPath = useMemo(() => (prefix || '/'), [prefix]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Set hero image {courseId ? `(course #${courseId})` : ''}
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ mb: 2 }}
          aria-label="Upload or reuse"
        >
          <Tab value="upload" label="Upload" />
          <Tab value="reuse" label="Reuse" />
        </Tabs>

        <Stack spacing={2}>
          <FormControlLabel
            control={<Checkbox checked={deletingOld} onChange={e => setDeletingOld(e.target.checked)} />}
            label="Delete previous file on replace"
          />

          {tab === 'upload' ? (
            <Stack direction="row" alignItems="center" spacing={2}>
              <Button variant="contained" component="label" disabled={busy}>
                {busy ? 'Uploading…' : 'Choose image'}
                <input type="file" accept="image/*" hidden onChange={handleUpload} />
              </Button>
              {currentPath ? (
                <Button color="warning" onClick={handleClear} disabled={busy}>
                  Remove image
                </Button>
              ) : null}
            </Stack>
          ) : (
            <Stack spacing={2}>
              {/* Breadcrumb / navigation */}
              <Stack direction="row" spacing={1} alignItems="center">
                <Button size="small" onClick={() => { setPrefix(''); setPage(0); }} disabled={!prefix}>
                  Root
                </Button>
                <Button
                  size="small"
                  onClick={() => { setPrefix(parentOf(prefix)); setPage(0); }}
                  disabled={!prefix}
                >
                  Up one
                </Button>
                <Typography variant="caption" color="text.secondary">
                  {headerPath}
                </Typography>
              </Stack>

              {items === null ? (
                <Typography variant="body2">Loading…</Typography>
              ) : items.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No items in this folder.</Typography>
              ) : (
                <Grid container spacing={2}>
                  {items.map((it) => {
                    const name = it.name; // relative to prefix
                    if (isFolder(it)) {
                      return (
                        <Grid key={`dir:${prefix}${name}`} size={{ xs: 6, md: 4 }}>
                          <Box
                            onClick={() => { setPrefix(join(prefix, name) + '/'); setPage(0); }}
                            sx={{
                              border: '1px dashed',
                              borderColor: 'divider',
                              borderRadius: 2,
                              p: 2,
                              cursor: 'pointer',
                              height: '100%',
                              display: 'grid',
                              alignContent: 'center',
                              gap: 0.5,
                            }}
                            aria-label={`Open folder ${name}`}
                          >
                            <Typography fontWeight={700}>📁 {name}/</Typography>
                            <Typography variant="caption" color="text.secondary">Open folder</Typography>
                          </Box>
                        </Grid>
                      );
                    }

                    const path = join(prefix, name); // full file path
                    const url = toUrl(path);

                    return (
                      <Grid key={`file:${path}`} size={{ xs: 6, md: 4 }}>
                        <Box
                          sx={{
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 2,
                            overflow: 'hidden',
                            cursor: 'pointer',
                          }}
                          onClick={() => handleUse(path)}
                          aria-label={`Use ${path}`}
                        >
                          <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9' }}>
                            <Image src={url} alt="" fill style={{ objectFit: 'cover' }} />
                          </Box>
                          <Box sx={{ p: 1 }}>
                            <Typography variant="caption" noWrap title={path}>
                              {path}
                            </Typography>
                          </Box>
                        </Box>
                      </Grid>
                    );
                  })}
                </Grid>
              )}

              <Stack direction="row" spacing={1}>
                <Button variant="outlined" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                  Prev
                </Button>
                <Button variant="outlined" onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
                <Typography variant="caption" sx={{ alignSelf: 'center', ml: 1 }}>Page {page + 1}</Typography>
              </Stack>
            </Stack>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
