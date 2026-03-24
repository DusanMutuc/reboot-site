// src/components/admin/meetings/MeetingAttendanceDialog.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Checkbox,
  CircularProgress,
  Alert,
  Stack,
  FormControl,
  Autocomplete,
  InputLabel,
  Select,
  TextField,
  MenuItem,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  Divider,
  Chip,
  Collapse,
  List,
  ListItem,
  ListItemText,
  Tabs,
  Tab,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';


import {
  getMeetingAttendance,
  upsertMeetingAttendance,
  removeMeetingAttendance,
} from '@/lib/meetings';
import type { MeetingAttendanceWithProfile } from '@/types/meetings';

type Props = {
  open: boolean;
  meetingId: number | null;
  onClose: () => void;
};

type SimpleUser = {
  id: string;
  name: string;
  email: string;
};

type Source = 'members' | 'coaches';

/** API helpers */
type ApiListResponse<T> = { items: T[] };

function isApiListResponse<T>(v: unknown): v is ApiListResponse<T> {
  return typeof v === 'object' && v !== null && Array.isArray((v as ApiListResponse<T>).items);
}

function toSimpleUser(u: unknown): SimpleUser | null {
  if (typeof u !== 'object' || u === null) return null;
  const obj = u as Record<string, unknown>;
  const id = obj.id;
  const name = obj.name;
  const email = obj.email;
  if (typeof id !== 'string' && typeof id !== 'number') return null;
  return {
    id: String(id),
    name: typeof name === 'string' ? name : '',
    email: typeof email === 'string' ? email : '',
  };
}

/** ========= CSV import helpers ========= */

type ImportSummary = {
  totalNames: number;
  matchedUserIds: string[];
  addedUserIds: string[];
  ambiguous: Array<{ raw: string; candidates: SimpleUser[] }>;
  unmatched: string[];
};

function normalizeText(s: string) {
  // trim, lowercase, remove diacritics, remove some punctuation, collapse whitespace
  return (s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,()"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function candidateKeysFromRawName(raw: string): string[] {
  const n = normalizeText(raw);
  if (!n) return [];

  // handle "Last, First"
  const commaSplit = n.split(',').map((x) => x.trim()).filter(Boolean);
  if (commaSplit.length === 2) {
    const [last, first] = commaSplit;
    const firstLast = `${first} ${last}`.trim();
    const lastFirst = `${last} ${first}`.trim();
    return Array.from(new Set([n, firstLast, lastFirst].filter(Boolean)));
  }

  const tokens = n.split(' ').filter(Boolean);
  if (tokens.length === 1) return [n];

  const first = tokens[0];
  const last = tokens[tokens.length - 1];

  // - full normalized
  // - first + last (handles middle names)
  // - last + first (handles reversed)
  return Array.from(new Set([n, `${first} ${last}`, `${last} ${first}`].filter(Boolean)));
}

function buildNameIndex(users: SimpleUser[]) {
  const byName = new Map<string, SimpleUser[]>();

  for (const u of users) {
    const keys: string[] = [];

    // from u.name (which is "First Last" typically)
    const n = normalizeText(u.name);
    if (n) keys.push(n);

    // also try first+last token if name contains middle names
    const tokens = n.split(' ').filter(Boolean);
    if (tokens.length >= 2) {
      const first = tokens[0];
      const last = tokens[tokens.length - 1];
      keys.push(`${first} ${last}`);
      keys.push(`${last} ${first}`);
    }

    // optionally: index email local-part? (not requested, but sometimes zoom name == email)
    // leaving out for now to keep behavior predictable

    const unique = Array.from(new Set(keys.filter(Boolean)));
    for (const k of unique) {
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k)!.push(u);
    }
  }

  return { byName };
}

