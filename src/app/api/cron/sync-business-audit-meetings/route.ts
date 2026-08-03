import { NextRequest, NextResponse } from 'next/server';

import { syncBusinessAuditMeetings } from '@/lib/businessAuditMeetingSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function validateCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const report = await syncBusinessAuditMeetings();

    if (report.coachScanWarnings.length > 0) {
      console.warn('[business-audit-meeting-sync] Some coach calendars were not scanned.', {
        warnings: report.coachScanWarnings,
      });
    }

    if (report.unmatchedAppointmentIds.length > 0) {
      console.warn(
        '[business-audit-meeting-sync] Some Business Audit appointments could not be matched to exactly one student.',
        { appointmentIds: report.unmatchedAppointmentIds },
      );
    }

    if (report.appointmentsMissingStableId > 0) {
      console.warn(
        '[business-audit-meeting-sync] Some Business Audit appointments had no stable GHL id and were skipped.',
        { count: report.appointmentsMissingStableId },
      );
    }

    if (report.knownAppointmentsNotReconciled.length > 0) {
      console.error(
        '[business-audit-meeting-sync] Existing Business Audit appointments were not returned as valid matches.',
        { appointmentIds: report.knownAppointmentsNotReconciled },
      );
    }

    if (report.implementationCoachScanWarnings.length > 0) {
      console.warn('[business-audit-meeting-sync] Some implementation-coach calendars were not scanned.', {
        warnings: report.implementationCoachScanWarnings,
      });
    }

    if (report.implementationUnmatchedAppointmentIds.length > 0) {
      console.warn(
        '[business-audit-meeting-sync] Some Implementation appointments could not be matched to exactly one student.',
        { appointmentIds: report.implementationUnmatchedAppointmentIds },
      );
    }

    if (report.implementationAppointmentsMissingStableId > 0) {
      console.warn(
        '[business-audit-meeting-sync] Some Implementation appointments had no stable GHL id and were skipped.',
        { count: report.implementationAppointmentsMissingStableId },
      );
    }

    if (report.implementationKnownAppointmentsNotReconciled.length > 0) {
      console.error(
        '[business-audit-meeting-sync] Existing Implementation appointments were not returned as valid matches.',
        { appointmentIds: report.implementationKnownAppointmentsNotReconciled },
      );
    }

    if (report.failures.length > 0) {
      console.error('[business-audit-meeting-sync] Some appointments failed to sync.', {
        failures: report.failures,
      });
      return NextResponse.json({ ok: false, ...report }, { status: 500 });
    }

    if (report.implementationFailures.length > 0) {
      console.error('[business-audit-meeting-sync] Some Implementation appointments failed to sync.', {
        failures: report.implementationFailures,
      });
      return NextResponse.json({ ok: false, ...report }, { status: 500 });
    }

    const partial =
        report.coachScanWarnings.length > 0 ||
        report.unmatchedAppointmentIds.length > 0 ||
        report.appointmentsMissingStableId > 0 ||
        report.knownAppointmentsNotReconciled.length > 0 ||
        report.implementationCoachScanWarnings.length > 0 ||
        report.implementationUnmatchedAppointmentIds.length > 0 ||
        report.implementationAppointmentsMissingStableId > 0 ||
        report.implementationKnownAppointmentsNotReconciled.length > 0;

    return NextResponse.json(
      {
        ok: !partial,
        partial,
        ...report,
      },
      { status: partial ? 503 : 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected synchronization error.';
    console.error('[business-audit-meeting-sync] Job failed.', { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
