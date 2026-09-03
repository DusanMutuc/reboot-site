'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Collapse, Divider, Paper, Stack,
  TextField, Typography,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';

import { navigateWithDiscoveryGuard } from '@/lib/discoveryAdminNavigation';
import type {
  FindContentResult,
  SearchDiagnosticResult,
  SearchInvestigationGroup,
} from '@/lib/discoveryRemainingTypes';
import { JobHeading } from './jobs/JobHeading';

type MemberOption = { id: string; name: string; email: string };
type Diagnosis = {
  results: SearchDiagnosticResult[];
  target: { kind: 'resource' | 'node'; id: number; title: string; mediaType: string; searchNames: string[] };
  finding: string;
  correction: 'publish' | 'visibility' | 'placement' | 'access' | 'alternate_name' | 'ranking' | 'none';
  position: number | null;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'Search diagnosis failed.');
  return body;
}

function typeLabel(value: string) {
  const labels: Record<string, string> = { lesson: 'Library guide', course: 'Course', video: 'Video', podcast: 'Podcast', pdf: 'PDF', document: 'Document', audio: 'Audio', image: 'Image', link: 'Link' };
  return labels[value.toLowerCase()] ?? value;
}

const SECTION_COPY: Record<SearchInvestigationGroup['section'], { title: string; note: string }> = {
  empty: { title: 'Found nothing', note: 'The displayed search returned no matching items.' },
  rephrased: { title: 'Kept rephrasing', note: 'They tried at least three query changes and opened nothing. This shows difficulty, not which phrase was wrong.' },
  no_open: { title: 'Nothing opened', note: 'Nothing was opened within ten minutes. This is a weak signal, not proof the results were bad.' },
};