function detectNameColumn(headers: string[]) {
  const normalized = headers.map((h) => ({ raw: h, n: normalizeText(h) }));

  // Common Zoom export / variants across locales/versions
  const candidates = [
    'name',
    'full name',
    'participant',
    'participant name',
    'user name',
    'username',
    'display name',
    'attendee',
    'attendee name',
  ].map(normalizeText);

  // exact-ish match first
  for (const c of candidates) {
    const found = normalized.find((h) => h.n === c);
    if (found) return found.raw;
  }

  // contains match (e.g. "Participant Name (Original Name)")
  for (const c of candidates) {
    const found = normalized.find((h) => h.n.includes(c));
    if (found) return found.raw;
  }

  // fallback: pick the first header that includes "name"
  const nameish = normalized.find((h) => h.n.includes('name'));
  if (nameish) return nameish.raw;

  return null;
}

async function parseCsvNames(file: File): Promise<{ names: string[]; detectedColumn: string | null }> {
  const text = await file.text();

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const rows = (parsed.data ?? []).filter(Boolean);
  const headers = (parsed.meta.fields ?? []).filter(Boolean);

  if (!rows.length || !headers.length) {
    return { names: [], detectedColumn: null };
  }

  const nameCol = detectNameColumn(headers);

  if (!nameCol) {
    return { names: [], detectedColumn: null };
  }

  const names = rows
    .map((r) => (r?.[nameCol] ?? '').toString())
    .map((s) => s.trim())
    .filter(Boolean);

  return { names, detectedColumn: nameCol };
}

/** ========= component ========= */

export function MeetingAttendanceDialog({ open, meetingId, onClose }: Props) {
  const [rows, setRows] = useState<MeetingAttendanceWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Members (users) list
  const [allUsers, setAllUsers] = useState<SimpleUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Coaches list
  const [allCoaches, setAllCoaches] = useState<SimpleUser[]>([]);
  const [loadingCoaches, setLoadingCoaches] = useState(false);

  // Which list we are adding from right now
  const [source, setSource] = useState<Source>('members');

  // Selected id from the active (source) list
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [quickSelectedUserId, setQuickSelectedUserId] = useState<string | null>(null);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [userToRemove, setUserToRemove] =
    useState<MeetingAttendanceWithProfile | null>(null);

  /** CSV import state */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null); // e.g. detected column

  
  useEffect(() => {
    if (!open || !meetingId) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getMeetingAttendance(meetingId);
        setRows(data);
      } catch (err: unknown) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load attendance');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [open, meetingId]);

  // Load Members (users)
  useEffect(() => {
    if (!open) return;
    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const res = await fetch('/api/admin/list-users');
        if (!res.ok) throw new Error('Failed to load users for attendance');
        const json: unknown = await res.json();
        const items = isApiListResponse<unknown>(json) ? json.items : [];
        const mapped: SimpleUser[] = items
          .map(toSimpleUser)
          .filter((v): v is SimpleUser => v !== null);
        setAllUsers(mapped);
      } catch (err: unknown) {
        console.error(err);
        setError((prev) => prev ?? (err instanceof Error ? err.message : 'Failed to load users'));
      } finally {
        setLoadingUsers(false);
      }
    };
    void loadUsers();
  }, [open]);

  // Load Coaches
  useEffect(() => {
    if (!open) return;
    const loadCoaches = async () => {
      setLoadingCoaches(true);
      try {
        const res = await fetch('/api/admin/list-coaches');
        if (!res.ok) throw new Error('Failed to load coaches for attendance');
        const json: unknown = await res.json();
        const items = isApiListResponse<unknown>(json) ? json.items : [];
        const mapped: SimpleUser[] = items
          .map(toSimpleUser)
          .filter((v): v is SimpleUser => v !== null);
        setAllCoaches(mapped);
      } catch (err: unknown) {
        console.error(err);
        setError((prev) => prev ?? (err instanceof Error ? err.message : 'Failed to load coaches'));
      } finally {
        setLoadingCoaches(false);
      }
    };
    void loadCoaches();
  }, [open]);

  // Fast lookup across both lists
  const lookup = useMemo(() => {
    const map = new Map<string, SimpleUser>();
    for (const u of allUsers) map.set(u.id, u);
    for (const c of allCoaches) map.set(c.id, c);
    return map;
  }, [allUsers, allCoaches]);
