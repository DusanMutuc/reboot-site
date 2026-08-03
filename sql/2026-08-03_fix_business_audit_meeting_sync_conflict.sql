-- Repairs the already-installed Business Audit appointment synchronization RPC.
--
-- Its RETURNS TABLE declaration exposes `meeting_id` as a PL/pgSQL variable.
-- The original attendance upsert also named `meeting_id` in its ON CONFLICT
-- target, so PostgreSQL rejected the statement as ambiguous before inserting
-- any meeting data.

do $repair$
declare
  _function_signature regprocedure := to_regprocedure(
    'public.sync_business_audit_appointment(text,text,timestamptz,timestamptz,text,text,text,uuid,uuid,date,boolean)'
  );
  _function_definition text;
  _repaired_definition text;
  _ambiguous_clause constant text := 'on conflict (meeting_id, user_id) do nothing';
  _safe_clause constant text := 'on conflict do nothing';
begin
  if _function_signature is null then
    raise exception
      'public.sync_business_audit_appointment is missing. Run the 2026-08-02 GHL Business Audit meeting sync migration first.';
  end if;

  select pg_get_functiondef(_function_signature::oid)
    into _function_definition;

  if strpos(_function_definition, _ambiguous_clause) > 0 then
    _repaired_definition := replace(
      _function_definition,
      _ambiguous_clause,
      _safe_clause
    );

    if _repaired_definition = _function_definition then
      raise exception 'The Business Audit meeting sync function could not be repaired.';
    end if;

    execute _repaired_definition;
  elsif strpos(_function_definition, _safe_clause) = 0 then
    raise exception
      'The Business Audit meeting sync function has an unexpected attendance conflict clause.';
  end if;
end;
$repair$;

comment on function public.sync_business_audit_appointment(
  text,
  text,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  uuid,
  uuid,
  date,
  boolean
) is
  'Idempotently synchronizes one GHL Business Audit appointment, attendance row, coaching note, and Business Audit.';
