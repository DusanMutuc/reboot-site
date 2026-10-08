# Shared coaching history repair — 8 October 2026

Business Review and Implementation loaders filtered physical rows by the selected
member, while older coaching notes already expanded active partnership sharing.
That hid partner-owned reviews and classified their shared coaching cycles as M2.
A read-only production comparison found this affected eight profiles across six
active notes-sharing partnerships. The records remained intact. The exact-member
review/cycle filters predated the October audit.

The application now loads reviews and sessions through visible coaching-note IDs,
including historical records owned by either partner. The combined history also
follows notes sharing for standalone notes. Scorecard review dates aggregate only
visible reviews, and Foundation scorecard responses reload the authorized note
owner's scope. Reopening a shared draft does not create a second draft from the
other profile.

Migration `20261008024000_shared_coaching_workspaces.sql` aligns review and
implementation mutations with active notes sharing. Attendance authorization is
separate: selecting another partner cannot grant attendance access, and shared
notes edits never create an attendance row. The selected member is passed to the
new workspace RPC overload. Existing record ownership, five-argument clients,
revision checks, idempotent meeting creation, and account setup/archive guards
remain supported. Meeting locks serialize starts across historical note owners.

Validation includes filter-aware two-member loader/API fixtures and PostgreSQL
execution of the full migration chain. The database suite also replays the exact
eight live predecessor functions and applies both LF and Windows CRLF migration
text. It covers independent sharing flags, expired assignments, inactive sharing,
forged selected-member attendance, legacy callers, revision conflicts, shared
cycle boundaries, and archive/setup/past-member guards. True concurrent backend
execution was unavailable; the exclusive meeting lock and collision behavior
were verified in the PostgreSQL fixture.

Production function backups and guarded release/rehearsal SQL are kept outside
the repository. The migration changes functions only and does not backfill or
rewrite member records.

The live migration was applied after a successful rollback rehearsal. Its stored
canonical checksum matches the checked-in source. All 127 reviews, 14 partnerships,
28 partnership memberships, and 70 sharing claims were preserved. Read-only runs of
the corrected loaders verified matching review, cycle, action, and history IDs
from both profiles in all six affected partnerships (12 profiles).
