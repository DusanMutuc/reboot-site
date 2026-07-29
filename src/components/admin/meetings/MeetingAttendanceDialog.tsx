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
  TableSortLabel,
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
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';


import {
  getMeetingAttendance,
  upsertMeetingAttendance,
  removeMeetingAttendance,
} from '@/lib/meetings';
import {
  analyzeZoomAttendanceNames,
  normalizeZoomName,
  type ZoomAttendanceAlias,
  type ZoomAttendanceAnalysis,
  type ZoomMatchPerson,
} from '@/lib/zoomAttendanceMatching';
import type { MeetingAttendanceWithProfile } from '@/types/meetings';

type Props = {
  open: boolean;
  meetingId: number | null;
  meetingDate: string | null;
  onClose: () => void;
};

type SimpleUser = ZoomMatchPerson & {
  introduced_at: string | null;
};

type Source = 'members' | 'coaches';
type AttendanceSortKey = 'name' | 'attended' | 'introduced';
type SortDirection = 'asc' | 'desc';

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
  const introducedAt = obj.introduced_at;
  if (typeof id !== 'string' && typeof id !== 'number') return null;
  return {
    id: String(id),
    name: typeof name === 'string' ? name : '',
    email: typeof email === 'string' ? email : '',
    introduced_at: typeof introducedAt === 'string' ? introducedAt : null,
  };
}

function toZoomAttendanceAlias(value: unknown): ZoomAttendanceAlias | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.alias_key !== 'string' ||
    typeof row.alias !== 'string' ||
    typeof row.user_id !== 'string'
  ) {
    return null;
  }

  return {
    alias_key: row.alias_key,
    alias: row.alias,
    user_id: row.user_id,
  };
}

/** ========= CSV import helpers ========= */

type ImportSummary = {
  totalNames: number;
  automaticMatches: number;
  manualMatches: number;
  matchedUserIds: string[];
  addedUserIds: string[];
  skipped: Array<{ raw: string; occurrences: number }>;
  failed: Array<{ userId: string; message: string }>;
  savedAliases: ZoomAttendanceAlias[];
  aliasFailures: Array<{ raw: string; message: string }>;
};

function detectNameColumn(headers: string[]) {
  const normalized = headers.map((h) => ({ raw: h, n: normalizeZoomName(h) }));

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
  ].map(normalizeZoomName);

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

async function saveZoomAttendanceAlias(
  alias: string,
  userId: string,
): Promise<ZoomAttendanceAlias> {
  const response = await fetch('/api/admin/zoom-attendance-aliases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alias, user_id: userId }),
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : 'Failed to save Zoom attendance alias';
    throw new Error(message);
  }

  const saved = toZoomAttendanceAlias(payload);
  if (!saved) throw new Error('The alias API returned an invalid response');
  return saved;
}

function buildIntroducedTimestamp(meetingDate: string | null): string | null {
  if (!meetingDate || !/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) {
    return null;
  }

  // Store midday UTC so the calendar date remains stable when rendered in local time.
  return `${meetingDate}T12:00:00.000Z`;
}

async function patchIntroducedAt(userId: string, introducedAt: string): Promise<string | null> {
  const response = await fetch(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ introduced_at: introducedAt }),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : 'Failed to mark attendee as introduced';

    throw new Error(message);
  }

  if (payload && typeof payload === 'object') {
    const nextIntroducedAt = (payload as { introduced_at?: unknown }).introduced_at;
    if (typeof nextIntroducedAt === 'string' || nextIntroducedAt === null) {
      return nextIntroducedAt;
    }
  }

  return introducedAt;
}

/** ========= component ========= */

