import { DateTime, IANAZone } from 'luxon';

import {
  BUSINESS_AUDIT_SYNC_FROM,
  BUSINESS_AUDIT_TIMEZONE,
} from '@/lib/businessAuditConfig';
import {
  findBusinessAuditAppointmentsForSync,
  findImplementationAppointmentsForSync,
  type GhlCoachingAppointment,
} from '@/lib/bookingFollowUp';
import { getAdminClient } from '@/lib/supabaseAdmin';

const DEFAULT_LOOKBACK_DAYS = 7;
const DEFAULT_FUTURE_DAYS = 180;
const DATABASE_WRITE_CONCURRENCY = 4;

type BusinessAuditSyncRpcRow = {
  meeting_id: number | string | null;
  business_review_id: number | string | null;
  meeting_created: boolean;
  business_review_created: boolean;
  skipped_cancelled: boolean;
};

type ImplementationSyncRpcRow = {
  meeting_id: number | string | null;
  meeting_created: boolean;
  skipped_cancelled: boolean;
};

export type BusinessAuditMeetingSyncFailure = {
  appointmentId: string;
  message: string;
};

export type BusinessAuditMeetingSyncReport = {
  generatedAt: string;
  range: {
    start: string;
    end: string;
    timezone: string;
  };
  matchedAppointments: number;
  activeAppointments: number;
  cancelledAppointments: number;
  meetingsCreated: number;
  meetingsUpdated: number;
  businessReviewsCreated: number;
  cancelledMeetingsUpdated: number;
  cancelledAppointmentsSkipped: number;
  coachScanWarnings: Array<{ coachId: string; message: string }>;
  unmatchedAppointmentIds: string[];
  appointmentsMissingStableId: number;
  knownAppointmentsNotReconciled: string[];
  failures: BusinessAuditMeetingSyncFailure[];
  implementationMatchedAppointments: number;
  implementationActiveAppointments: number;
  implementationCancelledAppointments: number;
  implementationMeetingsCreated: number;
  implementationMeetingsUpdated: number;
  implementationCancelledMeetingsUpdated: number;
  implementationCancelledAppointmentsSkipped: number;
  implementationCoachScanWarnings: Array<{ coachId: string; message: string }>;
  implementationUnmatchedAppointmentIds: string[];
  implementationAppointmentsMissingStableId: number;
  implementationKnownAppointmentsNotReconciled: string[];
  implementationFailures: BusinessAuditMeetingSyncFailure[];
};

