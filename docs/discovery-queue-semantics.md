# Shared queue semantics

Revision 2. The behaviour common to the decision queues, defined before screens because these
semantics determine whether the counts on those screens can be trusted.

Homepage browse is not a queue and none of this applies to it.

Companion to `discovery-ux-decisions.md` (how it looks and behaves) and `discovery-jobs-spec.md`
(what each job is).

---

## 0. Scope — which collection each job governs

Stated explicitly rather than left open, because the UX already assumes specific collections and
resource semantics must not be applied silently to every `content_node`.

| Job | Scope | Why |
|---|---|---|
| A · Topics | **Resources, canonical Library guides and whole courses** | All three are things a member can be given as an independent search result, so all three carry topics |
| B · Guide context | **Embedded resources only** | The question does not exist for anything else |
| C · Visibility | **Resources, canonical Library guides and whole courses** | Unblocked: these are the searchable types |

**Which learning-node types participate — settled.** A **canonical Library guide** means a `lesson`
whose direct parent is the `Library` collection. Those guides and **whole courses** are searchable
and taggable. Course-internal and parentless `lesson` rows are not independent discovery items.
**Chapters are not**, and neither are collections or playlists. These are structural groupings whose
value depends on their containing experience. This applies uniformly: none is a search result, topic
target or Job C item.

**What a topic on a Library guide or course does, and does not do.** It improves how that node matches a
search, and connects it to one of the four broad categories. It does **not** publish the node, make
it searchable, or place it in homepage browse — each of those stays a separate decision, and guides
never enter browse at all.

**Topics never propagate between a Library guide and the resources embedded in it.** Not downward,
not upward. A guide and each independently eligible resource are separately discoverable things, and each carries
topics describing what a member would actually find when they land on it. Inheriting would
mislabel both: a guide about hiring may embed a generic P&L template, and the template is not
about hiring.

A course carries topics describing the course as a whole. Its internal lessons do not carry separate
discovery topics because they are not independent discovery results.

---

## 1. A decision is per item, per question

Three independent questions, each with two valid answers:

| Question | Answer A | Answer B | Stored values |
|---|---|---|---|
| `topics` | Topics assigned | No topic needed | `assigned` · `none_needed` |
| `placement` | Suitable independently | Keep within its guide | `direct` · `context` |
| `visibility` | Allow in search | Keep out of search | `allowed` · `excluded` |

Both answers are decisions. Neither is "unfinished". An item can leave one queue while sitting in
another.

### Item identity is `(kind, id)` everywhere, not only in storage

`discovery_decisions` is keyed `(item_kind, item_id, question)`, and **every layer above it must key
the same way.** `resources` and `content_nodes` have independent id sequences, so the same integer
names two different items. This is not hypothetical: in the current scoped queue,
**7 eligible learning nodes share a numeric id with a resource** — node `85` is the course
*Set Your Compass*, while resource `85` is *Ep 74 — Convert Social Media Tags into Meetings*.

Anything that reduces an item to its bare id will therefore act on the wrong row: a selection set, an
undo before-image, a client-side decision cache, a React `key`, a URL parameter, a bulk target list.
The failure is silent — a bulk write reports the count the admin expected while having modified an
item they never saw. A prototype of Job A built for this revision had exactly this defect, and it was
only visible because the ids were checked against real data rather than assumed to be unique.

---

## 2. Three kinds of state, and only one of them is a queue

**This is the correction that matters most.** "No decision row" does **not** mean "needs a
decision". Read literally it would put all 258 resources in the topics queue including the 18
already tagged, and every searchable resource in the visibility queue — contradicting the jobs and
their counts.

**A decision is required when an item meets that job's entry condition *and* has no current
answer.**

| | Meaning | In the queue? |
|---|---|---|
| **Needs a decision** | Meets the entry condition, no current answer | **Yes** |
| **Changed since its decision** | Has an answer, but its evidence no longer matches | **Yes** |
| **Decided** | Has an answer, evidence still matches | No |
| **Existing state, no review recorded** | Does not meet the entry condition; carries a value nobody chose | No |

