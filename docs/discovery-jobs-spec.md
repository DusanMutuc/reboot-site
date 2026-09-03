# Content tab — job specifications

Revision 2. Each job is specified against seven questions. Five are from the agreed foundation;
**entry condition** and **completion signal** are added because without them a job can be started
in an order that wastes the work, or can never be finished.

**This document describes the jobs only.** How decisions are recorded, when they go stale, what
skip means, and how bulk behaves are owned by `discovery-queue-semantics.md`; interaction and
layout are owned by `discovery-ux-decisions.md`. Earlier revisions restated those rules here and
the three copies drifted apart, so they are now referenced rather than repeated.

Counts are from local data on 2026-09-01: 258 resources, **27 eligible learning nodes**
(20 Library guides and 7 whole courses) and 82 topics. A Library guide is specifically a `lesson`
placed directly beneath the canonical `Library` collection. The other 38 `lesson` rows are course
internals, parentless/editor remnants, or content under another collection; they are not independent
discovery results or admin targets. Chapters, collections and playlists are also out of scope.

---

## The mechanism every job depends on

Owned by `discovery-queue-semantics.md`. In summary, and normative only there:

- A decision is per **item, per question**, with its own answer, author, timestamp and
  concurrency token.
- Each job states two different things: a **product prerequisite** (something that must be
  decided before the job can exist at all) and an **item entry condition** (what puts one item
  in its queue). They are unrelated, and conflating them is what produced the earlier
  "entry condition: none" on a job that plainly has one.
- Queue membership is **entry condition AND no current answer** — never simply "no decision row",
  which would sweep every legitimately tagged or searchable item into a queue.
- Both answers to a question complete an item. **Skip records nothing.**
- A decision goes stale when the **evidence it was made against** changes; an out-of-band edit to
  the underlying setting **supersedes** it instead.

The earlier `discovery_reviews` sketch in this document has been replaced by
`discovery_decisions` in the semantics document, which adds the opaque concurrency token, per-question answer
constraints, server-generated evidence and atomicity requirements.

---

## Job A — Add topics to untagged content

**Product prerequisite.** None. The job can run today.

**Item entry condition.** A **resource, canonical Library guide or whole course** with no active topics,
that has no current topics answer — or whose topics decision has gone stale. Chapters are excluded,
for the same reason they are not search results: a chapter is a structural grouping, and a member is
better served by the Library guide or whole course around it. Course-internal lessons are likewise
excluded because they rely on the course for their structure and context.

**Readiness warning, not a gate.** Today **0 of 82 topics carry a browse category**, so anything
tagged now inherits none and appears in browse under "All". Tagging is still worth doing for search,
so this never blocks the job; it is a line at the top of the screen with a link to the Tags tab, so
nobody discovers it after 240 decisions.

**Collection.** **267 today** — 240 resources, 20 Library guides and 7 courses, with none of the nodes yet
tagged. Items that already carry topics are out of scope: this queue does not audit existing tags.

All three kinds share one queue rather than a mode switch, because the question and the evidence are
the same for each. The row shows which kind it is, and kind is available as a filter.
Ordered by format, then title, so material of one kind arrives together and the admin builds rhythm
instead of context-switching every item.

**Sorting by title does not cluster by marker, and the earlier claim that it did was wrong.** The
marker sits at the *end* of a title while the sort key is the start, so the seven `[Intensive Replay]`
episodes land at positions 1–5, 84 and 92 of the podcast run. Format clustering is real and worth
keeping; marker clustering is not something the sort provides, and bulk must not be designed as
though it does.

**Opening screen.** A list, with the persistent detail panel following focus — not one item at a
time. Titles often settle the topic decision, so the list keeps the pace up, and the panel supplies
description, placements and a link to the material for the rows where they do not.

**Decision.** Which topics describe this? Or: none needed.

**Minimum controls.** Topic picker (appears on row focus) · Save topics · No topic needed ·
Skip for now · Open the material.

**After.**
- Save → record, advance.
- No topic needed → record, advance, leaves the queue.
- Skip → no record, advance, stays in the queue.

**Completion signal.** Every item in the job population has a current answer. The population is
**queue candidates plus items already carrying a current answer for this question** — a stable
denominator, because eligibility alone shrinks the moment an admin saves topics and the count would
never appear to advance. Shown as *"N of 267 decided"* against today's population, never as a
count of untagged items.

**Bulk is required, with the guardrail in the semantics document.** 116 of 126 podcasts end in a
bracketed marker, which makes those markers a good way to *find* related material — and no evidence
at all of a shared subject. `[Coaching Replay]` spans hiring, CRM, listings and mindset.

**The markers are messier than they look, verified against local data on 2026-09-01.** There are
**39 distinct trailing brackets**, not three, and only one is a large group: 73 podcasts carry a
`Coaching Replay` variant. Most of the rest are guest names (`[with Candece Epp]`), dates
(`[3 January 2025]`) or typos (`[Coachim Replay]`, `[Workshop Workshop Replay]`). `[Showcase]` is
**not a podcast marker** — all 19 of them are videos. Any grouping UI must therefore treat a marker
as a search string the admin chooses, never as a category the system offers.

So the marker groups; the admin classifies. Topics are copied from a representative item as a
**suggestion**, every target is listed, individual items can be excluded, and the operation is
confirmed as **`Add 3 topics to 23 items`** — adding, never replacing. Without a bulk path the job
stalls; without the guardrail it silently mislabels a quarter of the catalogue.

