'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert, Box, Button, Checkbox, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Link, MenuItem, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import type { DiscoveryTag } from '@/lib/discoveryAdminTypes';
import type { DiscoveryHelpView } from '@/lib/discoveryHelp';
import { discoveryAdminRequest, readDiscoveryResponse } from '@/lib/discoveryAdminClient';
import { DISCOVERY_NAVIGATION_EVENT } from '@/lib/discoveryAdminNavigation';
import { DISCOVERY_CATEGORY_LABELS } from '@/lib/discoveryAdminTypes';
import CategoryCoverage, { DISCOVERY_CATEGORIES } from './CategoryCoverage';
import DiscoveryDuplicatePanel from './DiscoveryDuplicatePanel';
import DiscoveryVocabularyBulkBar from './DiscoveryVocabularyBulkBar';
import DiscoveryTagRowMenu from './DiscoveryTagRowMenu';
import MergeExplainer from './MergeExplainer';
import DiscoveryJobsTab from './jobs/DiscoveryJobsTab';
import { fetchJobCounts } from '@/lib/discoveryJobsClient';
import type { DiscoveryJobCounts } from '@/lib/discoveryJobsClient';
import DiscoveryHelpDrawer from './DiscoveryHelpDrawer';
import FindContentAdmin from './FindContentAdmin';
import FixSearchAdmin from './FixSearchAdmin';


const categories = ['marketing', 'systems', 'hiring', 'mindset'];
// A term is either a subject you tag with, or another spelling of one. `format`, `audience`
// and `legacy` are permitted by the schema's check constraint but were confirmed unnecessary,
// so they are not offered here or accepted by the API. `browse_category` is excluded too: the
// four sections are seeded, a unique index allows one active row each, and a fifth value fails
// the constraint — nothing an admin created there could be valid.
// A term is either a subject you tag content with, or another spelling of one. Which it is gets
// decided by the button you press, so it is never shown as a field to fill in.


function usageOf(tag: DiscoveryTag) {
  return (tag.resource_count ?? 0) + (tag.node_count ?? 0);
}

const chipSx = { height: 20, '& .MuiChip-label': { px: 0.8, fontSize: 11 } } as const;