**The job population, for progress.** Eligibility alone is not a usable denominator: saving topics
removes an item from "no active topics", so a bar reading *decided of eligible* would shrink by one
every time an admin decided one and never appear to advance. The population is therefore **current
queue candidates plus items carrying a current answer for that question** — stable across ordinary
decisions, and legitimately changed only by external edits. The 18 historically tagged resources sit
outside it, having neither an entry condition nor a recorded answer.

**Entry conditions:**

- **Topics** — a resource, canonical Library guide or whole course with no active topics.
  Course-internal/parentless lessons, chapters, collections and playlists are excluded.
- **Placement** — an embedded resource.
- **Visibility** — a hidden resource, canonical Library guide or whole course. Not "every searchable item that lacks a
  historical decision".

The fourth row is the one that keeps the model honest. An item tagged two years ago has topics but
no recorded review; it is legitimately out of the queue and must not be described as reviewed.
Find content says so in as many words:

```
Topics       "hiring", "interviewing"    existing state, no review recorded
Visibility   Searchable                  existing state, no review recorded
```

**The topics queue does not audit existing tags.** Re-examining the 18 pre-tagged resources is a
separate, deliberate job if it is ever wanted — not something the queue does by implication.

### A default is not a decision either

Every question has a stored value that exists whether or not anyone chose it:

| Question | Default in the data | Why it is not a decision |
|---|---|---|
| Placement | `discovery_open_mode = 'context'` | The safe default on insert; nobody picked it |
| Visibility | `is_discoverable` backfilled `true` for published rows | A migration set it, not an admin |
| Topics | no rows in `resource_tags` | Absence, not a judgement that none are needed |

This is why the decision record exists at all, and why `discovery_reviewed_at` was created rather
than reading `discovery_open_mode` directly.

**An answer that matches the default still writes a decision.** Choosing *keep within its guide* on
an item already defaulted to `context` changes no setting and must still record — otherwise the
queue cannot tell the two apart.

### First run

No backfilled decisions. Entry conditions mean legitimate existing state does not become mandatory
review work, so the real opening queues are already the right size. Present them as a starting
position, never as a defect count.

---

## 3. Staleness: which changes reopen a decision

Each decision stores the evidence it was made against and is stale when the current evidence
differs. **Evidence is computed server-side**, at decision time and at comparison time. The client
never supplies it and never determines staleness; it receives a flag.

| Question | Evidence |
|---|---|
| `topics` | `title`, `description`, `type`, `url` |
| `placement` | `type`, `url`, and per placement: node id, position, and **a digest of its surroundings** — exact contents below |
| `visibility` | `type`, `url` |

Reading it as rules:

- **The material was replaced** — `url` or `type` changed. Stales all three. It is different
  material; no earlier decision about it survives.
- **Renamed or redescribed** — stales topics only. The title is the main evidence of subject; it is
  not evidence of context, nor of whether something should be reachable.
- **Placements changed** — added, removed, or moved. Stales placement only.
- **The containing node's blocks changed** — stales placement. See below.
- **The setting was changed outside the job** — not staleness; the decision has been *superseded*.
  Delete the row. This applies to all three: an external edit to `discovery_open_mode`,
  `is_discoverable`, **or to an item's topic assignments** removes the corresponding decision.
  `guard_discovery_review_change` already does this for open mode and is the model.

### Publication state is a blocker, not evidence

`state` is deliberately **not** in the visibility evidence. *Allow in search* is a permission, and
the UX contract says so explicitly — a draft can be allowed and still blocked from appearing until
it is published. If publishing reopened the decision, permission and publication would be entangled
after being deliberately separated. Publication stays a live blocker shown on the row; it never
invalidates the answer.

### The containing node's blocks are the placement evidence