export function MeetingAttendanceDialog({ open, meetingId, meetingDate, onClose }: Props) {
  const [rows, setRows] = useState<MeetingAttendanceWithProfile[]>([]);
  const [attendanceSort, setAttendanceSort] = useState<{
    key: AttendanceSortKey;
    direction: SortDirection;
  }>({ key: 'name', direction: 'asc' });
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [introducingId, setIntroducingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Members (users) list
  const [allUsers, setAllUsers] = useState<SimpleUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Coaches list
  const [allCoaches, setAllCoaches] = useState<SimpleUser[]>([]);
  const [loadingCoaches, setLoadingCoaches] = useState(false);

  // Administrator-approved Zoom display-name aliases
  const [approvedAliases, setApprovedAliases] = useState<ZoomAttendanceAlias[]>([]);
  const [loadingAliases, setLoadingAliases] = useState(false);

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
  const [importPreview, setImportPreview] = useState<ZoomAttendanceAnalysis | null>(null);
  const [reviewSelections, setReviewSelections] = useState<Record<string, string>>({});
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
        const res = await fetch('/api/admin/list-users?membership=all');
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

  useEffect(() => {
    if (!open) return;

    const loadAliases = async () => {
      setLoadingAliases(true);
      try {
        const response = await fetch('/api/admin/zoom-attendance-aliases');
        if (!response.ok) throw new Error('Failed to load saved Zoom attendance aliases');

        const payload: unknown = await response.json();
        const items = isApiListResponse<unknown>(payload) ? payload.items : [];
        setApprovedAliases(
          items
            .map(toZoomAttendanceAlias)
            .filter((item): item is ZoomAttendanceAlias => item !== null),
        );
      } catch (err: unknown) {
        console.error(err);
        setError((current) =>
          current ??
          (err instanceof Error
            ? err.message
            : 'Failed to load saved Zoom attendance aliases'),
        );
      } finally {
        setLoadingAliases(false);
      }
    };

    void loadAliases();
  }, [open]);

  // Fast lookup across both lists
  const lookup = useMemo(() => {
    const map = new Map<string, SimpleUser>();
    for (const u of allUsers) map.set(u.id, u);
    for (const c of allCoaches) map.set(c.id, c);
    return map;
  }, [allUsers, allCoaches]);

  const allPeople = useMemo(
    () =>
      [...lookup.values()].sort((left, right) =>
        (left.name || left.email).localeCompare(right.name || right.email),
      ),
    [lookup],
  );
const addedUsers = useMemo(() => {
  if (!importSummary) return [];
  return importSummary.addedUserIds
    .map((id) => lookup.get(id))
    .filter((u): u is SimpleUser => Boolean(u));
}, [importSummary, lookup]);

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

  const syncIntroducedState = (userId: string, introducedAt: string | null) => {
    setRows((prev) =>
      prev.map((row) =>
        row.user_id === userId
          ? {
              ...row,
              profiles: {
                ...(row.profiles ?? {}),
                introduced_at: introducedAt,
              },
            }
          : row
      )
    );
    setAllUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, introduced_at: introducedAt } : user))
    );
    setAllCoaches((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, introduced_at: introducedAt } : user))
    );
  };

  const getIntroducedAt = (row: MeetingAttendanceWithProfile) =>
    row.profiles?.introduced_at ?? lookup.get(row.user_id)?.introduced_at ?? null;

  const handleMarkIntroduced = async (userId: string) => {
    const introducedAt = buildIntroducedTimestamp(meetingDate);
    if (!introducedAt) {
      setError('Meeting date is unavailable, so the introduction date could not be saved.');
      return;
    }

    const existingRow = rows.find((row) => row.user_id === userId) ?? null;
    const previousIntroducedAt =
      existingRow?.profiles?.introduced_at ?? lookup.get(userId)?.introduced_at ?? null;

    setIntroducingId(userId);
    setError(null);
    syncIntroducedState(userId, introducedAt);

    try {
      const persistedIntroducedAt = await patchIntroducedAt(userId, introducedAt);
      syncIntroducedState(userId, persistedIntroducedAt);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to mark attendee as introduced');
      syncIntroducedState(userId, previousIntroducedAt);
    } finally {
      setIntroducingId(null);
    }
  };

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
          profiles: {
            first_name: firstName || null,
            last_name: lastName || null,
            introduced_at: user?.introduced_at ?? null,
          },
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
    if (savingId || introducingId || adding || removingId || importing) return;
    setError(null);
    setImportPreview(null);
    setReviewSelections({});
    setImportSummary(null);
    setImportInfo(null);
    setAttendanceSort({ key: 'name', direction: 'asc' });

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

  const nameSortedRows = useMemo(() => {
    const collator = new Intl.Collator('en', { sensitivity: 'base' });

    return [...rows].sort((a, b) => {
      const nameA = getDisplayName(a);
      const nameB = getDisplayName(b);
      return collator.compare(nameA, nameB);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, lookup]);

  const sortedRows = useMemo(() => {
    const collator = new Intl.Collator('en', { sensitivity: 'base' });
    const displayName = (row: MeetingAttendanceWithProfile) => {
      const profileName =
        `${row.profiles?.first_name ?? ''} ${row.profiles?.last_name ?? ''}`.trim();
      const person = lookup.get(row.user_id);
      return profileName || person?.name || person?.email || row.user_id;
    };
    const introduced = (row: MeetingAttendanceWithProfile) =>
      Boolean(row.profiles?.introduced_at ?? lookup.get(row.user_id)?.introduced_at);

    return [...rows].sort((left, right) => {
      let comparison = 0;

      if (attendanceSort.key === 'name') {
        comparison = collator.compare(displayName(left), displayName(right));
      } else if (attendanceSort.key === 'attended') {
        comparison = Number(Boolean(left.attended)) - Number(Boolean(right.attended));
      } else {
        comparison = Number(introduced(left)) - Number(introduced(right));
      }

      if (comparison !== 0) {
        return attendanceSort.direction === 'asc' ? comparison : -comparison;
      }

      return collator.compare(displayName(left), displayName(right));
    });
  }, [attendanceSort, lookup, rows]);

  const handleAttendanceSort = (key: AttendanceSortKey) => {
    setAttendanceSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const anyLoading = loadingUsers || loadingCoaches || loadingAliases;

  const quickSelectedRow = useMemo(() => {
    if (!quickSelectedUserId) return null;
    return rows.find((row) => row.user_id === quickSelectedUserId) ?? null;
  }, [quickSelectedUserId, rows]);

  const quickSelectedIntroducedAt = quickSelectedRow ? getIntroducedAt(quickSelectedRow) : null;

  useEffect(() => {
    if (!quickSelectedUserId) return;
    const stillExists = rows.some((row) => row.user_id === quickSelectedUserId);
    if (!stillExists) {
      setQuickSelectedUserId(null);
    }
  }, [quickSelectedUserId, rows]);

  /** ========= CSV import logic ========= */

  const existingAttendance = useMemo(() => {
    const map = new Map<string, MeetingAttendanceWithProfile>();
    for (const r of rows) map.set(r.user_id, r);
    return map;
  }, [rows]);

  const analyzeImport = async (file: File) => {
    if (!meetingId) return;
    setError(null);
    setImportPreview(null);
    setReviewSelections({});
    setImportSummary(null);
    setImportInfo(null);

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
      setImportPreview(
        analyzeZoomAttendanceNames(names, allPeople, approvedAliases),
      );
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to analyze CSV');
    } finally {
      setImporting(false);
      setDragOver(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleApplyImport = async () => {
    if (!meetingId || !importPreview) return;

    const automaticUserIds = importPreview.automatic.map((match) => match.person.id);
    const selectedReviewRows = importPreview.review.filter(
      (match) => Boolean(reviewSelections[match.key]),
    );
    const manualUserIds = selectedReviewRows.map((match) => reviewSelections[match.key]);
    const userIds = [...new Set([...automaticUserIds, ...manualUserIds])];

    if (!userIds.length) {
      setError('There are no selected attendees to apply.');
      return;
    }

    setImporting(true);
    setError(null);
    setImportSummary(null);

    const successfulUserIds: string[] = [];
    const failed: ImportSummary['failed'] = [];

    for (const userId of userIds) {
      try {
        await upsertMeetingAttendance({ meetingId, userId, attended: true });
        successfulUserIds.push(userId);
      } catch (err: unknown) {
        failed.push({
          userId,
          message: err instanceof Error ? err.message : 'Unknown attendance update error',
        });
      }
    }

    let reloadedRows = rows;
    try {
      // Reload the RPC-backed result instead of guessing how partnership rows
      // were represented by the database.
      reloadedRows = await getMeetingAttendance(meetingId);
      setRows(reloadedRows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Attendance was saved but could not be reloaded.');
    }

    const successfulSet = new Set(successfulUserIds);
    const savedAliases: ZoomAttendanceAlias[] = [];
    const aliasFailures: ImportSummary['aliasFailures'] = [];

    for (const match of selectedReviewRows) {
      const userId = reviewSelections[match.key];
      if (!successfulSet.has(userId)) continue;

      try {
        savedAliases.push(await saveZoomAttendanceAlias(match.raw, userId));
      } catch (err: unknown) {
        aliasFailures.push({
          raw: match.raw,
          message: err instanceof Error ? err.message : 'Unknown alias update error',
        });
      }
    }

    if (savedAliases.length > 0) {
      setApprovedAliases((current) => {
        const next = new Map(current.map((alias) => [alias.alias_key, alias]));
        for (const alias of savedAliases) next.set(alias.alias_key, alias);
        return [...next.values()];
      });
    }

    const addedUserIds = reloadedRows
      .filter((row) => !existingAttendance.has(row.user_id))
      .map((row) => row.user_id);
    const skipped = importPreview.review
      .filter((match) => !reviewSelections[match.key])
      .map(({ raw, occurrences }) => ({ raw, occurrences }));

    setImportSummary({
      totalNames: importPreview.totalRows,
      automaticMatches: importPreview.automatic.filter((match) =>
        successfulSet.has(match.person.id),
      ).length,
      manualMatches: selectedReviewRows.filter((match) =>
        successfulSet.has(reviewSelections[match.key]),
      ).length,
      matchedUserIds: successfulUserIds,
      addedUserIds,
      skipped,
      failed,
      savedAliases,
      aliasFailures,
    });

    if (failed.length > 0 || aliasFailures.length > 0) {
      const problems = [
        failed.length
          ? `${failed.length} attendance update${failed.length === 1 ? '' : 's'}`
          : '',
        aliasFailures.length
          ? `${aliasFailures.length} alias save${aliasFailures.length === 1 ? '' : 's'}`
          : '',
      ].filter(Boolean);
      setError(
        `${problems.join(' and ')} failed. Successful changes are listed below; you can safely retry.`,
      );
    } else {
      setImportPreview(null);
      setReviewSelections({});
    }

    setImporting(false);
  };

  const onPickFile = () => {
    fileInputRef.current?.click();
  };

  const onFileSelected: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void analyzeImport(file);
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

    void analyzeImport(file);
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
                Drop a CSV here (or choose a file) to preview matches before saving.
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

          {importPreview && (
            <>
              <Divider sx={{ my: 2 }} />
              <Stack spacing={2}>
                <Box>
                  <Typography variant="adminSectionTitle">Review before applying</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Nothing has been saved yet. Reliable full-name matches are ready to apply;
                    one-word, ambiguous, and unmatched entries are skipped unless you choose a person.
                    Chosen reviewed names are automatically saved as aliases for future imports.
                  </Typography>
                </Box>

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip label={`CSV rows: ${importPreview.totalRows}`} />
                  <Chip label={`Unique names: ${importPreview.uniqueNames}`} />
                  <Chip
                    label={`Automatic: ${importPreview.automatic.length}`}
                    color="success"
                    variant="outlined"
                  />
                  <Chip
                    label={`Needs review: ${importPreview.review.length}`}
                    color={importPreview.review.length ? 'warning' : 'default'}
                  />
                </Stack>

                {importPreview.automatic.length > 0 && (
                  <Box component="details">
                    <Typography
                      component="summary"
                      variant="body2"
                      sx={{ cursor: 'pointer', fontWeight: 700 }}
                    >
                      Show {importPreview.automatic.length} automatic name matches
                    </Typography>
                    <Stack
                      spacing={0.5}
                      sx={{ mt: 1, maxHeight: 220, overflowY: 'auto', pl: 1 }}
                    >
                      {importPreview.automatic.map((match) => (
                        <Typography key={match.key} variant="body2" color="text.secondary">
                          {match.raw}
                          {match.occurrences > 1 ? ` (${match.occurrences} rows)` : ''}
                          {' → '}
                          {match.person.name || match.person.email}
                        </Typography>
                      ))}
                    </Stack>
                  </Box>
                )}

                {importPreview.review.length > 0 && (
                  <Box>
                    <Typography variant="adminSectionTitle" sx={{ mb: 1 }}>
                      Names needing review
                    </Typography>
                    <Stack spacing={1.5} sx={{ maxHeight: 440, overflowY: 'auto', pr: 0.5 }}>
                      {importPreview.review.map((match) => {
                        const selected = lookup.get(reviewSelections[match.key]) ?? null;
                        const suggestions = match.candidates
                          .map((candidate) => candidate.name || candidate.email)
                          .join(' · ');

                        return (
                          <Paper key={match.key} variant="outlined" sx={{ p: 1.5 }}>
                            <Stack
                              direction={{ xs: 'column', sm: 'row' }}
                              spacing={1.5}
                              alignItems={{ xs: 'stretch', sm: 'center' }}
                            >
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                  {match.raw}
                                  {match.occurrences > 1 ? ` (${match.occurrences} rows)` : ''}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {match.reason}
                                  {suggestions ? ` Suggested: ${suggestions}` : ''}
                                </Typography>
                                {match.candidates.length === 1 && !selected && (
                                  <Box>
                                    <Button
                                      size="small"
                                      sx={{ px: 0, minWidth: 0, textTransform: 'none' }}
                                      onClick={() => {
                                        setReviewSelections((current) => ({
                                          ...current,
                                          [match.key]: match.candidates[0].id,
                                        }));
                                      }}
                                    >
                                      Use suggested match
                                    </Button>
                                  </Box>
                                )}
                              </Box>
                              <Autocomplete
                                size="small"
                                options={allPeople}
                                value={selected}
                                onChange={(_event, value) => {
                                  setReviewSelections((current) => {
                                    const next = { ...current };
                                    if (value) next[match.key] = value.id;
                                    else delete next[match.key];
                                    return next;
                                  });
                                }}
                                getOptionLabel={(option) =>
                                  option.name || option.email || option.id
                                }
                                isOptionEqualToValue={(option, value) => option.id === value.id}
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    label="Choose person or leave skipped"
                                  />
                                )}
                                sx={{ width: { xs: '100%', sm: 320 } }}
                              />
                            </Stack>
                          </Paper>
                        );
                      })}
                    </Stack>
                  </Box>
                )}

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button
                    variant="contained"
                    onClick={() => void handleApplyImport()}
                    disabled={
                      importing ||
                      importPreview.automatic.length +
                        Object.keys(reviewSelections).length ===
                        0
                    }
                  >
                    Apply selected attendees
                  </Button>
                  <Button
                    variant="text"
                    onClick={() => {
                      setImportPreview(null);
                      setReviewSelections({});
                      setImportInfo(null);
                    }}
                    disabled={importing}
                  >
                    Cancel preview
                  </Button>
                </Stack>
              </Stack>
            </>
          )}

          {importSummary && (
            <>
              <Divider sx={{ my: 2 }} />
              <Stack spacing={1.5}>
                <Alert
                  severity={
                    importSummary.failed.length || importSummary.aliasFailures.length
                      ? 'warning'
                      : 'success'
                  }
                >
                  {importSummary.failed.length || importSummary.aliasFailures.length
                    ? 'Import completed with some failed updates.'
                    : 'Import applied successfully.'}
                </Alert>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip label={`CSV rows: ${importSummary.totalNames}`} />
                  <Chip
                    label={`People updated: ${importSummary.matchedUserIds.length}`}
                    color="success"
                  />
                  <Chip label={`Automatic names: ${importSummary.automaticMatches}`} />
                  <Chip label={`Reviewed names: ${importSummary.manualMatches}`} />
                  <Chip label={`Aliases saved: ${importSummary.savedAliases.length}`} />
                  <Chip
                    label={`Added: ${importSummary.addedUserIds.length}`}
                    color="success"
                    variant="outlined"
                  />
                  <Chip
                    label={`Skipped: ${importSummary.skipped.length}`}
                    color={importSummary.skipped.length ? 'warning' : 'default'}
                  />
                </Stack>

                {addedUsers.length > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Added: {addedUsers.map((user) => user.name || user.email).join(', ')}
                  </Typography>
                )}

                {importSummary.skipped.length > 0 && (
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        Skipped names
                      </Typography>
                      <Button
                        size="small"
                        onClick={() =>
                          void navigator.clipboard.writeText(
                            importSummary.skipped
                              .map((item) =>
                                item.occurrences > 1
                                  ? `${item.raw} (${item.occurrences} rows)`
                                  : item.raw,
                              )
                              .join('\n'),
                          )
                        }
                      >
                        Copy
                      </Button>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {importSummary.skipped
                        .map((item) =>
                          item.occurrences > 1
                            ? `${item.raw} (${item.occurrences})`
                            : item.raw,
                        )
                        .join(', ')}
                    </Typography>
                  </Box>
                )}

                {importSummary.failed.length > 0 && (
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Failed updates
                    </Typography>
                    {importSummary.failed.map((item) => (
                      <Typography key={item.userId} variant="body2" color="error">
                        {lookup.get(item.userId)?.name || item.userId}: {item.message}
                      </Typography>
                    ))}
                  </Box>
                )}

                {importSummary.aliasFailures.length > 0 && (
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Failed alias saves
                    </Typography>
                    {importSummary.aliasFailures.map((item) => (
                      <Typography key={item.raw} variant="body2" color="error">
                        {item.raw}: {item.message}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Stack>
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
              options={nameSortedRows}
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
                disabled={
                  !quickSelectedRow ||
                  savingId === quickSelectedRow.user_id ||
                  introducingId === quickSelectedRow.user_id ||
                  importing
                }
              />
            </Stack>

            {quickSelectedRow && !quickSelectedIntroducedAt && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  void handleMarkIntroduced(quickSelectedRow.user_id);
                }}
                disabled={
                  !meetingDate ||
                  introducingId === quickSelectedRow.user_id ||
                  savingId === quickSelectedRow.user_id ||
                  importing
                }
              >
                {introducingId === quickSelectedRow.user_id ? 'Saving...' : 'Mark introduced'}
              </Button>
            )}
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
                <TableCell
                  sortDirection={
                    attendanceSort.key === 'name' ? attendanceSort.direction : false
                  }
                >
                  <TableSortLabel
                    active={attendanceSort.key === 'name'}
                    direction={
                      attendanceSort.key === 'name' ? attendanceSort.direction : 'asc'
                    }
                    onClick={() => handleAttendanceSort('name')}
                  >
                    Name
                  </TableSortLabel>
                </TableCell>
                <TableCell
                  align="center"
                  sortDirection={
                    attendanceSort.key === 'attended' ? attendanceSort.direction : false
                  }
                >
                  <TableSortLabel
                    active={attendanceSort.key === 'attended'}
                    direction={
                      attendanceSort.key === 'attended'
                        ? attendanceSort.direction
                        : 'asc'
                    }
                    onClick={() => handleAttendanceSort('attended')}
                  >
                    Attended
                  </TableSortLabel>
                </TableCell>
                <TableCell
                  align="center"
                  sortDirection={
                    attendanceSort.key === 'introduced' ? attendanceSort.direction : false
                  }
                >
                  <TableSortLabel
                    active={attendanceSort.key === 'introduced'}
                    direction={
                      attendanceSort.key === 'introduced'
                        ? attendanceSort.direction
                        : 'asc'
                    }
                    onClick={() => handleAttendanceSort('introduced')}
                  >
                    Introduced
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center">Remove</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedRows.map((row) => {
                const introducedAt = getIntroducedAt(row);

                return (
                  <TableRow key={row.user_id}>
                    <TableCell>
                      <Typography variant="body1" sx={{ fontSize: '1rem', fontWeight: 600 }}>
                        {getDisplayName(row)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Checkbox
                        checked={!!row.attended}
                        onChange={() => handleToggle(row.user_id, !!row.attended)}
                        disabled={savingId === row.user_id || introducingId === row.user_id || importing}
                      />
                    </TableCell>
                    <TableCell align="center">
                      {!introducedAt ? (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            void handleMarkIntroduced(row.user_id);
                          }}
                          disabled={!meetingDate || introducingId === row.user_id || savingId === row.user_id || importing}
                        >
                          {introducingId === row.user_id ? 'Saving...' : 'Mark introduced'}
                        </Button>
                      ) : null}
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => openRemoveDialog(row)}
                        disabled={removingId === row.user_id || introducingId === row.user_id || importing}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DialogContent>

      <DialogActions>
        <Button
          onClick={handleClose}
          disabled={Boolean(savingId || introducingId || adding || removingId || importing)}
        >
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
