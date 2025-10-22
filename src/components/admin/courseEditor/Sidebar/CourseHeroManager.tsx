'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  List,
  ListItemButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';

import { supabase } from '@/lib/supabaseClient';

const BUCKET = 'course-heroes';
const PAGE_SIZE = 10;

export type CourseHeroManagerProps = {
  courseId: number;
  currentPath?: string | null;
  onChanged?: (newPath: string) => void;
};

type StorageFile = {
  name: string;
  id: string | null;
  updated_at: string;
  created_at: string;
  last_accessed_at: string | null;
  metadata: {
    size: number;
  } | null;
};

type ListedFile = StorageFile & { fullPath: string };

function formatBytes(size: number | null | undefined) {
  if (!size || Number.isNaN(size)) return 'Unknown size';
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function normalizePrefix(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/^\/+/, '').replace(/\/+$/, '');
}

function getPublicUrl(path: string) {
  if (!path) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export default function CourseHeroManager({ courseId, currentPath, onChanged }: CourseHeroManagerProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'reuse'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [selectedPath, setSelectedPath] = useState<string | null>(currentPath && currentPath.trim() ? currentPath : null);
  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(null);

  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [prefixInput, setPrefixInput] = useState(() => String(courseId));
  const [listPrefix, setListPrefix] = useState(() => normalizePrefix(String(courseId)));

  const [reuseFiles, setReuseFiles] = useState<ListedFile[]>([]);
  const [reusePage, setReusePage] = useState(0);
  const [reuseLoading, setReuseLoading] = useState(false);
  const [reuseError, setReuseError] = useState<string | null>(null);
  const [reuseHasNext, setReuseHasNext] = useState(false);
  const [reuseSelecting, setReuseSelecting] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (currentPath && currentPath.trim()) {
      setSelectedPath(currentPath);
    } else {
      setSelectedPath(null);
    }
  }, [currentPath]);

  const previewUrl = useMemo(() => {
    if (!selectedPath) return null;
    return getPublicUrl(selectedPath);
  }, [selectedPath]);

  const loadPage = useCallback(async (page: number, prefix: string) => {
    setReuseLoading(true);
    setReuseError(null);
    const offset = page * PAGE_SIZE;
    const normalized = normalizePrefix(prefix);
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(normalized || undefined, {
          limit: PAGE_SIZE,
          offset,
          sortBy: { column: 'updated_at', order: 'desc' },
        });
      if (error) {
        throw new Error(error.message);
      }
      const files = (data ?? [])
        .filter((item): item is StorageFile => !!item && item.metadata != null)
        .map((item) => ({
          ...item,
          fullPath: normalized ? `${normalized}/${item.name}` : item.name,
        }));
      setReuseFiles(files);
      setReuseHasNext((data ?? []).length === PAGE_SIZE);
    } catch (error) {
      setReuseError(error instanceof Error ? error.message : 'Failed to load storage objects');
      setReuseFiles([]);
      setReuseHasNext(false);
    } finally {
      setReuseLoading(false);
    }
  }, []);

  useEffect(() => {
    setReusePage(0);
  }, [listPrefix]);

  useEffect(() => {
    void loadPage(reusePage, listPrefix);
  }, [loadPage, reusePage, listPrefix, refreshToken]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    setUploadSuccess(null);
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setUploadError('Please choose an image file.');
      setSelectedFile(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File must be 5MB or smaller.');
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError('Select an image to upload.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const extensionFromName = selectedFile.name.includes('.')
        ? selectedFile.name.split('.').pop()?.toLowerCase()
        : undefined;
      const typeExt = selectedFile.type.split('/').pop();
      const extension = extensionFromName || typeExt || 'webp';
      const uuid =
        typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto
          ? globalThis.crypto.randomUUID()
          : Math.random().toString(36).slice(2, 12);
      const key = `${courseId}/${uuid}.${extension}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(key, selectedFile, {
        cacheControl: '3600',
        upsert: true,
        contentType: selectedFile.type,
      });
      if (uploadError) {
        throw new Error(uploadError.message);
      }
      const { error: updateError } = await supabase
        .from('content_nodes')
        .update({ hero_image: key })
        .eq('id', courseId);
      if (updateError) {
        throw new Error(updateError.message);
      }
      if (selectedPath && selectedPath !== key) {
        setPendingDeletePath(selectedPath);
      }
      setSelectedPath(key);
      onChanged?.(key);
      setUploadSuccess('Hero image updated.');
      setSelectedFile(null);
      setFileKey((prev) => prev + 1);
      setRefreshToken((prev) => prev + 1);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleReuseSelect = async (file: ListedFile) => {
    if (selectedPath === file.fullPath) {
      return;
    }
    setReuseSelecting(true);
    setReuseError(null);
    try {
      const { error } = await supabase
        .from('content_nodes')
        .update({ hero_image: file.fullPath })
        .eq('id', courseId);
      if (error) {
        throw new Error(error.message);
      }
      if (selectedPath && selectedPath !== file.fullPath) {
        setPendingDeletePath(selectedPath);
      }
      setSelectedPath(file.fullPath);
      onChanged?.(file.fullPath);
    } catch (error) {
      setReuseError(error instanceof Error ? error.message : 'Failed to update hero image');
    } finally {
      setReuseSelecting(false);
    }
  };

  const handleRemoveHeroImage = async () => {
    if (!selectedPath) return;
    setRemoveLoading(true);
    setRemoveError(null);
    try {
      const { error } = await supabase.from('content_nodes').update({ hero_image: null }).eq('id', courseId);
      if (error) {
        throw new Error(error.message);
      }
      setPendingDeletePath(selectedPath);
      setSelectedPath(null);
      onChanged?.('');
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : 'Failed to remove hero image');
    } finally {
      setRemoveLoading(false);
    }
  };

  const handleDeleteOldImage = async () => {
    if (!pendingDeletePath) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const { error } = await supabase.storage.from(BUCKET).remove([pendingDeletePath]);
      if (error) {
        throw new Error(error.message);
      }
      setDeleteError(null);
      setPendingDeletePath(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete previous image');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleApplyPrefix = () => {
    const normalized = normalizePrefix(prefixInput);
    setListPrefix(normalized);
    setRefreshToken((prev) => prev + 1);
  };

  const currentPrefix = listPrefix;

  return (
    <Stack spacing={2}>
      <Stack spacing={1}>
        <Typography variant="subtitle2">Hero image</Typography>
        {selectedPath ? (
          <Stack spacing={1.5}>
            {previewUrl ? (
              <Box sx={{ position: 'relative', width: '100%', maxWidth: 320, aspectRatio: '16 / 9', borderRadius: 1, overflow: 'hidden' }}>
                <Image src={previewUrl} alt="Course hero image preview" fill style={{ objectFit: 'cover' }} />
              </Box>
            ) : null}
            <Typography variant="body2" color="text.secondary">
              Storage path: {selectedPath}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={handleRemoveHeroImage} disabled={removeLoading}>
                {removeLoading ? 'Removing…' : 'Remove image'}
              </Button>
            </Stack>
            {removeError ? <Alert severity="error">{removeError}</Alert> : null}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No hero image selected.
          </Typography>
        )}
      </Stack>

      {pendingDeletePath ? (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={handleDeleteOldImage} disabled={deleteLoading}>
              {deleteLoading ? 'Deleting…' : 'Delete old image'}
            </Button>
          }
        >
          Previous image stored at <strong>{pendingDeletePath}</strong> is no longer used.
        </Alert>
      ) : null}
      {deleteError ? <Alert severity="error">{deleteError}</Alert> : null}

      <Box>
        <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} aria-label="Hero image management">
          <Tab label="Upload" value="upload" />
          <Tab label="Reuse" value="reuse" />
        </Tabs>
        <Divider sx={{ mb: 2 }} />
        {activeTab === 'upload' ? (
          <Stack spacing={2}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Button variant="outlined" component="label">
                Choose image
                <input
                  key={fileKey}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleFileChange}
                />
              </Button>
              {selectedFile ? (
                <Stack spacing={0.5}>
                  <Typography variant="body2">{selectedFile.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatBytes(selectedFile.size)}
                  </Typography>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Select an image (max 5MB).
                </Typography>
              )}
            </Stack>
            {uploadError ? <Alert severity="error">{uploadError}</Alert> : null}
            {uploadSuccess ? <Alert severity="success">{uploadSuccess}</Alert> : null}
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleUpload} disabled={uploading}>
                {uploading ? 'Uploading…' : 'Upload & set hero'}
              </Button>
              <Button variant="outlined" onClick={() => setSelectedFile(null)} disabled={uploading || !selectedFile}>
                Clear selection
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <TextField
                label="Folder prefix"
                value={prefixInput}
                onChange={(event) => setPrefixInput(event.target.value)}
                helperText="List files within this folder (omit leading slash)."
              />
              <Button variant="outlined" onClick={handleApplyPrefix} disabled={reuseLoading}>
                Refresh
              </Button>
            </Stack>
            {reuseLoading ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={20} />
                <Typography variant="body2">Loading images…</Typography>
              </Stack>
            ) : null}
            {reuseError ? <Alert severity="error">{reuseError}</Alert> : null}
            {!reuseLoading && reuseFiles.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No images found in this folder.
              </Typography>
            ) : null}
            {reuseFiles.length > 0 ? (
              <List dense sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 320, overflow: 'auto' }}>
                {reuseFiles.map((file) => {
                  const fileUrl = getPublicUrl(file.fullPath);
                  const isActive = selectedPath === file.fullPath;
                  return (
                    <ListItemButton
                      key={file.id ?? file.fullPath}
                      onClick={() => handleReuseSelect(file)}
                      disabled={reuseSelecting}
                      selected={isActive}
                    >
                      <Stack direction="row" spacing={2} alignItems="center" sx={{ width: '100%' }}>
                        <Box sx={{ position: 'relative', width: 96, height: 54, borderRadius: 1, overflow: 'hidden', bgcolor: 'grey.100' }}>
                          {fileUrl ? (
                            <Image src={fileUrl} alt={file.name} fill style={{ objectFit: 'cover' }} />
                          ) : null}
                        </Box>
                        <Stack spacing={0.5} sx={{ flexGrow: 1 }}>
                          <Typography variant="body2" noWrap>
                            {file.fullPath}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Updated {new Date(file.updated_at).toLocaleString()} · {formatBytes(file.metadata?.size)}
                          </Typography>
                        </Stack>
                      </Stack>
                    </ListItemButton>
                  );
                })}
              </List>
            ) : null}
            <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
              <Button
                variant="outlined"
                onClick={() => setReusePage((prev) => Math.max(prev - 1, 0))}
                disabled={reusePage === 0 || reuseLoading}
              >
                Previous
              </Button>
              <Typography variant="body2" color="text.secondary">
                Page {reusePage + 1}
              </Typography>
              <Button
                variant="outlined"
                onClick={() => setReusePage((prev) => prev + 1)}
                disabled={!reuseHasNext || reuseLoading}
              >
                Next
              </Button>
            </Stack>
            {currentPrefix ? (
              <Typography variant="caption" color="text.secondary">
                Showing files from <strong>{currentPrefix}</strong>
              </Typography>
            ) : null}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