function count(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export default function DiscoveryAdminPanel({ view, onCountsChanged }: {
  view: DiscoveryHelpView;
  onCountsChanged: () => void;
}) {
  const [tags, setTags] = useState<DiscoveryTag[]>([]);
  const [tagEdit, setTagEdit] = useState<DiscoveryTag | null>(null);
  const [mergeSource, setMergeSource] = useState<DiscoveryTag | null>(null);
  const [mergeTarget, setMergeTarget] = useState('');
  const [groupMerge, setGroupMerge] = useState<{ keepId: number; mergeIds: number[] } | null>(null);
  const [vocabularyQuery, setVocabularyQuery] = useState('');
  const [vocabFilter, setVocabFilter] = useState('all');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [vocabCategory, setVocabCategory] = useState('unchanged');
  const [vocabStatus, setVocabStatus] = useState('unchanged');
  const [howItWorks, setHowItWorks] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dismissedDuplicates, setDismissedDuplicates] = useState<string[]>([]);
  const router = useRouter();
  const [tagBaseline, setTagBaseline] = useState('');
  const [diagnostic, setDiagnostic] = useState<DiscoveryJobCounts['categoryDiagnostic'] | null>(null);
  useEffect(() => {
    if (view !== 'vocabulary') return;
    void fetchJobCounts().then((next) => setDiagnostic(next.categoryDiagnostic)).catch(() => {});
  }, [view, refresh]);
  const [discardAction, setDiscardAction] = useState<{ run: () => void } | null>(null);

  const tagDirty = !!tagEdit && JSON.stringify(tagEdit) !== tagBaseline;
  const bulkDirty = selectedTagIds.length > 0 && (vocabCategory !== 'unchanged' || vocabStatus !== 'unchanged');
  const unsaved = tagDirty || bulkDirty;
  useEffect(() => {
    const preventUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    if (unsaved || busy) window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [unsaved, busy]);
  useEffect(() => {
    const protectNavigation = (event: Event) => {
      if (!unsaved && !busy) return;
      event.preventDefault();
      if (!busy) setDiscardAction({ run: (event as CustomEvent<{ run: () => void }>).detail.run });
    };
    window.addEventListener(DISCOVERY_NAVIGATION_EVENT, protectNavigation);
    return () => window.removeEventListener(DISCOVERY_NAVIGATION_EVENT, protectNavigation);
  }, [unsaved, busy]);
  const leave = (run: () => void, dirty = unsaved) => {
    if (busy) return;
    if (dirty) setDiscardAction({ run }); else run();
  };

  // Routing between discovery screens goes through the admin router, guarded like any other move,
  // so an unsaved vocabulary edit still prompts before it is abandoned.
  const DISCOVERY_PATHS: Record<string, string> = {
    topics: 'discovery-topics', placement: 'discovery-standalone', visibility: 'discovery-hidden',
    browse: 'discovery-browse', find: 'discovery-find', search: 'discovery-search', vocabulary: 'discovery-vocabulary',
  };
  const navigateToDiscoveryView = (next: string) =>
    leave(() => { resetVocabBulk(); router.push(`/admin/${DISCOVERY_PATHS[next] ?? 'discovery-topics'}`); });
  const editTag = (tag: DiscoveryTag) => { setTagBaseline(JSON.stringify(tag)); setTagEdit(tag); };
  const closeTag = () => leave(() => setTagEdit(null), tagDirty);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/admin/discovery?view=vocabulary', { signal: controller.signal })
      .then(response => readDiscoveryResponse<{ tags: DiscoveryTag[]; dismissedDuplicates: string[] }>(response))
      .then(value => { if (!controller.signal.aborted) { setTags(value.tags); setDismissedDuplicates(value.dismissedDuplicates); } })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [refresh]);


  async function mutate(body: Record<string, unknown>, success: string, done?: () => void) {
    setBusy(true); setError(null); setMessage(null);
    try { await discoveryAdminRequest(body); setError(null); setMessage(success); setRefresh((value) => value + 1); done?.(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Save failed.'); }
    finally { setBusy(false); }
  }

  /** Group merges run one call per source so a mid-way failure reports what already landed. */
  async function mergeGroup(keepId: number, mergeIds: number[]) {
    setBusy(true); setError(null); setMessage(null);
    let done = 0;
    try {
      for (const sourceId of mergeIds) {
        await discoveryAdminRequest({ operation: 'merge_tags', sourceId, targetId: keepId });
        done += 1;
      }
      setMessage(`Merged ${done} ${done === 1 ? 'term' : 'terms'}.`);
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'Merge failed.'}${done ? ` ${done} of ${mergeIds.length} already merged.` : ''}`);
    } finally {
      setBusy(false); setGroupMerge(null); setRefresh((value) => value + 1);
    }
  }

  const mergeTargetTag = tags.find((tag) => tag.id === Number(mergeTarget));

  const visibleTags = useMemo(
    () => tags.filter((tag) => tag.name.toLowerCase().includes(vocabularyQuery.toLowerCase())),
    [tags, vocabularyQuery],
  );
  const vocabularySections = useMemo(() => {
    const active = visibleTags.filter((tag) => tag.is_active !== false);
    const byName = (left: DiscoveryTag, right: DiscoveryTag) => left.name.localeCompare(right.name);
    // Merging turns the losing term into an active alias with no usage of its own, so
    // synonyms need their own section or they pile up among genuinely unused topics.
    const isTopic = (tag: DiscoveryTag) => tag.tag_kind === 'topic';
    return {
      browseCategories: active.filter((tag) => tag.tag_kind === 'browse_category').sort(byName),
      inUse: active.filter((tag) => isTopic(tag) && usageOf(tag) > 0)
        .sort((left, right) => usageOf(right) - usageOf(left) || byName(left, right)),
      unused: active.filter((tag) => isTopic(tag) && usageOf(tag) === 0).sort(byName),
      synonyms: active.filter((tag) => tag.tag_kind === 'alias').sort(byName),
      inactive: visibleTags.filter((tag) => tag.is_active === false).sort(byName),
    };
  }, [visibleTags]);

  const vocabGroups = useMemo(() => {
    const active = visibleTags.filter((tag) => tag.is_active !== false);
    const isTopic = (tag: DiscoveryTag) => tag.tag_kind === 'topic';
    return {
      categories: vocabularySections.browseCategories,
      topics: active.filter(isTopic),
      needCategory: active.filter((tag) => isTopic(tag) && !tag.browse_category),
      unused: active.filter((tag) => isTopic(tag) && usageOf(tag) === 0),
      synonyms: vocabularySections.synonyms,
      inactive: vocabularySections.inactive,
    };
  }, [visibleTags, vocabularySections]);

  const vocabFilters = useMemo(() => [
    { id: 'all', label: 'All', count: visibleTags.filter((tag) => tag.tag_kind !== 'browse_category').length },
    { id: 'no_category', label: 'No category', count: vocabGroups.needCategory.length },
    { id: 'unused', label: 'Unused', count: vocabGroups.unused.length },
    { id: 'synonyms', label: 'Synonyms', count: vocabGroups.synonyms.length },
    { id: 'inactive', label: 'Retired', count: vocabGroups.inactive.length },
  ], [visibleTags, vocabGroups]);

  /** Topics lead by how much they are used, then synonyms, then retired terms. */
  const vocabRows = useMemo(() => {
    const byUsage = (left: DiscoveryTag, right: DiscoveryTag) =>
      usageOf(right) - usageOf(left) || left.name.localeCompare(right.name);
    if (vocabFilter === 'no_category') return [...vocabGroups.needCategory].sort(byUsage);
    if (vocabFilter === 'unused') return [...vocabGroups.unused].sort((l, r) => l.name.localeCompare(r.name));
    if (vocabFilter === 'synonyms') return vocabGroups.synonyms;
    if (vocabFilter === 'inactive') return vocabGroups.inactive;
    return [
      ...[...vocabGroups.topics].sort(byUsage),
      ...vocabGroups.synonyms,
      ...vocabGroups.inactive,
    ];
  }, [vocabFilter, vocabGroups]);

  // The four sections are not editable in bulk, so they never join a selection.
  const selectableRows = useMemo(
    () => vocabRows.filter(tag => tag.tag_kind === 'topic' || tag.tag_kind === 'alias'),
    [vocabRows],
  );

  /** Inline category edits save on change — one field, no reason to make it a two-step. */
  async function setTagCategory(tag: DiscoveryTag, category: string) {
    await mutate({
      operation: 'save_tag', id: tag.id, name: tag.name, kind: tag.tag_kind,
      category: category || null, canonicalId: tag.canonical_tag_id ?? null,
      active: tag.is_active !== false,
    }, category ? `Moved to ${category}.` : 'Category cleared.', () => {});
  }

  async function setTagActive(tag: DiscoveryTag, active: boolean) {
    await mutate({
      operation: 'save_tag', id: tag.id, name: tag.name, kind: tag.tag_kind,
      category: tag.browse_category ?? null, canonicalId: tag.canonical_tag_id ?? null, active,
    }, active ? 'Term brought back.' : 'Term retired.', () => {});
  }

  function resetVocabBulk() {
    setSelectedTagIds([]); setVocabCategory('unchanged'); setVocabStatus('unchanged');
  }

  const hasVocabChange = vocabCategory !== 'unchanged' || vocabStatus !== 'unchanged';

  /** One save_tag call per term, so a mid-way failure can report what already landed. */
  async function applyVocabularyBulk() {
    const targets = tags.filter((tag) => selectedTagIds.includes(tag.id));
    setBusy(true); setError(null); setMessage(null);
    let done = 0;
    try {
      for (const tag of targets) {
        await discoveryAdminRequest({
          operation: 'save_tag', id: tag.id, name: tag.name, kind: tag.tag_kind,
          category: tag.tag_kind === 'alias' || vocabCategory === 'unchanged'
            ? (tag.tag_kind === 'alias' ? null : tag.browse_category ?? null)
            : vocabCategory === 'none' ? null : vocabCategory,
          canonicalId: tag.canonical_tag_id ?? null,
          active: vocabStatus === 'unchanged' ? tag.is_active !== false : vocabStatus === 'keep',
        });
        done += 1;
      }
      setMessage(`Updated ${done} ${done === 1 ? 'term' : 'terms'}.`);
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'Update failed.'}${done ? ` ${done} of ${targets.length} already updated.` : ''}`);
    } finally {
      setBusy(false); resetVocabBulk(); setRefresh((value) => value + 1);
    }
  }



  const tagRow = (tag: DiscoveryTag) => {
    const usage = usageOf(tag);
    const isCategory = tag.tag_kind === 'browse_category';
    const isSynonym = tag.tag_kind === 'alias';
    return <TableRow key={tag.id} hover selected={selectedTagIds.includes(tag.id)}>
      <TableCell padding="checkbox">
        {!isCategory && <Checkbox checked={selectedTagIds.includes(tag.id)} disabled={busy}
          inputProps={{ 'aria-label': `Select ${tag.name}` }}
          onChange={(e) => setSelectedTagIds((ids) => e.target.checked
            ? [...ids, tag.id] : ids.filter((id) => id !== tag.id))} />}
      </TableCell>

      <TableCell>
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{tag.name}</Typography>
          {isCategory && <Chip size="small" label="section" sx={chipSx} />}
          {isSynonym && <Chip size="small" label="synonym" variant="outlined" sx={chipSx} />}
          {tag.is_active === false && <Chip size="small" label="retired" sx={chipSx} />}
        </Stack>
        {tag.canonical_tag_id && <Typography variant="caption" color="text.secondary">
          &rarr; {tags.find((other) => other.id === tag.canonical_tag_id)?.name ?? 'unknown term'}
        </Typography>}
      </TableCell>

      <TableCell>
        {isCategory
          ? <Typography variant="body2" color="text.secondary">{tag.browse_category}</Typography>
          : isSynonym
            ? <Typography variant="body2" color="text.disabled">follows its topic</Typography>
            : <TextField select size="small" fullWidth variant="standard" disabled={busy}
              SelectProps={{ displayEmpty: true, inputProps: { 'aria-label': `Category for ${tag.name}` }, renderValue: value => value
                ? <Typography variant="body2">{DISCOVERY_CATEGORY_LABELS[value as string] ?? String(value)}</Typography>
                : <Typography variant="body2" color="text.disabled">Set a category</Typography> }}
              value={tag.browse_category ?? ''}
              InputProps={{ disableUnderline: !tag.browse_category }}
              onChange={(e) => void setTagCategory(tag, e.target.value)}>
              <MenuItem value="">None</MenuItem>
              {categories.map((value) => <MenuItem key={value} value={value}>{DISCOVERY_CATEGORY_LABELS[value]}</MenuItem>)}
            </TextField>}
      </TableCell>

      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        {usage || (tag.alias_count ?? 0)
          ? <Typography variant="body2" component="span">
            {[
              tag.resource_count ? count(tag.resource_count, 'resource') : null,
              tag.node_count ? count(tag.node_count, 'guide') : null,
              tag.alias_count ? count(tag.alias_count, 'synonym') : null,
            ].filter(Boolean).join(' \· ')}
          </Typography>
          : <Typography variant="body2" color="text.disabled" component="span">nothing yet</Typography>}
      </TableCell>

      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        {isCategory ? <Typography variant="caption" color="text.secondary">Fixed section</Typography> : <DiscoveryTagRowMenu tag={tag} busy={busy}
          onEdit={() => editTag({ ...tag })}
          onMerge={() => { setMergeSource(tag); setMergeTarget(''); }}
          onSetActive={(active) => void setTagActive(tag, active)} />}
      </TableCell>
    </TableRow>;
  };

  if (view === 'find') return <FindContentAdmin />;
  if (view === 'search') return <FixSearchAdmin />;

  return <Stack spacing={3}>
    <Box>
      {/* The help button sits in the same corner as it does on the six JobHeading screens — being
          in one predictable place is the only reason it gets found. "How this works" stays where
          it is: it says what this screen does *not* touch, which is a different question from how
          to fill the fields in. */}
      <Stack direction="row" alignItems="flex-start" gap={2} flexWrap="wrap" useFlexGap>
        <Box sx={{ flex: 1, minWidth: 320 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Search &amp; browse</Typography>
          <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mt: 0.5 }}>
            <Typography color="text.secondary">Decide what members can find, and keep the tag list clean.</Typography>
            <Link component="button" variant="body2" underline="hover" onClick={() => setHowItWorks((value) => !value)}>
              How this works
            </Link>
          </Stack>
        </Box>
        <DiscoveryHelpDrawer view="vocabulary" />
      </Stack>
      <Collapse in={howItWorks}>
        <Alert severity="info" sx={{ mt: 1.5 }} onClose={() => setHowItWorks(false)}>
          <Typography variant="body2" component="div">
            Nothing on this screen publishes content, grants member access, or changes a coaching
            assignment — these are discovery settings only. Guides never enter homepage browse.
            Whole courses and canonical Library guides can be search results. Course-internal
            chapters and lessons are not separate results. Coverage counts describe settings, not
            a claim that the content has been reviewed.
          </Typography>
        </Alert>
      </Collapse>
    </Box>

    {error && <Alert severity="error" onClose={() => setError(null)} action={<Button color="inherit" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Retry loading</Button>}>{error}</Alert>}
    {message && <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert>}


    {/* The previous five-entry catalogue, its Resources/Guides mode switcher and its progress bar
        are superseded by discovery-jobs-spec.md and are deliberately not preserved. */}
    {view !== 'vocabulary'
      ? <DiscoveryJobsTab
          job={view} tags={tags} onDecided={onCountsChanged}
          onOpenJob={(next) => navigateToDiscoveryView(next)}
          onOpenTopicsTab={() => navigateToDiscoveryView('vocabulary')} />
      : <>
        {diagnostic && diagnostic.topicsWithCategory < diagnostic.topicsTotal && (
          <Alert severity="info">
            {diagnostic.itemsWithoutCategory} items have no browse category, because{' '}
            {diagnostic.topicsWithCategory} of {diagnostic.topicsTotal} topics have one. Give a topic a
            category below and everything tagged with it inherits that category.
          </Alert>
        )}
      <Stack direction="row" spacing={2}>
        <TextField size="small" label="Filter tags" value={vocabularyQuery} sx={{ flex: 1 }}
          onChange={(e) => { const value = e.target.value; leave(() => { setVocabularyQuery(value); resetVocabBulk(); }); }} />
        <Button variant="outlined" disabled={busy} onClick={() => editTag({
          id: 0, name: '', tag_kind: 'alias', is_active: true, browse_category: null, canonical_tag_id: null,
        })}>Add synonym</Button>
        <Button variant="contained" disabled={busy} onClick={() => editTag({
          id: 0, name: '', tag_kind: 'topic', is_active: true, browse_category: null, canonical_tag_id: null,
        })}>Add topic</Button>
      </Stack>

      {/* The four browse categories are seeded and fixed — the API refuses to rename them and a
          unique index allows one active row each. Shown as context, not as rows in the tag table,
          where they read as vocabulary you could edit. Same component and colour rule as the
          coverage panel on Homepage browse. */}
      <CategoryCoverage
        dense
        caption="Topics inherit one of four categories:"
        counts={Object.fromEntries(DISCOVERY_CATEGORIES.map((code) => [code,
          tags.filter((tag) => tag.tag_kind === 'topic' && tag.is_active !== false
            && tag.browse_category === code).length]))}
      />

      {/* Group-shaped rather than row-shaped, so it sits above the list rather than inside it. */}
      <DiscoveryDuplicatePanel tags={tags} busy={busy}
        dismissed={dismissedDuplicates}
        onDismiss={signature => void mutate({ operation: 'dismiss_duplicate', signature }, 'Suggestion dismissed for your account. You can restore it below.')}
        onRestore={() => void mutate({ operation: 'restore_duplicates' }, 'Dismissed suggestions restored.')}
        onMerge={(keepId, mergeIds) => setGroupMerge({ keepId, mergeIds })} />

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {vocabFilters.map((entry) => (
          <Chip key={entry.id} label={`${entry.label} ${entry.count}`} size="small"
            variant={vocabFilter === entry.id ? 'filled' : 'outlined'}
            color={vocabFilter === entry.id ? 'primary' : 'default'}
            disabled={!entry.count && entry.id !== 'all'}
            onClick={() => leave(() => { setVocabFilter(entry.id); resetVocabBulk(); })} />
        ))}
      </Stack>

      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell padding="checkbox">
                  <Checkbox inputProps={{ 'aria-label': 'Select every term listed' }} disabled={busy}
                    checked={selectableRows.length > 0 && selectedTagIds.length === selectableRows.length}
                    indeterminate={selectedTagIds.length > 0 && selectedTagIds.length < selectableRows.length}
                    onChange={(e) => setSelectedTagIds(e.target.checked ? selectableRows.map((tag) => tag.id) : [])} />
                </TableCell>
                <TableCell>Tag</TableCell>
                <TableCell sx={{ minWidth: 190 }}>Browse category</TableCell>
                <TableCell align="right">Used by</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {vocabRows.map((tag) => tagRow(tag))}
              {!vocabRows.length && <TableRow>
                <TableCell colSpan={5} sx={{ py: 4, textAlign: 'center' }}>
                  <Typography color="text.secondary">
                    {vocabularyQuery ? 'No tags match that search.' : 'Nothing here — every tag is handled.'}
                  </Typography>
                </TableCell>
              </TableRow>}
            </TableBody>
          </Table>
        </Box>
      </Box>

      <Typography variant="body2" color="text.secondary">
        A <strong>topic</strong> is a subject members search for, and the thing you tag content with.
        A <strong>synonym</strong> is another spelling of a topic — members can search it, but it does not
        appear in the tag picker. A nickname for one specific episode or file belongs in that item&rsquo;s
        alternate names instead. Retiring a term keeps every existing tag in place; it just stops the
        term matching searches and removes it from the picker. Nothing here is ever deleted.
      </Typography>

      <DiscoveryVocabularyBulkBar selectedCount={selectedTagIds.length}
        category={vocabCategory} onCategory={setVocabCategory}
        status={vocabStatus} onStatus={setVocabStatus}
        busy={busy} hasChange={hasVocabChange}
        onApply={() => void applyVocabularyBulk()} onClear={() => leave(resetVocabBulk, bulkDirty)} />
    </>}


    <Dialog open={!!tagEdit} onClose={closeTag} fullWidth maxWidth="sm">
      <DialogTitle>
        {tagEdit?.id ? 'Edit' : 'Add'}{' '}
        {tagEdit?.tag_kind === 'alias' ? 'synonym' : 'topic'}
      </DialogTitle>
      <DialogContent dividers>
        {tagEdit && <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Name" value={tagEdit.name} disabled={busy} inputProps={{ maxLength: 120 }}
            onChange={(e) => setTagEdit({ ...tagEdit, name: e.target.value })} />
          {tagEdit.id === 0 && tagEdit.tag_kind === 'alias' && <Alert severity="info">
            Use this for a word members search that has no tag of its own. To fold together two terms
            that both already exist, use Merge on the one you want to retire.
          </Alert>}
          {tagEdit.tag_kind === 'alias'
            ? <TextField select label="Which topic does this point at?" value={tagEdit.canonical_tag_id ?? ''} disabled={busy}
              helperText="A member searching this word will find everything tagged with the topic you pick here."
              onChange={(e) => setTagEdit({ ...tagEdit, canonical_tag_id: Number(e.target.value) })}>
              {tags.filter((tag) => tag.is_active && tag.tag_kind === 'topic' && tag.id !== tagEdit.id)
                .map((tag) => <MenuItem key={tag.id} value={tag.id}>{tag.name}</MenuItem>)}
            </TextField>
            : <TextField select label="Browse category" value={tagEdit.browse_category ?? ''} disabled={busy}
                helperText="Content tagged with this topic counts as being in that category, so you do not have to add a second tag."
                onChange={(e) => setTagEdit({ ...tagEdit, browse_category: e.target.value || null })}>
                <MenuItem value="">None</MenuItem>
                {categories.map((value) => <MenuItem key={value} value={value}>{DISCOVERY_CATEGORY_LABELS[value]}</MenuItem>)}
              </TextField>}
          <FormControlLabel label="Active" control={<Checkbox checked={!!tagEdit.is_active} disabled={busy}
            onChange={(e) => setTagEdit({ ...tagEdit, is_active: e.target.checked })} />} />
          {tagEdit.is_active === false && <Alert severity="info">
            Assignments are retained, but this term and its aliases stop contributing to search and leave the active picker.
          </Alert>}
        </Stack>}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={closeTag}>Cancel</Button>
        <Button variant="contained" disabled={busy || !tagEdit?.name.trim() || (tagEdit.tag_kind === 'alias' && !tagEdit.canonical_tag_id)} onClick={() => {
          if (tagEdit) void mutate({
            operation: 'save_tag', id: tagEdit.id || null, name: tagEdit.name, kind: tagEdit.tag_kind,
            category: tagEdit.browse_category, canonicalId: tagEdit.canonical_tag_id, active: tagEdit.is_active,
          }, 'Vocabulary saved.', () => setTagEdit(null));
        }}>{busy ? 'Saving…' : tagEdit?.id
          ? 'Save changes'
          : `Add ${tagEdit?.tag_kind === 'alias' ? 'synonym' : 'topic'}`}</Button>
      </DialogActions>
    </Dialog>
    <Dialog open={!!discardAction} onClose={() => setDiscardAction(null)} maxWidth="xs" fullWidth>
      <DialogTitle>Discard unsaved changes?</DialogTitle>
      <DialogContent>Your changes have not been saved. You can keep editing or discard them.</DialogContent>
      <DialogActions>
        <Button onClick={() => setDiscardAction(null)}>Keep editing</Button>
        <Button color="error" onClick={() => { const action = discardAction; setDiscardAction(null); action?.run(); }}>Discard changes</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={!!mergeSource} onClose={() => { if (!busy) setMergeSource(null); }} fullWidth maxWidth="sm">
      <DialogTitle>Merge “{mergeSource?.name}” into another term</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField select label="Which term should be kept?" value={mergeTarget} disabled={busy}
            onChange={(e) => setMergeTarget(e.target.value)}
            helperText="Only active terms of the same kind and browse category can be merged together.">
            {tags.filter((tag) => tag.id !== mergeSource?.id && tag.is_active
              && tag.tag_kind === mergeSource?.tag_kind && tag.browse_category === mergeSource?.browse_category)
              .map((tag) => <MenuItem key={tag.id} value={tag.id}>{tag.name}</MenuItem>)}
          </TextField>
          <MergeExplainer sourceName={mergeSource?.name} targetName={mergeTargetTag?.name} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={() => setMergeSource(null)}>Cancel</Button>
        <Button variant="contained" disabled={busy || !mergeTarget || !mergeSource}
          onClick={() => void mutate({ operation: 'merge_tags', sourceId: mergeSource?.id, targetId: Number(mergeTarget) },
            'Assignments and synonyms merged.', () => setMergeSource(null))}>
          {busy ? 'Merging…' : 'Confirm merge'}
        </Button>
      </DialogActions>
    </Dialog>

    <Dialog open={!!groupMerge} onClose={() => { if (!busy) setGroupMerge(null); }} fullWidth maxWidth="sm">
      <DialogTitle>
        Merge {groupMerge?.mergeIds.length} {groupMerge?.mergeIds.length === 1 ? 'term' : 'terms'} into
        {' '}“{tags.find((tag) => tag.id === groupMerge?.keepId)?.name}”?
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {groupMerge?.mergeIds.map((id) => <Chip key={id} size="small"
              label={tags.find((tag) => tag.id === id)?.name ?? `#${id}`} />)}
          </Stack>
          <MergeExplainer plural targetName={tags.find((tag) => tag.id === groupMerge?.keepId)?.name} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={() => setGroupMerge(null)}>Cancel</Button>
        <Button variant="contained" disabled={busy}
          onClick={() => { if (groupMerge) void mergeGroup(groupMerge.keepId, groupMerge.mergeIds); }}>
          {busy ? 'Merging…' : 'Confirm merge'}
        </Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}