export default function FixSearchAdmin() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [member, setMember] = useState<MemberOption | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [results, setResults] = useState<SearchDiagnosticResult[]>([]);
  const [investigations, setInvestigations] = useState<SearchInvestigationGroup[]>([]);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [targetQuery, setTargetQuery] = useState('');
  const [targets, setTargets] = useState<FindContentResult[]>([]);
  const [target, setTarget] = useState<FindContentResult | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [alternateName, setAlternateName] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingInvestigations, setLoadingInvestigations] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedJourney, setExpandedJourney] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch('/api/admin/discovery/search?view=members', { signal: controller.signal }).then((response) => readJson<{ members: MemberOption[] }>(response)),
      fetch('/api/admin/discovery/search?view=investigations', { signal: controller.signal }).then((response) => readJson<{ groups: SearchInvestigationGroup[] }>(response)),
    ]).then(([memberPayload, investigationPayload]) => {
      if (controller.signal.aborted) return;
      setMembers(memberPayload.members); setInvestigations(investigationPayload.groups);
    }).catch((loadError) => { if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Could not load search data.'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingInvestigations(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (query.trim().length < 2) { setResults([]); setDiagnosis(null); return; }
      setBusy(true); setError(null); setMessage(null);
      try {
        const payload = await readJson<{ results: SearchDiagnosticResult[] }>(await fetch('/api/admin/discovery/search', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ operation: 'search', query: query.trim(), memberId: member?.id ?? null }),
        }));
        if (!controller.signal.aborted) { setResults(payload.results); setDiagnosis(null); setTarget(null); }
      } catch (loadError) { if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Search failed.'); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }, 300);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [member, query]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (!showTargetPicker || !targetQuery.trim()) { setTargets([]); return; }
      void fetch(`/api/admin/discovery/find?q=${encodeURIComponent(targetQuery.trim())}`, { signal: controller.signal })
        .then((response) => readJson<{ items: FindContentResult[] }>(response))
        .then((payload) => { if (!controller.signal.aborted) setTargets(payload.items); })
        .catch((loadError) => { if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Could not find that item.'); });
    }, 220);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [showTargetPicker, targetQuery]);

  async function diagnose(selected: FindContentResult) {
    setTarget(selected); setBusy(true); setError(null); setMessage(null);
    try {
      const payload = await readJson<Diagnosis>(await fetch('/api/admin/discovery/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'diagnose', query: query.trim(), kind: selected.kind, id: selected.id, memberId: member?.id ?? null }),
      }));
      setDiagnosis(payload); setResults(payload.results); setAlternateName(query.trim());
    } catch (diagnoseError) { setError(diagnoseError instanceof Error ? diagnoseError.message : 'Diagnosis failed.'); }
    finally { setBusy(false); }
  }

  async function saveAlternateName() {
    if (!target || !alternateName.trim()) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const payload = await readJson<Diagnosis & { saved: boolean }>(await fetch('/api/admin/discovery/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'add_alternate_name', query: query.trim(), kind: target.kind, id: target.id, name: alternateName.trim(), memberId: member?.id ?? null }),
      }));
      setDiagnosis(payload); setResults(payload.results);
      setMessage(payload.position ? `Saved. It is now returned at position ${payload.position}.` : 'Saved, but this still does not return the intended item.');
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Could not save that alternate name.'); }
    finally { setBusy(false); }
  }

  const bySection = useMemo(() => (['empty', 'rephrased', 'no_open'] as const).map((section) => ({ section, groups: investigations.filter((group) => group.section === section) })), [investigations]);
  const navigate = (href: string) => navigateWithDiscoveryGuard(() => router.push(href));

  return (
    <Stack gap={2.5}>
      <JobHeading title="Fix a search" help="search">Reproduce what members receive, name what they should have found, and fix the cause only when discovery wording is the cause.</JobHeading>
      {error ? <Alert severity="error" onClose={() => setError(null)}>{error}</Alert> : null}
      {message ? <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert> : null}
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} alignItems={{ md: 'center' }}>
          <TextField fullWidth size="small" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What did they search for?"
            InputProps={{ startAdornment: <SearchRoundedIcon sx={{ mr: 1, color: 'text.disabled' }} /> }} />
          <Autocomplete<MemberOption> sx={{ minWidth: { md: 330 } }} size="small" options={members} value={member}
            onChange={(_, value) => setMember(value)} getOptionLabel={(option) => `${option.name} · ${option.email}`}
            renderInput={(params) => <TextField {...params} placeholder="General published results" InputProps={{ ...params.InputProps, startAdornment: <><PersonOutlineRoundedIcon sx={{ ml: 0.5, mr: 0.75, color: 'text.disabled' }} />{params.InputProps.startAdornment}</> }} />} />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          {member ? `Showing what ${member.name} can access. This admin test is not recorded as member activity.` : 'Showing general published discovery results. Access can vary by member.'}
        </Typography>
      </Paper>

      {!query.trim() ? (
        <Stack gap={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline"><Typography variant="h6" sx={{ fontWeight: 700 }}>Searches worth a look</Typography><Typography variant="body2" color="text.secondary">Last 90 days</Typography></Stack>
          {loadingInvestigations ? <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress size={24} /></Stack> : null}
          {!loadingInvestigations && !investigations.length ? <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">There are no completed search journeys worth investigating yet.</Typography></Paper> : null}
          {bySection.map(({ section, groups }) => groups.length ? <Paper key={section} variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.5, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}><Typography sx={{ fontWeight: 700 }}>{SECTION_COPY[section].title}</Typography><Typography variant="caption" color="text.secondary">{SECTION_COPY[section].note}</Typography></Box>
            {groups.map((group) => <Box key={`${section}:${group.query}`} sx={{ borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
              <Stack direction="row" alignItems="center" gap={2} sx={{ px: 2, py: 1.25 }}>
                <Button variant="text" sx={{ p: 0, minWidth: 0, justifyContent: 'flex-start', textTransform: 'none', fontWeight: 700 }} onClick={() => setQuery(group.query)}>“{group.query}”</Button>
                <Box sx={{ flex: 1 }} />
                <Typography variant="body2" color="text.secondary">{group.distinctMembers} {group.distinctMembers === 1 ? 'member' : 'members'} · {group.timesSeen} {group.timesSeen === 1 ? 'journey' : 'journeys'}</Typography>
                <Button size="small" onClick={() => setExpandedJourney(expandedJourney === `${section}:${group.query}` ? null : `${section}:${group.query}`)}>Details</Button>
              </Stack>
              <Collapse in={expandedJourney === `${section}:${group.query}`}>
                <Stack divider={<Divider />} sx={{ px: 2, pb: 1.5 }}>
                  {group.journeys.map((journey) => <Box key={journey.logicalSearchId} sx={{ py: 1.25 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{journey.memberName}{journey.memberEmail ? ` · ${journey.memberEmail}` : ''}</Typography>
                    <Typography variant="caption" color="text.secondary">{journey.chain.map((step) => `“${step.query}”`).join(' → ')} · {new Date(journey.lastSeenAt).toLocaleString()}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{journey.delivered.length ? `Shown: ${journey.delivered.map((item) => item.title).join(', ')}` : 'No items delivered'}{journey.opens.length ? ` · Opened ${journey.opens.map((open) => open.key).join(', ')}` : ' · Nothing opened'}</Typography>
                    {!journey.currentVersion ? <Chip size="small" variant="outlined" label="Older search engine" sx={{ mt: 0.75 }} /> : null}
                  </Box>)}
                </Stack>
              </Collapse>
            </Box>)}
          </Paper> : null)}
        </Stack>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(560px, 1fr) minmax(340px, 0.52fr)' }, gap: 2, alignItems: 'start' }}>
          <Paper variant="outlined" sx={{ overflow: 'hidden', minHeight: 440 }}>
            <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}><Typography sx={{ fontWeight: 700 }}>Results members receive</Typography></Box>
            {busy && !results.length ? <Stack alignItems="center" sx={{ py: 8 }}><CircularProgress size={24} /></Stack> : null}
            {!busy && !results.length ? <Typography color="text.secondary" sx={{ p: 4 }}>No results.</Typography> : null}
            {results.map((result) => <Stack key={`${result.kind}:${result.id}`} direction="row" gap={1.25} alignItems="center" sx={{ px: 2, py: 1.15, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" color="text.secondary" sx={{ width: 28, fontVariantNumeric: 'tabular-nums' }}>{result.position}</Typography><Chip size="small" variant="outlined" label={typeLabel(result.mediaType)} /><Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>{result.title}</Typography>{result.accessVaries ? <Chip size="small" label="Access varies" /> : null}
            </Stack>)}
            <Box sx={{ p: 2 }}><Button variant="outlined" onClick={() => setShowTargetPicker((value) => !value)}>None of these are right</Button></Box>
            <Collapse in={showTargetPicker}>
              <Box sx={{ px: 2, pb: 2 }}>
                <TextField fullWidth size="small" value={targetQuery} onChange={(event) => setTargetQuery(event.target.value)} placeholder="What should they have found?" />
                <Paper variant="outlined" sx={{ mt: 1, maxHeight: 250, overflowY: 'auto' }}>
                  {targets.map((item) => <Box
                    key={`${item.kind}:${item.id}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Diagnose ${item.title}`}
                    onClick={() => void diagnose(item)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      void diagnose(item);
                    }}
                    sx={{ px: 1.5, py: 1, cursor: 'pointer', borderBottom: '1px solid', borderColor: 'divider', '&:hover, &:focus-visible': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } }}
                  ><Typography variant="body2" sx={{ fontWeight: 600 }}>{item.title}</Typography><Typography variant="caption" color={item.ineligibleReason ? 'warning.dark' : 'text.secondary'}>{typeLabel(item.mediaType)} · {item.kind}:{item.id}{item.ineligibleReason ? ` · ${item.ineligibleReason}` : ''}</Typography></Box>)}
                </Paper>
              </Box>
            </Collapse>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2.25, minHeight: 440 }}>
            {!diagnosis ? <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>Choose what the member should have found to diagnose the miss.</Typography> : <Stack gap={2}>
              <Box><Chip size="small" label={typeLabel(diagnosis.target.mediaType)} /><Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>{diagnosis.target.title}</Typography></Box>
              <Alert severity={diagnosis.correction === 'alternate_name' ? 'warning' : diagnosis.correction === 'none' ? 'success' : 'info'}>{diagnosis.finding}</Alert>
              {diagnosis.correction === 'alternate_name' ? <Stack gap={1}><Typography variant="body2" sx={{ fontWeight: 600 }}>Add an alternate name</Typography><TextField size="small" value={alternateName} onChange={(event) => setAlternateName(event.target.value)} helperText="This belongs only to this item; it does not change the topic vocabulary." /><Button variant="contained" disabled={busy || !alternateName.trim()} onClick={() => void saveAlternateName()}>Save and run the search again</Button><Button onClick={() => navigate(`/admin/discovery-topics?item=${diagnosis.target.kind}:${diagnosis.target.id}`)}>Assign a topic instead</Button></Stack> : null}
              {diagnosis.correction === 'publish' ? <Button variant="contained" onClick={() => navigate(diagnosis.target.kind === 'resource' ? '/admin/resource-library' : diagnosis.target.mediaType === 'course' ? `/admin/course-builder?node=${diagnosis.target.id}` : `/admin/library-editor?node=${diagnosis.target.id}`)}>Open the content editor</Button> : null}
              {diagnosis.correction === 'visibility' ? <Button variant="contained" onClick={() => navigate(`/admin/discovery-hidden?item=${diagnosis.target.kind}:${diagnosis.target.id}`)}>Review search visibility</Button> : null}
              {diagnosis.correction === 'placement' ? <Button variant="outlined" onClick={() => navigate(`/admin/discovery-find?item=${diagnosis.target.kind}:${diagnosis.target.id}`)}>View the standalone-use decision</Button> : null}
              {(diagnosis.correction === 'access' || diagnosis.correction === 'ranking' || diagnosis.correction === 'none') ? <Typography variant="body2" color="text.secondary">There is no vocabulary correction to apply here.</Typography> : null}
            </Stack>}
          </Paper>
        </Box>
      )}
    </Stack>
  );
}
