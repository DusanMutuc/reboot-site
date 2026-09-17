'use client';

import JobATopics from './JobATopics';
import JobBPlacement from './JobBPlacement';
import JobCVisibility from './JobCVisibility';
import JobDBrowse from './JobDBrowse';
import type { JobKey } from './jobDefinitions';
import type { DiscoveryTag } from '@/lib/discoveryAdminTypes';

/**
 * Dispatches to the open job.
 *
 * There is no landing screen and no in-job switcher: the jobs are the tabs, so navigation happens
 * once, in one strip. Which job is open lives in the URL, so a refresh two hundred items into a
 * queue keeps your place and a link can be sent to a colleague.
 */
export default function DiscoveryJobsTab({ job, tags, onDecided, onOpenTopicsTab, onOpenJob }: {
  job: JobKey;
  tags: DiscoveryTag[];
  onDecided: () => void;
  onOpenTopicsTab: () => void;
  onOpenJob: (job: JobKey) => void;
}) {
  if (job === 'topics') {
    return <JobATopics tags={tags} onDecided={onDecided} onOpenTopicsTab={onOpenTopicsTab} />;
  }
  if (job === 'placement') return <JobBPlacement onDecided={onDecided} />;
  if (job === 'visibility') return <JobCVisibility onDecided={onDecided} />;
  return <JobDBrowse onDecided={onDecided} onOpenTopicsTab={onOpenTopicsTab} onOpenJob={onOpenJob} />;
}