The UX contract says what sits before and after the resource *is* the question. Evidence limited to
node id and position contradicts that: change the instructions around a resource that stayed at
position 3, and the decision would still read as current although the thing it was about had
changed.

The dangerous direction is a *suitable independently* approval surviving the **addition** of
essential setup instructions. So each placement carries a digest of its surroundings.

**What the placement evidence contains, per placement:**

| Included | Why |
|---|---|
| Node id, and the resource block's position | Where it sits |
| Containing node's title and description | Framing the admin read when deciding |
| Canonical digest of **all other ordered blocks** in that node | The surroundings — the actual question |
| Instructional text on the resource's own block (caption, warning) | Carries meaning; changing it changes the decision |

**Excluded:** the resource's own block as a whole — its identity and position are tracked
separately, and including it would reopen the review whenever that block was touched for an
unrelated reason. **Also excluded: purely presentational block settings** — width, spacing,
alignment. Reopening a context review because someone adjusted a column width is noise that would
train admins to dismiss reopenings without reading them.

Not the containing course's `updated_at` either — that fires on any descendant edit anywhere in the
course. A per-node digest is targeted.

This will occasionally reopen a decision over a typo fix. That is acceptable: the row states what
changed, and re-confirming is one keystroke. Retaining an approval after the surrounding
instructions changed is not acceptable at any frequency.

---

## 4. Storage

**Illustrative, not final** — but it satisfies the contracts above.

```sql
create table public.discovery_decisions (
  -- Polymorphic over resources and content_nodes. "node" not "guide": eligible nodes include
  -- canonical Library guides and whole courses.
  item_kind   text        not null check (item_kind in ('resource','node')),
  item_id     bigint      not null,
  question    text        not null check (question in ('topics','placement','visibility')),
  answer      text        not null,

  -- Concurrency token. Opaque and regenerated on every write, never incremented and never
  -- reused. See the note below on why a counter is not safe here.
  token       uuid        not null default gen_random_uuid(),

  decided_at  timestamptz not null default now(),
  -- Nullable: a decision must outlive the account that made it, and a NOT NULL reference would
  -- block deleting any admin who had ever decided anything.
  decided_by  uuid        references auth.users(id) on delete set null,
  -- Immutable label captured at decision time, so Find content can still say who decided
  -- after the account is gone.
  decided_label text      not null,

  evidence    jsonb       not null,

  primary key (item_kind, item_id, question),
  constraint discovery_decisions_answer_valid check (
    (question = 'topics'     and answer in ('assigned','none_needed')) or
    (question = 'placement'  and answer in ('direct','context'))      or
    (question = 'visibility' and answer in ('allowed','excluded'))
  )
);
```

### Why the token is opaque rather than a revision counter

An incrementing revision is unsafe in combination with the rule that an external edit **deletes**
the decision:

1. An admin loads a decision at revision `1`.
2. An external edit deletes the row.
3. Someone records a new decision — a fresh row, revision `1`.
4. The first admin submits their write carrying revision `1`. **It matches**, and overwrites a
   completely different decision.

A counter restarts; that is the whole problem. A `uuid` regenerated on every write cannot be
recreated by deletion and reinsertion, so a token an older client still holds can never match a
decision it never saw. `decided_at` remains for display only.

### Also required of the implementation

- **`evidence` is generated server-side** from the item's current row. Never accepted from the
  client, and staleness is computed server-side by recomputing and comparing — the client receives
  a flag, never the inputs.
- **`decided_by` and `decided_label` come from the authenticated session**, never from the request
  body.
- **The setting write and the decision write are one transaction.** Recording *suitable
  independently* without setting `discovery_open_mode`, or the reverse, must be impossible.
  `admin_update_discovery_items` is where this belongs.
- **Decisions are removed with their item.** A polymorphic reference cannot use foreign keys, so
  delete triggers on `resources` and `content_nodes` must clear the matching rows.
- **External changes supersede.** Editing an item's topics, open mode, or discoverability outside
  the job deletes that question's decision.

### One authority for placement decisions