const [importDetailsOpen, setImportDetailsOpen] = useState(false);
const [importTab, setImportTab] = useState<'summary' | 'details'>('summary');

const addedUsers = useMemo(() => {
  if (!importSummary) return [];
  return importSummary.addedUserIds
    .map((id) => lookup.get(id))
    .filter((u): u is SimpleUser => Boolean(u));
}, [importSummary, lookup]);

const unmatchedList = useMemo(() => {
  if (!importSummary) return [];
  // keep original order but de-dupe exact duplicates
  return Array.from(new Set(importSummary.unmatched));
}, [importSummary]);

  const sortedMembers = useMemo(() => {
    const getFirstName = (u: SimpleUser) => {
      const name = (u.name || '').trim();
      if (!name) return '';
      return name.split(/\s+/)[0]?.toLowerCase() ?? '';
    };

    return [...allUsers].sort((a, b) => {
      const fa = getFirstName(a);
      const fb = getFirstName(b);
      if (fa && fb && fa !== fb) return fa.localeCompare(fb);
      // fallback to email if first names are missing/identical
      return (a.email || '').localeCompare(b.email || '');
    });
  }, [allUsers]);

  const sortedCoaches = useMemo(() => {
    const getFirstName = (u: SimpleUser) => {
      const name = (u.name || '').trim();
      if (!name) return '';
      return name.split(/\s+/)[0]?.toLowerCase() ?? '';
    };

    return [...allCoaches].sort((a, b) => {
      const fa = getFirstName(a);
      const fb = getFirstName(b);
      if (fa && fb && fa !== fb) return fa.localeCompare(fb);
      return (a.email || '').localeCompare(b.email || '');
    });
  }, [allCoaches]);

  // Which pool are we currently choosing from?
  const activePool: SimpleUser[] = source === 'members' ? sortedMembers : sortedCoaches;

  // Don't suggest anyone already on the attendance list
  const availableOptions = useMemo(() => {
    const existing = new Set(rows.map((r) => r.user_id));
    return activePool.filter((p) => !existing.has(p.id));
  }, [activePool, rows]);

  const handleToggle = async (userId: string, currentValue: boolean) => {
    if (!meetingId) return;
    const newValue = !currentValue;
    setSavingId(userId);

    // optimistic
    setRows((prev) =>
      prev.map((r) => (r.user_id === userId ? { ...r, attended: newValue } : r)),
    );

    try {
      await upsertMeetingAttendance({ meetingId, userId, attended: newValue });
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to update attendance');
      // revert
      setRows((prev) =>
        prev.map((r) => (r.user_id === userId ? { ...r, attended: currentValue } : r)),
      );
    } finally {
      setSavingId(null);
    }
  };

  const handleAddAttendee = async () => {
    if (!meetingId || !selectedUserId) return;
    setAdding(true);
    setError(null);
    try {
      await upsertMeetingAttendance({
        meetingId,
        userId: selectedUserId,
        attended: false,
      });

      const user = lookup.get(selectedUserId);
      const nameParts = (user?.name ?? '').trim().split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] ?? '';
      const lastName = nameParts.slice(1).join(' ') || '';

      setRows((prev) => [
        ...prev,
        {
          meeting_id: meetingId,
          user_id: selectedUserId,
          attended: false,
          profiles: { first_name: firstName || null, last_name: lastName || null },
        } as MeetingAttendanceWithProfile,
      ]);

      setSelectedUserId('');
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to add attendee');
    } finally {
      setAdding(false);
    }
  };

  const openRemoveDialog = (row: MeetingAttendanceWithProfile) => {
    setUserToRemove(row);
    setRemoveDialogOpen(true);
  };

  const closeRemoveDialog = () => {
    if (removingId) return;
    setRemoveDialogOpen(false);
    setUserToRemove(null);
  };

  const handleConfirmRemove = async () => {
    if (!meetingId || !userToRemove) return;
    const userId = userToRemove.user_id;
    setRemovingId(userId);
    setError(null);
    try {
      await removeMeetingAttendance(meetingId, userId);
      setRows((prev) => prev.filter((r) => r.user_id !== userId));
      setRemoveDialogOpen(false);
      setUserToRemove(null);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to remove attendee');
    } finally {
      setRemovingId(null);
    }
  };

  const handleClose = () => {
    if (savingId || adding || removingId || importing) return;
    setError(null);
    setImportSummary(null);
    setImportInfo(null);
    setImportDetailsOpen(false);
    setImportTab('summary');

    onClose();
  };

  const getDisplayName = (row: MeetingAttendanceWithProfile) => {
    const profile = row.profiles || {};
    const profileName = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
    if (profileName) return profileName;
    const u = lookup.get(row.user_id);
    if (u?.name) return u.name;
    if (u?.email) return u.email;
    return row.user_id;
  };

  const sortedRows = useMemo(() => {
    const collator = new Intl.Collator('en', { sensitivity: 'base' });

    return [...rows].sort((a, b) => {
      const nameA = getDisplayName(a);
      const nameB = getDisplayName(b);
      return collator.compare(nameA, nameB);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, lookup]);

  const anyLoading = loadingUsers || loadingCoaches;

  const quickSelectedRow = useMemo(() => {
    if (!quickSelectedUserId) return null;
    return rows.find((row) => row.user_id === quickSelectedUserId) ?? null;
  }, [quickSelectedUserId, rows]);

  useEffect(() => {
    if (!quickSelectedUserId) return;
    const stillExists = rows.some((row) => row.user_id === quickSelectedUserId);
    if (!stillExists) {
      setQuickSelectedUserId(null);
    }
  }, [quickSelectedUserId, rows]);

  /** ========= CSV import logic ========= */

  const allPeopleIndex = useMemo(() => {
    // We match against BOTH members+coaches, because zoom could include either
    const combined = [...allUsers, ...allCoaches];
    return buildNameIndex(combined);
  }, [allUsers, allCoaches]);

  const existingAttendance = useMemo(() => {
    const map = new Map<string, MeetingAttendanceWithProfile>();
    for (const r of rows) map.set(r.user_id, r);
    return map;
  }, [rows]);

  const applyImport = async (file: File) => {
    if (!meetingId) return;
    setError(null);
    setImportSummary(null);
    setImportInfo(null);

    // guard: wait until lists loaded
    if (anyLoading) {
      setError('Please wait for users/coaches to finish loading, then try importing again.');
      return;
    }

    setImporting(true);

    try {
      const { names, detectedColumn } = await parseCsvNames(file);

      if (!detectedColumn) {
        setError('Could not detect a "Name" column in this CSV. Please export the Zoom attendee report and try again.');
        return;
      }

      if (!names.length) {
        setError(`Detected column "${detectedColumn}" but found no names.`);
        return;
      }

      setImportInfo(`Detected column: ${detectedColumn}`);

      const matchedUserIds: string[] = [];
      const ambiguous: ImportSummary['ambiguous'] = [];
      const unmatched: string[] = [];

      for (const raw of names) {
        const keys = candidateKeysFromRawName(raw);
        if (!keys.length) continue;

        const candMap = new Map<string, SimpleUser>();
        for (const k of keys) {
          const list = allPeopleIndex.byName.get(k) ?? [];
          for (const u of list) candMap.set(u.id, u);
        }

        const candidates = [...candMap.values()];

        if (candidates.length === 1) {
          matchedUserIds.push(candidates[0].id);
        } else if (candidates.length > 1) {
          ambiguous.push({ raw, candidates });
        } else {
          unmatched.push(raw);
        }
      }

      // Apply matches:
      // - If user already in attendance list: set attended=true
      // - If not in attendance list: create row attended=true
      const uniqueMatched = Array.from(new Set(matchedUserIds));
      const addedUserIds: string[] = [];

      // optimistic UI update first
      setRows((prev) => {
        const prevMap = new Map(prev.map((r) => [r.user_id, r]));
        const next = [...prev];

        for (const userId of uniqueMatched) {
          const existing = prevMap.get(userId);
          if (existing) {
            if (!existing.attended) {
              const idx = next.findIndex((r) => r.user_id === userId);
              if (idx >= 0) next[idx] = { ...next[idx], attended: true };
            }
          } else {
            const u = lookup.get(userId);
            const parts = (u?.name ?? '').trim().split(/\s+/).filter(Boolean);
            const firstName = parts[0] ?? '';
            const lastName = parts.slice(1).join(' ') || '';

            next.push({
              meeting_id: meetingId,
              user_id: userId,
              attended: true,
              profiles: { first_name: firstName || null, last_name: lastName || null },
            } as MeetingAttendanceWithProfile);
          }
        }

        return next;
      });

      // Persist changes sequentially (simple + safe)
      for (const userId of uniqueMatched) {
        const existed = existingAttendance.has(userId);

        // if it did not exist before, count as "added"
        if (!existed) addedUserIds.push(userId);

        await upsertMeetingAttendance({ meetingId, userId, attended: true });
      }

      setImportSummary({
        totalNames: names.length,
        matchedUserIds: uniqueMatched,
        addedUserIds,
        ambiguous,
        unmatched,
      });
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to import CSV');
    } finally {
      setImporting(false);
      setDragOver(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onPickFile = () => {
    fileInputRef.current?.click();
  };

  const onFileSelected: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void applyImport(file);
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // very light validation
    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv')) {
      setError('Please drop a .csv file.');
      return;
    }

    void applyImport(file);
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle>Meeting attendance</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* CSV import */}
        <Paper
          variant="outlined"
          sx={{
            mb: 3,
            p: 2,
            borderStyle: dragOver ? 'dashed' : 'solid',
            borderWidth: 2,
            borderColor: dragOver ? 'primary.main' : 'divider',
            backgroundColor: dragOver ? 'action.hover' : 'background.paper',
            transition: 'all 0.15s',
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
          }}
          onDrop={onDrop}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', sm: 'center' }}
            justifyContent="space-between"
          >
            <Box>
              <Typography variant="adminSectionTitle" sx={{ fontWeight: 700 }}>
                Import from Zoom CSV
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Drop a CSV here (or choose a file). We&apos;ll auto-check matched attendees.
              </Typography>
              {importInfo && (
                <Typography variant="caption" color="text.secondary">
                  {importInfo}
                </Typography>
              )}
            </Box>

            <Stack direction="row" spacing={1} alignItems="center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={onFileSelected}
              />
              <Button
                variant="outlined"
                onClick={onPickFile}
                disabled={importing || anyLoading || !meetingId}
                startIcon={<UploadFileIcon />}
              >
                Choose CSV
              </Button>
              {importing && <CircularProgress size={22} />}
            </Stack>
          </Stack>

          {importSummary && (
  <>
    <Divider sx={{ my: 2 }} />

    <Tabs
      value={importTab}
      onChange={(_e, v) => setImportTab(v)}
      sx={{ mb: 1 }}
    >
      <Tab value="summary" label="Summary" />
      <Tab value="details" label="Details" />
    </Tabs>

    {importTab === 'summary' && (
      <>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label={`Rows: ${importSummary.totalNames}`} />
          <Chip label={`Matched: ${importSummary.matchedUserIds.length}`} color="success" />
          <Chip label={`Added: ${importSummary.addedUserIds.length}`} color="success" variant="outlined" />
          <Chip label={`Ambiguous: ${importSummary.ambiguous.length}`} color="warning" />
          <Chip label={`Unmatched: ${importSummary.unmatched.length}`} color="default" />
        </Stack>

        {(importSummary.ambiguous.length > 0 || importSummary.unmatched.length > 0) && (
          <Box mt={2}>
            {importSummary.ambiguous.length > 0 && (
              <Alert severity="warning" sx={{ mb: 1 }}>
                Some names matched multiple people. (Optional next step: add a picker UI for these.)
              </Alert>
            )}
            {importSummary.unmatched.length > 0 && (
              <Alert severity="info">
                Unmatched examples: {unmatchedList.slice(0, 5).join(', ')}
                {unmatchedList.length > 5 ? ' …' : ''}
              </Alert>
            )}
          </Box>
        )}
      </>
    )}

    {importTab === 'details' && (
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Button
            variant="text"
            onClick={() => setImportDetailsOpen((v) => !v)}
            sx={{ textTransform: 'none' }}
          >
            {importDetailsOpen ? 'Hide details' : 'Show details'}
          </Button>

          {unmatchedList.length > 0 && (
            <Button
              variant="outlined"
              size="small"
              onClick={async () => {
                await navigator.clipboard.writeText(unmatchedList.join('\n'));
              }}
            >
              Copy unmatched
            </Button>
          )}

          {addedUsers.length > 0 && (
            <Button
              variant="outlined"
              size="small"
              onClick={async () => {
                const txt = addedUsers
                  .map((u) => `${u.name || '(no name)'}${u.email ? ` <${u.email}>` : ''}`)
                  .join('\n');
                await navigator.clipboard.writeText(txt);
              }}
            >
              Copy added
            </Button>
          )}
        </Stack>

        <Collapse in={importDetailsOpen}>
          <Stack spacing={2}>
            {/* Added */}
            <Box>
              <Typography variant="adminSectionTitle" sx={{ mb: 0.5 }}>
                Added (wasn&apos;t on the attendance list)
              </Typography>

              {addedUsers.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  None
                </Typography>
              ) : (
                <Paper variant="outlined" sx={{ maxHeight: 180, overflow: 'auto' }}>
                  <List dense>
                    {addedUsers.map((u) => (
                      <ListItem key={u.id} disableGutters sx={{ px: 2 }}>
                        <ListItemText
                          primary={u.name || u.email || u.id}
                          secondary={u.email ? u.email : undefined}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              )}
            </Box>

            {/* Unmatched */}
            <Box>
              <Typography variant="adminSectionTitle" sx={{ mb: 0.5 }}>
                Unmatched names (from CSV)
              </Typography>

              {unmatchedList.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  None
                </Typography>
              ) : (
                <Paper variant="outlined" sx={{ maxHeight: 220, overflow: 'auto' }}>
                  <List dense>
                    {unmatchedList.map((name, idx) => (
                      <ListItem key={`${name}-${idx}`} disableGutters sx={{ px: 2 }}>
                        <ListItemText primary={name} />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              )}
            </Box>

            {/* Ambiguous (optional list) */}
            {importSummary.ambiguous.length > 0 && (
              <Box>
                <Typography variant="adminSectionTitle" sx={{ mb: 0.5 }}>
                  Ambiguous matches
                </Typography>

                <Paper variant="outlined" sx={{ maxHeight: 220, overflow: 'auto' }}>
                  <List dense>
                    {importSummary.ambiguous.map((a, idx) => (
                      <ListItem key={`${a.raw}-${idx}`} disableGutters sx={{ px: 2 }}>
                        <ListItemText
                          primary={a.raw}
                          secondary={a.candidates
                            .map((c) => c.name || c.email || c.id)
                            .join(' | ')}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              </Box>
            )}
          </Stack>
        </Collapse>

        {!importDetailsOpen && (
          <Typography variant="body2" color="text.secondary">
            Expand to see the full added + unmatched lists.
          </Typography>
        )}
      </Box>
    )}
  </>
)}

        </Paper>

        <Box sx={{ mb: 3 }}>
          <Typography variant="adminSectionTitle" gutterBottom>
            Quick mark attended
          </Typography>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', sm: 'center' }}
          >
            <Autocomplete
              size="small"
              options={sortedRows}
              value={quickSelectedRow}
              onChange={(_event, value) => setQuickSelectedUserId(value?.user_id ?? null)}
              getOptionLabel={(option) => getDisplayName(option)}
              isOptionEqualToValue={(option, value) => option.user_id === value.user_id}
              noOptionsText="No attendees available"
              disabled={loading || importing || rows.length === 0}
              sx={{ minWidth: { xs: '100%', sm: 320 } }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search attendee"
                  placeholder="Type a name"
                />
              )}
            />

            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2">Attended</Typography>
              <Checkbox
                checked={Boolean(quickSelectedRow?.attended)}
                onChange={() => {
                  if (!quickSelectedRow) return;
                  void handleToggle(quickSelectedRow.user_id, Boolean(quickSelectedRow.attended));
                }}
                disabled={!quickSelectedRow || savingId === quickSelectedRow.user_id || importing}
              />
            </Stack>
          </Stack>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="adminSectionTitle" gutterBottom>
            Add attendee
          </Typography>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', sm: 'center' }}
          >
            <ToggleButtonGroup
              exclusive
              value={source}
              onChange={(_e, v: Source | null) => {
                if (v) {
                  setSource(v);
                  setSelectedUserId(''); // reset selection when switching source
                }
              }}
              size="small"
            >
              <ToggleButton value="members">Members</ToggleButton>
              <ToggleButton value="coaches">Coaches</ToggleButton>
            </ToggleButtonGroup>

            <FormControl sx={{ minWidth: 260 }} size="small">
              <InputLabel id="add-attendee-label">
                {source === 'members' ? 'Member' : 'Coach'}
              </InputLabel>
              <Select
                labelId="add-attendee-label"
                label={source === 'members' ? 'Member' : 'Coach'}
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(String(e.target.value))}
                disabled={anyLoading}
              >
                {availableOptions.map((u) => (
                  <MenuItem key={u.id} value={u.id}>
                    {u.name || u.email || u.id}
                  </MenuItem>
                ))}
                {availableOptions.length === 0 && (
                  <MenuItem disabled>No more {source} to add</MenuItem>
                )}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              onClick={handleAddAttendee}
              disabled={!selectedUserId || adding}
            >
              {adding ? <CircularProgress size={20} /> : 'Add'}
            </Button>
          </Stack>
        </Box>

        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No attendees for this meeting yet.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Attendee</TableCell>
                <TableCell align="center">Attended</TableCell>
                <TableCell align="center">Remove</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedRows.map((row) => (
                <TableRow key={row.user_id}>
                  <TableCell>{getDisplayName(row)}</TableCell>
                  <TableCell align="center">
                    <Checkbox
                      checked={!!row.attended}
                      onChange={() => handleToggle(row.user_id, !!row.attended)}
                      disabled={savingId === row.user_id || importing}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => openRemoveDialog(row)}
                      disabled={removingId === row.user_id || importing}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={Boolean(savingId || adding || removingId || importing)}>
          Close
        </Button>
      </DialogActions>

      <Dialog open={removeDialogOpen} onClose={closeRemoveDialog}>
        <DialogTitle>Remove attendee</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body1">Remove this user from the meeting&apos;s expected attendees?</Typography>
          {userToRemove && (
            <Box mt={2}>
              <Typography variant="adminSectionTitle">{getDisplayName(userToRemove)}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRemoveDialog} disabled={removingId != null}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmRemove}
            color="error"
            variant="contained"
            disabled={removingId != null}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
