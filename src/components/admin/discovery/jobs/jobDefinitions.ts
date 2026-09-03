import type { DiscoveryJobCounts } from '@/lib/discoveryJobsClient';

export type JobId = 'topics' | 'placement' | 'visibility' | 'browse';
export type JobKey = JobId;

export type JobDefinition = {
  id: JobKey;
  title: string;
  line: string;
  /** False while a job is listed for visibility but has no screen yet. */
  available: boolean;
  /** An ongoing collection rather than a queue that empties. */
  ongoing?: boolean;
  /** Only where a bare number means nothing on its own. */
  countLabel?: string;
};

/**
 * One definition per job, shared by the worklist and the in-job switcher so the two can never
 * disagree about a name or a count.
 */
export const JOB_DEFINITIONS: JobDefinition[] = [
  {
    id: 'topics',
    title: 'Assign topics',
    line: 'Choose the topics that describe each item.',
    available: true,
  },
  {
    id: 'placement',
    title: 'Check standalone use',
    line: 'Some resources only make sense next to their lesson.',
    available: true,
  },
  {
    id: 'visibility',
    // Not "Review hidden": nothing here was necessarily hidden on purpose. is_discoverable
    // defaults to false, so content arrives un-findable and stays that way until someone says
    // otherwise. The name has to describe the state, not imply an intent nobody had.
    title: 'Not in search yet',
    line: 'Content that exists, but nobody has said whether members can find it.',
    available: true,
  },
  {
    id: 'browse',
    title: 'Homepage browse',
    line: 'Choose what members see when they browse.',
    available: true,
    ongoing: true,
    countLabel: 'on the homepage',
  },
];

export function jobCount(counts: DiscoveryJobCounts | null, id: JobKey): number {
  if (!counts) return 0;
  if (id === 'topics') return counts.topics.needs;
  if (id === 'placement') return counts.placement.needs;
  if (id === 'visibility') return counts.visibility.needs;
  return counts.browse.approved;
}

export function jobTitle(id: JobKey): string {
  return JOB_DEFINITIONS.find((job) => job.id === id)?.title ?? id;
}