`resources.discovery_reviewed_at` was built for the placement question and works for it, but the two
must not both accept writes — token checking, evidence, staleness and Find content all assume a
single source.

**The decision:** migrate existing placement reviews into `discovery_decisions` and make the new
table authoritative. Keep the old columns temporarily for read compatibility if anything still
depends on them, and stop writing to them at the point of migration. Not "either is fine" — that was
an unmade decision wearing the clothes of a choice.

### Recommended, deferrable: a decision event log

An append-only `discovery_decision_events` row per write and per supersession would let Find content
say *"a decision by Shelley on 2 Aug was superseded when topics were edited on 14 Aug"* rather than
showing an unexplained absence. Nothing above depends on it — undo is in-memory session state, not
history — so it can follow later. It is the difference between a recovery route that explains itself
and one that only shows the present.

---

## 5. Multiple admins

- **Decisions are shared**, one row per item and question, guarded by the opaque `token`. A write
  carrying a token that no longer matches is refused, and the admin is told who changed it and when,
  with the choice to reload or overwrite deliberately. A check on write, not a lock — but never a
  silent overwrite, and never a token that deletion could recreate.
- **Skips are private and unstored**, so one admin's uncertainty never removes work from another's
  queue.
- **Queues are live.** An item decided elsewhere leaves your queue on next load.

---

## 6. Skip

Skip is a fact about a session, not about an item, and is **not stored**. Storing it would create a
second hidden state needing expiry rules, and would hide work from colleagues.

A skipped item moves to the **back of the current queue** and returns on the next visit — which
solves the real complaint without persistence.

**Caught up** = zero items *needing a decision* and zero *changed since decision*, for that
question, right now. Never "the catalogue is finished".

---

## 7. Queue order

1. Needs a decision, before changed-since-decision — new work before rework.
2. Skipped this session, last.
3. Within those, cluster similar material so the admin builds rhythm. For topics, by format then
   title.

---

## 8. What a queue screen must carry

- Which of the two answers is being asked for, in the job's own words.
- That both answers complete the item; neither reads as the lesser option.
- That skip does not.
- For a reopened item: the previous answer, who made it, when, **and what changed**. Reopening
  without saying why is worse than not tracking staleness at all.
- Progress as *decided of eligible*, never as *remaining defects*.

---

## 9. Bulk assignment (topics only)

1. Group or search for related material.
2. Copy topics from a representative item **as a suggestion**.
3. Show every proposed target with its title.
4. Let individual items be excluded.
5. Confirm the exact operation: **`Add 3 topics to 23 items`**.

**Bulk adds; it never replaces.** Each item written records its own topics decision, identical to a
single assignment — a faster route to the same records, not a different kind of decision. The whole
operation is one undo entry.

**Not permitted:** applying topics to a set the admin has not seen, or inferring subject from a
format marker without confirmation. `[Coaching Replay]` spans hiring, CRM, listings and mindset.

---

## 10. Still open

Nothing. The last product question — which learning-node types may be search results — is settled:
canonical Library guides and whole courses yes; course-internal/parentless lessons and structural
nodes no.

Settled since revision 2: digest granularity (the resource's own block is excluded, §3); topics for
eligible learning nodes (Library guides and whole courses, §0); and Job C's scope, which unblocks it.

What remains is not a product question but a build one: the three visual hypotheses in
`discovery-ux-decisions.md`, to be tested against a realistic Job A screen.

---

## Appendix — code this settlement changes

- Search and admin eligibility use one server-side predicate: whole courses, or `lesson` nodes placed
  directly beneath the canonical `Library` collection. A `node_type` check by itself is incorrect.
- `resolve_content_node_open_path` already resolves any node type, so a course result needs no new
  mechanism.
- Member and admin labels distinguish a whole course from a Library guide; neither exposes the
  overloaded database word `lesson` as the product boundary.
- `guard_assignable_discovery_tag` already restricts assignment to topics; it does not restrict by
  node type, so course tagging needs no change there.