type SyncWindow = {
  startMs: number;
  endMs: number;
  startIso: string;
  endIso: string;
  timezone: string;
};

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive whole number.`);
  }
  return parsed;
}

function getSyncWindow(now = DateTime.utc()): SyncWindow {
  const cutoff = DateTime.fromISO(BUSINESS_AUDIT_SYNC_FROM, { setZone: true });
  if (!cutoff.isValid) {
    throw new Error('The Business Audit synchronization cutoff is invalid.');
  }

  if (!IANAZone.isValidZone(BUSINESS_AUDIT_TIMEZONE)) {
    throw new Error('The Business Audit synchronization timezone is invalid.');
  }

  const lookbackDays = readPositiveInteger(
    'GHL_MEETING_SYNC_LOOKBACK_DAYS',
    DEFAULT_LOOKBACK_DAYS,
  );
  const futureDays = readPositiveInteger(
    'GHL_MEETING_SYNC_FUTURE_DAYS',
    DEFAULT_FUTURE_DAYS,
  );
  const rollingStart = now.minus({ days: lookbackDays });
  const start = cutoff.toUTC() > rollingStart ? cutoff.toUTC() : rollingStart;
  const end = now.plus({ days: futureDays });

  if (start >= end) {
    throw new Error('The Business Audit synchronization cutoff must be before the window end.');
  }

  return {
    startMs: start.toMillis(),
    endMs: end.toMillis(),
    startIso: start.toISO()!,
    endIso: end.toISO()!,
    timezone: BUSINESS_AUDIT_TIMEZONE,
  };
}

function isCancelledAppointment(appointment: GhlCoachingAppointment): boolean {
  if (appointment.deleted) return true;
  if (!appointment.status) return false;

  const normalized = appointment.status.toLowerCase().replace(/[\s_-]+/g, '');
  return ['cancelled', 'canceled', 'deleted', 'invalid', 'noshow'].includes(normalized);
}

function resolveMeetingTimezone(
  appointment: GhlCoachingAppointment,
  fallbackTimezone: string,
): string {
  const appointmentTimezone = appointment.timezone?.trim();
  return appointmentTimezone && IANAZone.isValidZone(appointmentTimezone)
    ? appointmentTimezone
    : fallbackTimezone;
}

function getReviewDate(start: string, timezone: string): string {
  const date = DateTime.fromISO(start, { setZone: true }).setZone(timezone);
  if (!date.isValid) {
    throw new Error('The GHL appointment has an invalid start time.');
  }

  const isoDate = date.toISODate();
  if (!isoDate) {
    throw new Error('The GHL appointment date could not be derived.');
  }
  return isoDate;
}

async function loadKnownAppointmentIds(
  meetingTypeCode: 'M2_MEETING' | 'IMPLEMENTATION_MEETING',
  window: SyncWindow,
): Promise<string[]> {
  const admin = getAdminClient();
  const { data: meetingType, error: meetingTypeError } = await admin
    .from('meeting_types')
    .select('id')
    .eq('code', meetingTypeCode)
    .maybeSingle();

  if (meetingTypeError) throw new Error(meetingTypeError.message);
  if (!meetingType) throw new Error(`The ${meetingTypeCode} meeting type was not found.`);

  const { data, error } = await admin
    .from('meetings')
    .select('ghl_appointment_id')
    .eq('meeting_type_id', meetingType.id)
    .not('ghl_appointment_id', 'is', null)
    .gte('starts_at', window.startIso)
    .lte('starts_at', window.endIso);

  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => row.ghl_appointment_id)
    .filter((appointmentId): appointmentId is string => Boolean(appointmentId));
}

async function syncBusinessAuditAppointment(
  appointment: GhlCoachingAppointment,
  fallbackTimezone: string,
): Promise<BusinessAuditSyncRpcRow> {
  const admin = getAdminClient();
  const meetingTimezone = resolveMeetingTimezone(appointment, fallbackTimezone);
  const { data, error } = await admin.rpc('sync_business_audit_appointment', {
    _ghl_appointment_id: appointment.id,
    _ghl_calendar_id: appointment.calendarId,
    _starts_at: appointment.start,
    _ends_at: appointment.end,
    _meeting_timezone: meetingTimezone,
    _ghl_status: appointment.status,
    _title: appointment.title,
    _student_id: appointment.studentId,
    _coach_id: appointment.coachId,
    _review_date: getReviewDate(appointment.start, meetingTimezone),
    _is_cancelled: isCancelledAppointment(appointment),
  });

  if (error) {
    const missingMigration =
      error.code === 'PGRST202' ||
      error.message.includes('schema cache') ||
      error.message.includes('sync_business_audit_appointment');
    throw new Error(
      missingMigration
        ? 'The GHL Business Audit meeting migration has not been installed yet.'
        : error.message,
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as BusinessAuditSyncRpcRow | null;
  if (!row) {
    throw new Error('The meeting synchronization RPC returned no result.');
  }
  return row;
}

async function syncImplementationAppointment(
  appointment: GhlCoachingAppointment,
  fallbackTimezone: string,
): Promise<ImplementationSyncRpcRow> {
  const admin = getAdminClient();
  const meetingTimezone = resolveMeetingTimezone(appointment, fallbackTimezone);
  const { data, error } = await admin.rpc('sync_implementation_appointment_v2', {
    _ghl_appointment_id: appointment.id,
    _ghl_calendar_id: appointment.calendarId,
    _starts_at: appointment.start,
    _ends_at: appointment.end,
    _meeting_timezone: meetingTimezone,
    _ghl_status: appointment.status,
    _title: appointment.title,
    _student_id: appointment.studentId,
    _coach_id: appointment.coachId,
    _meeting_date: getReviewDate(appointment.start, meetingTimezone),
    _is_cancelled: isCancelledAppointment(appointment),
  });

  if (error) {
    const missingMigration =
      error.code === 'PGRST202' ||
      error.message.includes('schema cache') ||
      error.message.includes('sync_implementation_appointment_v2');
    throw new Error(
      missingMigration
        ? 'The hardened GHL Implementation meeting migration has not been installed yet.'
        : error.message,
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as ImplementationSyncRpcRow | null;
  if (!row) {
    throw new Error('The Implementation meeting synchronization RPC returned no result.');
  }
  return row;
}

export async function syncBusinessAuditMeetings(): Promise<BusinessAuditMeetingSyncReport> {
  const window = getSyncWindow();
  const [scan, implementationScan, knownBusinessIds, knownImplementationIds] = await Promise.all([
    findBusinessAuditAppointmentsForSync({
      startMs: window.startMs,
      endMs: window.endMs,
    }),
    findImplementationAppointmentsForSync({
      startMs: window.startMs,
      endMs: window.endMs,
    }),
    loadKnownAppointmentIds('M2_MEETING', window),
    loadKnownAppointmentIds('IMPLEMENTATION_MEETING', window),
  ]);
  const matchedBusinessIds = new Set(scan.appointments.map((appointment) => appointment.id));
  const matchedImplementationIds = new Set(
    implementationScan.appointments.map((appointment) => appointment.id),
  );
  const knownAppointmentsNotReconciled = knownBusinessIds.filter(
    (appointmentId) => !matchedBusinessIds.has(appointmentId),
  );
  const implementationKnownAppointmentsNotReconciled = knownImplementationIds.filter(
    (appointmentId) => !matchedImplementationIds.has(appointmentId),
  );
  const outcomes = await mapWithConcurrency(
    scan.appointments,
    DATABASE_WRITE_CONCURRENCY,
    async (appointment) => {
      try {
        return {
          appointment,
          result: await syncBusinessAuditAppointment(appointment, window.timezone),
          error: null,
        };
      } catch (error) {
        return {
          appointment,
          result: null,
          error: error instanceof Error ? error.message : 'Unexpected synchronization error.',
        };
      }
    },
  );
  const implementationOutcomes = await mapWithConcurrency(
    implementationScan.appointments,
    DATABASE_WRITE_CONCURRENCY,
    async (appointment) => {
      try {
        return {
          appointment,
          result: await syncImplementationAppointment(appointment, window.timezone),
          error: null,
        };
      } catch (error) {
        return {
          appointment,
          result: null,
          error: error instanceof Error ? error.message : 'Unexpected synchronization error.',
        };
      }
    },
  );

  const successful = outcomes.filter(
    (outcome): outcome is typeof outcome & { result: BusinessAuditSyncRpcRow; error: null } =>
      outcome.result !== null,
  );
  const implementationSuccessful = implementationOutcomes.filter(
    (
      outcome,
    ): outcome is typeof outcome & { result: ImplementationSyncRpcRow; error: null } =>
      outcome.result !== null,
  );
  const activeAppointments = scan.appointments.filter(
    (appointment) => !isCancelledAppointment(appointment),
  ).length;
  const cancelledAppointments = scan.appointments.length - activeAppointments;
  const implementationActiveAppointments = implementationScan.appointments.filter(
    (appointment) => !isCancelledAppointment(appointment),
  ).length;
  const implementationCancelledAppointments =
    implementationScan.appointments.length - implementationActiveAppointments;

  return {
    generatedAt: new Date().toISOString(),
    range: {
      start: window.startIso,
      end: window.endIso,
      timezone: window.timezone,
    },
    matchedAppointments: scan.appointments.length,
    activeAppointments,
    cancelledAppointments,
    meetingsCreated: successful.filter((outcome) => outcome.result.meeting_created).length,
    meetingsUpdated: successful.filter(
      (outcome) =>
        !outcome.result.meeting_created &&
        !outcome.result.skipped_cancelled &&
        !isCancelledAppointment(outcome.appointment),
    ).length,
    businessReviewsCreated: successful.filter(
      (outcome) => outcome.result.business_review_created,
    ).length,
    cancelledMeetingsUpdated: successful.filter(
      (outcome) =>
        isCancelledAppointment(outcome.appointment) && !outcome.result.skipped_cancelled,
    ).length,
    cancelledAppointmentsSkipped: successful.filter(
      (outcome) => outcome.result.skipped_cancelled,
    ).length,
    coachScanWarnings: scan.coachScanWarnings,
    unmatchedAppointmentIds: scan.unmatchedAppointmentIds,
    appointmentsMissingStableId: scan.appointmentsMissingStableId,
    knownAppointmentsNotReconciled,
    failures: outcomes.flatMap((outcome) =>
      outcome.error
        ? [{ appointmentId: outcome.appointment.id, message: outcome.error }]
        : [],
    ),
    implementationMatchedAppointments: implementationScan.appointments.length,
    implementationActiveAppointments,
    implementationCancelledAppointments,
    implementationMeetingsCreated: implementationSuccessful.filter(
      (outcome) => outcome.result.meeting_created,
    ).length,
    implementationMeetingsUpdated: implementationSuccessful.filter(
      (outcome) =>
        !outcome.result.meeting_created &&
        !outcome.result.skipped_cancelled &&
        !isCancelledAppointment(outcome.appointment),
    ).length,
    implementationCancelledMeetingsUpdated: implementationSuccessful.filter(
      (outcome) =>
        isCancelledAppointment(outcome.appointment) && !outcome.result.skipped_cancelled,
    ).length,
    implementationCancelledAppointmentsSkipped: implementationSuccessful.filter(
      (outcome) => outcome.result.skipped_cancelled,
    ).length,
    implementationCoachScanWarnings: implementationScan.coachScanWarnings,
    implementationUnmatchedAppointmentIds: implementationScan.unmatchedAppointmentIds,
    implementationAppointmentsMissingStableId:
      implementationScan.appointmentsMissingStableId,
    implementationKnownAppointmentsNotReconciled,
    implementationFailures: implementationOutcomes.flatMap((outcome) =>
      outcome.error
        ? [{ appointmentId: outcome.appointment.id, message: outcome.error }]
        : [],
    ),
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}