**Topics never propagate**, in any direction — not between a Library guide and its embedded
resources. Each independently discoverable item carries topics describing what a member finds on
landing there. A guide about hiring may embed a generic P&L template, and the template is not about
hiring. A course carries topics describing the course as a whole; its internal lessons are not
separate topic targets in discovery.

**Not in this job.** Visibility, browse approval, independent-use review, category assignment.
Assigning a topic to a lesson does not publish it, make it searchable, or put it in browse — and
guides never enter homepage browse at all.

---

## Job B — Check resources used inside guides

**Product prerequisite.** None — this is the only job with nothing unresolved in front of it,
which is why it goes first.

**Item entry condition.** A resource that is **embedded in at least one learning node**, and has no
current placement answer — or whose placement decision has gone stale.

**Collection.** **108 today.**

**Opening screen.** The resource *in its context* — this is the one job where seeing the
surroundings is the entire point. Title, format, and the containing guide, with a link that opens
the guide at that position. `placements[]` is now an array, so **show every placement**: the
question is whether the resource works outside *all* of them, and an item in three guides is a
harder call than an item in one.

**Decision.** Suitable independently, or keep within its guide.

**Minimum controls.** Two decision buttons · Open the guide · Skip for now.

**After.** Either decision records and advances. Skip advances without recording.

**Completion signal.** Pending count reaches 0. This one genuinely empties.

**Not in this job.** Topics, browse approval, visibility. An item can be suitable independently and
still not belong on the homepage — that is Job D's call, and merging them would quietly approve
material nobody curated.

---

## Job C — Review hidden content

**Unblocked.** Canonical Library guides and whole courses are searchable types; course-internal
lessons and chapters are not. That resolves what
*allow in search* means for each item this job can contain.

**Scope — resources, Library guides and whole courses.**

- **Hidden resources** — in scope permanently. None hidden today, but a resource created hidden
  tomorrow belongs here.
- **Hidden Library guides and courses** — none today.
- **Course-internal lessons and chapters** — never in scope. Hidden structural nodes are not work;
  allowing one in search would do nothing because it is not an independent result.

**Item entry condition.** Within that scope, an item with no current visibility answer, or a stale
one. Not every searchable item merely because it has no historical decision.

**Build note.** The queue is empty today, but remains a recurring job for anything intentionally
created hidden later. It is last in the build order because the higher-volume work is more valuable
first, not because its product meaning is unresolved.

**Opening screen.** A list with the detail panel, matching Job A. Each row carries its recorded
decision and, separately, any current blocker — the two are different things and the row shows both
rather than conflating them.

**Decision.** Allow in search, or keep out of search. These name a **permission, not an outcome**:
a draft can be allowed and still blocked from appearing until published. The row states any blocker
separately, and never infers intent from state — unpublished is an observable blocker, not evidence
of why something was hidden.

**Minimum controls.** Two decision buttons · Open the material · Skip for now.

**After.** Either decision records and advances.

**Completion signal.** Every hidden item has a recorded decision. Note this queue refills whenever
something new is created hidden, which is correct.

**Not in this job.** Browse approval. Hidden → searchable → browse-approved is two separate
decisions and collapsing them into one control would let an admin publish to the homepage while
thinking they were just un-hiding something.

---

## Job D — Curate homepage browse

**This job is a different shape from the other three** and should not be forced into the same
shell. A, B and C are queues that empty. D is an editorial collection that is never "done" — it has
no backlog, only a current selection.

**Product prerequisite.** None.

**Readiness warning, not a gate.** With no categorised topics, approved items appear under "All" and
none under a category chip. That is a poor catalogue, not an invalid one, so it is stated at the top
of the screen and never prevents curation.

**Collection.** Items currently approved for homepage browse. **0 today.**

**Opening screen.** The current selection as a compact list — title, format, inherited categories,
and any warning that stops the item actually appearing (unpublished; embedded and still marked
keep-within-guide). Not a grid of member-style cards; a card preview is available on demand but
does not occupy the workspace.

**Decision.** What belongs on the homepage.

**Minimum controls.** Add material (searchable picker over all relevant material, split into
ready and not-yet-eligible) · Category
chips and title search to navigate the selection · A focused item panel to inspect context, open a
preview, and remove from browse.

**After.** Add and remove take effect immediately. There is no next item and no advance.

**Completion signal.** None, and the interface should not imply one. The useful signal is
**coverage per category** — "12 items · marketing 5, systems 4, hiring 3, mindset 0" — because an
empty category is a real gap while a small total is not.

**Not in this job.** Topic assignment, placement review, visibility. Ineligible candidates are
shown with their reason and route out to the owning workflow — they are never resolved from here.

---

## The fifth entry currently on screen

**"No category from topics · 258"** should be removed as a job. Per the agreed foundation,
categories are inherited from topics, so there is no action an admin can take on the Content tab to
change this number — the fix is entirely on the Tags tab. It is a diagnostic, not a job.

Suggested: a line in the Content tab header — *"258 items have no category, because 0 of 82 topics
have one → Set categories on the Tags tab"* — which states the cause, the consequence, and the
place to fix it.

Similarly, **"Approved for homepage browse · 0"** is not a queue; it is Job D's collection, and
should be that job's entry point rather than a fifth row that looks like a backlog.

---

## Open questions

Nothing. The last one — which learning-node types may be search results — is settled: canonical
Library guides and whole courses yes; course-internal lessons, chapters, collections and playlists
no. That unblocks Job C and completes Job A's scope.

Answered since revision 1: the storage shape (now `discovery_decisions` in the semantics document),
whether bulk needs a guardrail (yes — grouping is not classification), and whether Job C should be
shown while empty (no — it is blocked, not empty).
