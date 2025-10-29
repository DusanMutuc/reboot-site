'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Typography,
  Checkbox,
  FormControlLabel,
  Alert,
  TextField,
  Breadcrumbs,
  Link as MLink,
  Skeleton,
  Tooltip,
} from '@mui/material';
import Image from 'next/image';
import CloseIcon from '@mui/icons-material/Close';
import Grid from '@mui/material/Grid';
import { supabase } from '@/lib/supabaseClient';

const BUCKET = 'course-heroes';

type StorageItem = {
  name: string; // relative name within current prefix (e.g. "uuid.webp" or "42")
  id?: string;
  updated_at?: string;
  metadata?: any; // files have metadata.mimetype; folders generally do not
};

function slugifyForFolder(title: string | null, id: number | null) {
  const base = (title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
  if (base && id != null) return `${base}-${id}`;
  if (base) return base;
  return id != null ? `course-${id}` : 'course-unknown';
}

/** Mirror landing page logic:
 *  - If already a full URL -> return as-is
 *  - Else treat as storage key in BUCKET and build public URL
 *  - Also strip any accidental leading slash
 */
function resolveStorageSrc(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().replace(/^\/+/, ''); // normalize
  if (/^https?:\/\//i.test(v)) return v;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(v);
  return data?.publicUrl ?? null;
}

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

  // New UX: search/sort/view
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'updated' | 'name'>('updated');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<string | null>(null);

  // Confirmation dialog state
  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    body?: string;
    onYes?: () => void;
  }>({ open: false, title: '' });

  function askConfirm(title: string, body: string, onYes: () => void) {
    setConfirm({ open: true, title, body, onYes });
  }

  // Course title + folder slug
  const [courseTitle, setCourseTitle] = useState<string | null>(null);
  const [courseFolder, setCourseFolder] = useState<string>(''); // e.g., "mindset-bootcamp-42"

  // Drill-down prefix (e.g. "", "mindset-bootcamp-42/", "mindset-bootcamp-42/sub/")
  const [prefix, setPrefix] = useState<string>('');

  // Fallback: fetch hero_image if parent didn't pass a currentPath
  const [fetchedPath, setFetchedPath] = useState<string | null>(null);

  // The path the UI should actually use for preview/actions
  const effectivePath = useMemo(
    () => (currentPath && currentPath.trim() ? currentPath : fetchedPath),
    [currentPath, fetchedPath]
  );

  // Fetch course title, compute folder
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!courseId) {
        setCourseTitle(null);
        setCourseFolder('');
        return;
      }
      const { data, error } = await supabase
        .from('content_nodes')
        .select('title')
        .eq('id', courseId)
        .single();

      const title = error ? null : (data?.title ?? null);
      if (cancelled) return;

      setCourseTitle(title);
      setCourseFolder(slugifyForFolder(title, courseId));
    }
    if (open) void run();
    return () => {
      cancelled = true;
    };
  }, [open, courseId]);

  // If no currentPath provided, fetch hero_image for preview when dialog opens
  useEffect(() => {
    let cancelled = false;

    async function getExistingHero() {
      if (!open || !courseId || (currentPath && currentPath.trim())) {
        setFetchedPath(null);
        return;
      }
      const { data, error } = await supabase
        .from('content_nodes')
        .select('hero_image')
        .eq('id', courseId)
        .single();

      if (cancelled) return;
      setFetchedPath(error ? null : (data?.hero_image ?? null));
    }

    void getExistingHero();
    return () => {
      cancelled = true;
    };
  }, [open, courseId, currentPath]);

  // Initialize prefix on open to the course's slugged folder
  useEffect(() => {
    if (open) {
      setPage(0);
      setTab((t) => t); // keep active tab
      setPrefix(courseFolder ? `${courseFolder}/` : '');
      setSelected(null);
      setQuery('');
      setSort('updated');
      setView('grid');
    }
  }, [open, courseFolder]);

  // Helpers
  const isFolder = (it: StorageItem) => !it?.metadata?.mimetype;
  const join = (base: string, name: string) => (base ? `${base.replace(/\/?$/, '/')}${name}` : name);

  // Listing
  const load = useCallback(async () => {
    if (tab !== 'reuse') return;
    setItems(null);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: 24, offset: page * 24, sortBy: { column: 'updated_at', order: 'desc' } });
    if (error) {
      setItems([]);
      return;
    }
    const raw = (data as StorageItem[]) ?? [];
    // Hide dotfiles/placeholder
    const visible = raw.filter(
      (it) => !it.name.startsWith('.') && it.name !== '.emptyFolderPlaceholder'
    );
    setItems(visible);
  }, [prefix, page, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  // Public URL builder for listed items (files grid)
  const toUrl = useCallback(
    (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
    []
  );

  // Upload (supports drag & drop via synthetic event)
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    (e.currentTarget as HTMLInputElement).value = '';
    if (!file || !courseId) return;
    if (!file.type.startsWith('image/')) return alert('Please choose an image file.');
    if (file.size > 15 * 1024 * 1024) return alert('Max file size is 15MB.');
    if (!courseFolder) return alert('Missing course folder.');

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const key = `${courseFolder}/${crypto.randomUUID()}.${ext}`;

    const doUpload = async () => {
      setBusy(true);
      try {
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(key, file, { upsert: true, cacheControl: '3600', contentType: file.type });
        if (upErr) throw upErr;

        if (deletingOld && effectivePath && effectivePath !== key && !/^https?:\/\//i.test(effectivePath)) {
          // only try to delete if effectivePath is a storage key, not an external URL
          await supabase.storage.from(BUCKET).remove([effectivePath.replace(/^\/+/, '')]).catch(() => {});
        }
        onChangePath(key);
        setFetchedPath(null); // preview should now reflect the prop
        onClose();
      } catch (err: any) {
        alert(err?.message || 'Upload failed');
      } finally {
        setBusy(false);
      }
    };

    if (deletingOld && effectivePath && effectivePath !== key) {
      askConfirm('Replace image?', 'This will delete the previous image.', () => void doUpload());
    } else {
      await doUpload();
    }
  }

  // Drag & drop
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const evt = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
    await handleUpload(evt);
  }

  // Use / Clear
  async function handleUse(path: string) {
    const doUse = async () => {
      setBusy(true);
      try {
        if (
          deletingOld &&
          effectivePath &&
          effectivePath !== path &&
          !/^https?:\/\//i.test(effectivePath)
        ) {
          await supabase.storage.from(BUCKET).remove([effectivePath.replace(/^\/+/, '')]).catch(() => {});
        }
        onChangePath(path);
        setFetchedPath(null); // preview should now reflect the prop
        onClose();
      } finally {
        setBusy(false);
      }
    };

    if (deletingOld && effectivePath && effectivePath !== path) {
      askConfirm('Replace image?', 'This will delete the previous image.', () => void doUse());
    } else {
      await doUse();
    }
  }

  async function handleClear() {
    if (!effectivePath) return onChangePath(null);

    const looksLikeUrl = /^https?:\/\//i.test(effectivePath);
    const storageKey = looksLikeUrl ? null : effectivePath.replace(/^\/+/, '');

    askConfirm('Remove current image?', 'This will unlink the hero image from this course.', async () => {
      setBusy(true);
      try {
        if (deletingOld && storageKey) {
          await supabase.storage.from(BUCKET).remove([storageKey]).catch(() => {});
        }
        onChangePath(null);
        setFetchedPath(null);
        onClose();
      } finally {
        setBusy(false);
      }
    });
  }

  const headerPath = useMemo(() => prefix || '/', [prefix]);

  // Migration (old numeric -> slug)
  const [migrating, setMigrating] = useState(false);
  const [oldFolderExists, setOldFolderExists] = useState(false);
  const oldNumericFolder = courseId ? `${courseId}/` : '';

  useEffect(() => {
    let cancelled = false;
    async function checkOld() {
      if (!open || !courseId || !courseFolder) {
        setOldFolderExists(false);
        return;
      }
      if (`${courseId}/` === `${courseFolder}/`) {
        setOldFolderExists(false);
        return;
      }
      const { data, error } = await supabase.storage.from(BUCKET).list(oldNumericFolder, { limit: 1 });
      if (!cancelled) setOldFolderExists(!error && (data?.length ?? 0) > 0);
    }
    void checkOld();
    return () => {
      cancelled = true;
    };
  }, [open, courseId, courseFolder]);

  async function listAllUnder(pref: string) {
    const pageSize = 200;
    let offset = 0;
    const out: StorageItem[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(pref, { limit: pageSize, offset, sortBy: { column: 'updated_at', order: 'desc' } });
      if (error) break;
      if (!data || data.length === 0) break;
      out.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }
    return out;
  }

  async function migrateFromOldFolder({ removeOld = false }: { removeOld?: boolean } = {}) {
    if (!courseId || !courseFolder) return;
    setMigrating(true);
    try {
      const files = await listAllUnder(oldNumericFolder);
      for (const it of files) {
        if (!it?.metadata?.mimetype) continue; // skip subfolders
        const from = `${oldNumericFolder}${it.name}`;
        const to = `${courseFolder}/${it.name}`;
        const { data: stat, error: statErr } = await supabase.storage
          .from(BUCKET)
          .list(`${courseFolder}/`, { limit: 1, search: it.name });
        const exists = !statErr && (stat ?? []).some((s) => s.name === it.name);
        if (!exists) {
          await supabase.storage.from(BUCKET).copy(from, to);
        }
      }
      if (removeOld) {
        const pathsToDelete = files.filter((f) => f?.metadata?.mimetype).map((f) => `${oldNumericFolder}${f.name}`);
        if (pathsToDelete.length) await supabase.storage.from(BUCKET).remove(pathsToDelete);
      }
      setPrefix(`${courseFolder}/`);
      setPage(0);
      await load();
      setOldFolderExists(false);
      alert('Migration complete.');
    } catch (e: any) {
      alert(e?.message ?? 'Migration failed');
    } finally {
      setMigrating(false);
    }
  }

  // Breadcrumbs
  const crumbs = useMemo(() => {
    const p = prefix.replace(/\/$/, '');
    if (!p) return [];
    return p.split('/');
  }, [prefix]);

  // Filter + sort for display
  const filtered = useMemo(() => {
    let arr = (items ?? []).filter(
      (it) =>
        !it.name.startsWith('.') &&
        it.name !== '.emptyFolderPlaceholder' &&
        (query ? it.name.toLowerCase().includes(query.toLowerCase()) : true)
    );
    // folders first
    arr.sort((a, b) => {
      const af = isFolder(a),
        bf = isFolder(b);
      if (af !== bf) return af ? -1 : 1;
      if (sort === 'name') return a.name.localeCompare(b.name);
      // "updated" order already approximated by list() result; preserve it
      return 0;
    });
    return arr;
  }, [items, query, sort]);

  // Upload area wrapper (drag & drop)
  const UploadZone: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Stack
      onDragOver={onDragOver}
      onDrop={onDrop}
      sx={{
        border: '2px dashed',
        borderColor: 'divider',
        borderRadius: 2,
        p: 2,
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 2,
      }}
    >
      <Typography variant="body2">Drag & drop an image here, or click “Choose image”.</Typography>
      {children}
    </Stack>
  );

  // New folder
  async function promptNewFolder() {
    const name = prompt('Folder name (letters, numbers, dashes):', '');
    if (!name) return;
    const safe = name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/--+/g, '-');
    if (!safe) return alert('Invalid folder name.');
    const key = join(prefix, safe) + '/.keep';
    setBusy(true);
    try {
      const { error } = await supabase
        .storage
        .from(BUCKET)
        .upload(key, new Blob([]), { upsert: true, contentType: 'text/plain' });
      if (error) throw error;
      await load();
    } catch (e: any) {
      alert(e.message || 'Failed to create folder');
    } finally {
      setBusy(false);
    }
  }

  // Skeleton loader
  const renderGridSkeleton = (
    <Grid container spacing={2}>
      {Array.from({ length: 6 }).map((_, i) => (
        <Grid key={`sk-${i}`} size={{ xs: 6, md: 4 }}>
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
            <Skeleton variant="rectangular" sx={{ width: '100%', aspectRatio: '16 / 9' }} />
            <Box sx={{ p: 1 }}>
              <Skeleton width="70%" />
            </Box>
          </Box>
        </Grid>
      ))}
    </Grid>
  );

  // List view
  const renderList = (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      {filtered.map((it) => {
        const name = it.name;
        const isDir = isFolder(it);
        const path = join(prefix, name);
        const active = selected === path;
        return (
          <Box
            key={path}
            onClick={() => {
              setSelected(path);
            }}
            onDoubleClick={() => {
              if (isDir) {
                setPrefix(join(prefix, name) + '/');
                setPage(0);
              } else {
                void handleUse(path);
              }
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 1,
              cursor: 'pointer',
              bgcolor: active ? 'action.selected' : 'transparent',
              '&:hover': { bgcolor: 'action.hover' },
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography sx={{ width: 24, textAlign: 'center' }}>{isDir ? '📁' : '🖼️'}</Typography>
            <Typography variant="body2" sx={{ flex: 1 }} noWrap title={name}>
              {name}
              {isDir ? '/' : ''}
            </Typography>
            {!isDir && (
              <Button
                size="small"
                variant="outlined"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleUse(path);
                }}
              >
                Use
              </Button>
            )}
          </Box>
        );
      })}
    </Box>
  );

  // Grid view
  const renderGrid = (
    <Grid container spacing={2}>
      {filtered.map((it) => {
        const name = it.name;
        const isDir = isFolder(it);
        const path = join(prefix, name);
        const active = selected === path;

        if (isDir) {
          return (
            <Grid key={`dir:${path}`} size={{ xs: 6, md: 4 }}>
              <Box
                onClick={() => {
                  setSelected(path);
                }}
                onDoubleClick={() => {
                  setPrefix(join(prefix, name) + '/');
                  setPage(0);
                }}
                sx={{
                  border: '1px dashed',
                  borderColor: active ? 'primary.main' : 'divider',
                  borderRadius: 2,
                  p: 2,
                  cursor: 'pointer',
                  height: '100%',
                  display: 'grid',
                  alignContent: 'center',
                  gap: 0.5,
                  transition: 'border-color 120ms, box-shadow 120ms',
                  '&:hover': { boxShadow: 2 },
                }}
                aria-label={`Open folder ${name}`}
              >
                <Typography fontWeight={700}>📁 {name}/</Typography>
                <Typography variant="caption" color="text.secondary">
                  Open folder
                </Typography>
              </Box>
            </Grid>
          );
        }

        const filePath = path;
        const url = toUrl(filePath);

        return (
          <Grid key={`file:${filePath}`} size={{ xs: 6, md: 4 }}>
            <Box
              onClick={() => setSelected(filePath)}
              onDoubleClick={() => void handleUse(filePath)}
              sx={{
                border: '1px solid',
                borderColor: active ? 'primary.main' : 'divider',
                borderRadius: 2,
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'border-color 120ms, box-shadow 120ms',
                '&:hover': { boxShadow: 2 },
              }}
              aria-label={`Use ${filePath}`}
            >
              <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9' }}>
                <Image src={url} alt="" fill style={{ objectFit: 'cover' }} />
              </Box>
              <Box sx={{ p: 1 }}>
                <Typography variant="caption" noWrap title={filePath}>
                  {filePath}
                </Typography>
              </Box>
            </Box>
          </Grid>
        );
      })}
    </Grid>
  );

  // CURRENT IMAGE: use same resolver as landing page, based on effectivePath
  const currentPreviewUrl = useMemo(() => resolveStorageSrc(effectivePath), [effectivePath]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: {
          borderRadius: 3,
          overflow: 'hidden',
        },
      }}
    >
      <DialogTitle sx={{ position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.paper' }}>
        Set hero image {courseId ? `(${courseTitle ? courseTitle : `course #${courseId}`})` : ''}
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{
          minHeight: 560,
          maxHeight: '72vh',
          overflow: 'auto',
          display: 'grid',
          gridTemplateRows: 'auto auto auto auto 1fr auto', // tabs, alert, toolbar, CURRENT IMAGE, content, pager
          gap: 2,
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          aria-label="Upload or reuse"
          sx={{ position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.paper' }}
        >
          <Tab value="upload" label="Upload" />
          <Tab value="reuse" label="Browse" />
        </Tabs>

        {/* Migration helper */}
        {tab === 'reuse' && oldFolderExists && (
          <Alert
            severity="info"
            action={
              <Stack direction="row" spacing={1}>
                <Button size="small" disabled={migrating} onClick={() => migrateFromOldFolder({ removeOld: false })}>
                  Copy to “{courseFolder}/”
                </Button>
                <Button
                  size="small"
                  color="warning"
                  disabled={migrating}
                  onClick={() => migrateFromOldFolder({ removeOld: true })}
                >
                  Move (copy & delete)
                </Button>
              </Stack>
            }
          >
            We found files in the old folder <b>“{oldNumericFolder}”</b>. You can copy or move them into the new folder{' '}
            <b>“{courseFolder}/”</b>.
          </Alert>
        )}

        {/* Toolbar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <FormControlLabel
            control={<Checkbox checked={deletingOld} onChange={(e) => setDeletingOld(e.target.checked)} />}
            label="Delete previous file on replace"
          />

          {tab === 'reuse' ? (
            <>
              <TextField
                size="small"
                placeholder="Search in this folder"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                sx={{ width: { xs: '100%', sm: 260 } }}
              />
              <TextField
                select
                size="small"
                label="Sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                SelectProps={{ native: true }}
              >
                <option value="updated">Recently updated</option>
                <option value="name">Name (A–Z)</option>
              </TextField>
              <Button size="small" variant={view === 'grid' ? 'contained' : 'outlined'} onClick={() => setView('grid')}>
                Grid
              </Button>
              <Button size="small" variant={view === 'list' ? 'contained' : 'outlined'} onClick={() => setView('list')}>
                List
              </Button>
              <Box sx={{ flex: 1 }} />
              <Button size="small" onClick={() => void promptNewFolder()} disabled={busy}>
                New folder
              </Button>
            </>
          ) : (
            <Box sx={{ flex: 1 }} />
          )}
        </Box>

        {/* CURRENT IMAGE PREVIEW */}
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            p: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            bgcolor: 'background.default',
          }}
        >
          <Box sx={{ width: 180, minWidth: 180 }}>
            <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', bgcolor: 'action.hover', borderRadius: 1, overflow: 'hidden' }}>
              {currentPreviewUrl ? (
                <Image src={currentPreviewUrl} alt="Current hero" fill style={{ objectFit: 'cover' }} />
              ) : (
                <Box sx={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary">No image</Typography>
                </Box>
              )}
            </Box>
          </Box>
          <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle2">Current image</Typography>
            <Tooltip title={effectivePath || 'None set'}>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: '100%' }}>
                {effectivePath || '—'}
              </Typography>
            </Tooltip>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
              <Button
                size="small"
                disabled={!currentPreviewUrl}
                onClick={() => { if (currentPreviewUrl) window.open(currentPreviewUrl, '_blank', 'noopener,noreferrer'); }}
              >
                Open
              </Button>
              <Button
                size="small"
                color="warning"
                disabled={!effectivePath || busy}
                onClick={() => void handleClear()}
              >
                Remove
              </Button>
            </Stack>
          </Stack>
        </Box>

        {/* Content */}
        {tab === 'upload' ? (
          <UploadZone>
            <Stack direction="row" alignItems="center" spacing={2}>
              <Button variant="contained" component="label" disabled={busy}>
                {busy ? 'Uploading…' : 'Choose image'}
                <input type="file" accept="image/*" hidden onChange={handleUpload} />
              </Button>
              {effectivePath ? (
                <Button color="warning" onClick={() => void handleClear()} disabled={busy}>
                  Remove image
                </Button>
              ) : null}
            </Stack>
          </UploadZone>
        ) : (
          <Stack spacing={2}>
            {/* Breadcrumbs */}
            <Breadcrumbs aria-label="breadcrumb" sx={{ fontSize: 13 }}>
              <MLink component="button" onClick={() => { setPrefix(''); setPage(0); }} disabled={!prefix}>
                Root
              </MLink>
              {crumbs.map((c, i) => {
                const to = crumbs.slice(0, i + 1).join('/') + '/';
                const isLast = i === crumbs.length - 1;
                return isLast ? (
                  <Typography key={to} color="text.primary">
                    {c}
                  </Typography>
                ) : (
                  <MLink key={to} component="button" onClick={() => { setPrefix(to); setPage(0); }}>
                    {c}
                  </MLink>
                );
              })}
              <Typography variant="caption" color="text.secondary">
                {headerPath}
              </Typography>
            </Breadcrumbs>

            {/* Items */}
            {items === null
              ? renderGridSkeleton
              : filtered.length === 0
              ? (
                <Box sx={{ textAlign: 'center', color: 'text.secondary', py: 6 }}>
                  <Typography variant="body2">This folder is empty.</Typography>
                  <Typography variant="caption">Upload an image or create a subfolder.</Typography>
                </Box>
                )
              : view === 'grid'
              ? renderGrid
              : renderList}
          </Stack>
        )}

        {/* Pager */}
        {tab === 'reuse' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
            <Button variant="outlined" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || busy}>
              Prev
            </Button>
            <Button variant="outlined" onClick={() => setPage((p) => p + 1)} disabled={busy}>
              Next
            </Button>
            <Typography variant="caption" sx={{ ml: 1 }}>
              Page {page + 1}
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={busy || migrating}>
          Close
        </Button>
      </DialogActions>

      {/* Confirmation dialog */}
      <Dialog open={confirm.open} onClose={() => setConfirm((c) => ({ ...c, open: false }))}>
        <DialogTitle>{confirm.title}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">{confirm.body}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm((c) => ({ ...c, open: false }))}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              const f = confirm.onYes;
              setConfirm((c) => ({ ...c, open: false }));
              f?.();
            }}
          >
            Yes, continue
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
