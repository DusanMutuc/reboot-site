begin;

-- Cycles are independent cohorts. Members, systems and meetings are already
-- scoped by cycle_id; only each member's open enrollment must remain unique.
drop index if exists public.ninety_day_cycles_one_active_idx;

commit;
