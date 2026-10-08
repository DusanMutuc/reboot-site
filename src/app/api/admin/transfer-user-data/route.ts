// app/api/admin/transfer-user-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { invalidateAdminUserDirectory } from '@/lib/adminUserDirectory';
import { resolveGhlContactIdByEmail } from '@/lib/ghlContactLookup';

type TransferOptions = {
  dry_run?: boolean;
  // Backend semantics:
  //  - 'skip'          => KPI tables untouched
  //  - 'prefer_source' => overwrite dest KPI with source KPI (source intact)
  kpi_merge?: 'skip' | 'prefer_source';
  smart_doc_conflict?: 'keep_latest_submitted' | 'keep_dest' | 'keep_source';
  reassign_authorship?: boolean;
  request_id?: string;
};

type Body = {
  source: string;
  dest: string;
  options?: TransferOptions;
};

function databaseErrorResponse(error: { code?: string; message: string }) {
  if (error.code === 'PGRST202' || error.code === '42883') {
    return NextResponse.json({ error: 'The account-transfer database update must be installed before transfers can run.' }, { status: 503 });
  }
  return NextResponse.json({ error: error.message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.res;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const { source, dest, options } = body || {};
  if (typeof source !== 'string' || typeof dest !== 'string' ||
      !uuid.test(source) || !uuid.test(dest) || source.toLowerCase() === dest.toLowerCase()) {
    return NextResponse.json({ error: 'Invalid source/dest' }, { status: 400 });
  }

  if (options !== undefined && (!options || typeof options !== 'object' || Array.isArray(options))) {
    return NextResponse.json({ error: 'Invalid transfer options' }, { status: 400 });
  }
  const allowedOptions = new Set(['dry_run', 'kpi_merge', 'smart_doc_conflict', 'reassign_authorship', 'request_id']);
  if (Object.keys(options ?? {}).some((key) => !allowedOptions.has(key)) ||
      (options?.dry_run !== undefined && typeof options.dry_run !== 'boolean') ||
      (options?.reassign_authorship !== undefined && typeof options.reassign_authorship !== 'boolean') ||
      (options?.kpi_merge !== undefined && !['skip', 'prefer_source'].includes(options.kpi_merge)) ||
      (options?.smart_doc_conflict !== undefined && !['keep_latest_submitted', 'keep_dest', 'keep_source'].includes(options.smart_doc_conflict)) ||
      (options?.request_id !== undefined && (typeof options.request_id !== 'string' || !uuid.test(options.request_id)))) {
    return NextResponse.json({ error: 'Invalid transfer options' }, { status: 400 });
  }

  // Only the server can supply the destination email/contact identity to SQL.
  const opts = {
    dry_run: options?.dry_run ?? true,
    kpi_merge: options?.kpi_merge ?? 'prefer_source',
    smart_doc_conflict: options?.smart_doc_conflict ?? 'keep_latest_submitted',
    reassign_authorship: options?.reassign_authorship ?? false,
    ...(options?.request_id ? { request_id: options.request_id.toLowerCase() } : {}),
  };
  if (!opts.dry_run && !opts.request_id) {
    return NextResponse.json({ error: 'A request ID is required for a retry-safe live transfer.' }, { status: 400 });
  }

  const supa = getAdminClient();
  if (!opts.dry_run) {
    // A committed attempt must remain recoverable even when Auth/GHL changed or
    // became unavailable after its response was lost. SQL validates the original
    // accounts and copy options before returning the protected audit result.
    const { data: completed, error: replayError } = await supa.rpc('get_account_transfer_result_v2', {
      _source: source, _dest: dest, _options: opts,
    });
    if (replayError) return databaseErrorResponse(replayError);
    if (completed !== null) {
      if (!completed || typeof completed !== 'object' || Array.isArray(completed) || completed.dry_run !== false) {
        return NextResponse.json({ error: 'The saved transfer result could not be verified. Retry this same attempt.' }, { status: 502 });
      }
      invalidateAdminUserDirectory();
      return NextResponse.json(completed);
    }
  }
  const { data: destination, error: identityError } = await supa.auth.admin.getUserById(dest);
  if (identityError || !destination?.user) {
    return NextResponse.json({ error: 'Could not load the destination account.' }, { status: identityError?.status === 404 ? 404 : 502 });
  }
  const destinationEmail = destination.user.email?.trim().toLowerCase();
  if (!destinationEmail) {
    return NextResponse.json({ error: 'The destination account needs an email before data can be transferred.' }, { status: 409 });
  }
  const contact = await resolveGhlContactIdByEmail(destinationEmail);
  if (!contact.ok) {
    return NextResponse.json({ error: contact.error }, { status: contact.status });
  }

  // Versioned RPC prevents an older database from ignoring GHL/retry requirements.
  const { data, error } = await supa.rpc('transfer_user_data_admin_v2', {
    _source: source,
    _dest: dest,
    _options: { ...opts, destination_email: destinationEmail, destination_ghl_contact_id: contact.contactId },
  });

  if (error) return databaseErrorResponse(error);

  if (!data || typeof data !== 'object' || Array.isArray(data) || data.dry_run !== opts.dry_run) {
    return NextResponse.json({ error: 'The transfer returned no valid result. Retry this same attempt to check its outcome.' }, { status: 502 });
  }
  if (!opts.dry_run) invalidateAdminUserDirectory();
  return NextResponse.json(data);
}
