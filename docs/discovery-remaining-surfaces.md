# Discovery — the remaining surfaces

Revision 1, 2026-09-02. UI design for the four surfaces left before production.

Companion to `discovery-ux-decisions.md` (settled interaction rules), `discovery-jobs-spec.md`
(what each job is) and `discovery-queue-semantics.md` (how decisions are recorded and go stale).
Where those documents already settle something, this one does not restate it.

**In scope:** Find content · Fix a search · Searches to investigate · Coach-selected recommendations.

**Out of scope, deliberately:** catalogue curation, end-to-end testing and production rollout are
sequencing, not design. A decision-history event log is excluded — no infrastructure exists for it
and nothing here depends on it.

---

## What carries over

The four job screens were built, then reviewed screen by screen with a real admin against real data.
These rules survived that and are not reopened here.

1. **Navigation is the sidebar.** No second nav bar, no tab strip, no card grid as a menu. New
   surfaces are sidebar entries in the `Resources` section.
2. **Badges only on queues that empty.** Neither new admin surface carries a count. Find content
   has nothing to count; Fix a search's list is a rolling window, not a backlog.
3. **Both answers carry equal weight; skip is a different category.** Wherever these screens ask
   something, this holds.
4. **Plain admin language.** Sentences, not labels. Tiny uppercase and monospace type read as
   developer tooling — monospace is for digits that align in a column, nothing else.
5. **The explanation lives in a tooltip, not in a paragraph above the control.** Every line of
   standing prose is a line an admin reads once and then scrolls past forever.
6. **Search sits at the far left, directly above the list it filters.**
7. **Composite identity everywhere.** `kind:id`. Resource and node IDs collide on 35 of 305 rows
   today; a bare number is never a key.
8. **Route out to the surface that owns the decision.** A review screen never edits raw settings.
   The moment it does, the jobs stop being where decisions are made.
9. **A default is not a decision.** Its corollary here: *no record* must read differently on screen
   from *decided*, always, in words.
10. **List-first surfaces use a persistent right panel**, about a third of the width, filled from
    the focused row, degrading below the list at ~1100px.
11. **Ineligible items are shown with the reason, never hidden.** An admin who searches for
    something they know exists must be able to find out why it is not offered.
12. **Fixed positioning, not sticky**, for any floating bar — the admin shell uses `overflow: auto`,
    which breaks `position: sticky`. `DiscoveryFloatingBar` already carries the measured
    implementation.

Reusable pieces: `QueueList` (listbox, one tab stop, pluggable `renderMeta`), `DecisionAnswers`
(with `compact` and `hint`), `JobHeading`, `CategoryCoverage` (`dense`), `DiscoveryTagPicker`,
`DiscoveryFloatingBar`, `useDiscoveryUndo`.

---

## Corrections to the brief

Three things in the handover are wrong or unbuildable as written. Flagging rather than quietly
designing around them.

### 1. Qualification must be corrected before reporting

The original analytics migration qualifies a search after a `result_set_shown`, `item_impression`
or `item_open` event. A later recording migration also sets `qualified_at` immediately whenever the
normalized query contains at least two characters. The route does reject shorter fragments before
recording, but every recorded query is therefore qualified before there is evidence that its result
set was shown.

**Decision:** remove insert-time qualification from `record_discovery_search_response`. Display,
impression and open events remain the qualification authority. Reporting additionally requires a
real `result_set_shown` event so historical rows created under the older rule cannot enter the
problem list solely because their query was two characters long.

The remaining noise is **reformulation chains**. `se` → `sel` → `sell` → `seller` each create a
`logical_searches` row, and naively listing them shows four failures where there was one. The schema
already models this: `parent_logical_search_id` plus `change_reason` link a chain, and
`close_inactive_search_journeys` closes it. The reporting unit is therefore the **terminal search of
a journey** — see [Searches to investigate](#3-searches-to-investigate).

### 2. Homepage browse has no decider, so Find content must not imply one

The brief asks Find content to show five things including homepage-browse status, each with "who made
each recorded decision". Four of those work. Browse does not.

`discovery_decisions` has exactly three questions — `topics`, `placement`, `visibility`. Homepage
membership is `resources.is_browsable`, written through `admin_set_discovery_browse`. There is no
token, no evidence, no `decided_label`, no date.

Faking a decision row for it would be the same error as `discovery_reviewed_at` — two things claiming
to be the authority for one fact. **Decision: Find content shows browse as current state, in a
visually separate group from the decisions, with no name and no date.** See the panel layout below.

### 3. The four-item minimum currently hides a lone coach selection

[discovery.ts:374](src/lib/discovery.ts:374) gates the entire returned array:

```ts
recommended: recommendationRows.length >= 4 ? recommended : [],
```

and [ContentBrowser.tsx:298](src/components/home/ContentBrowser.tsx:298) only offers the *For you*
tab when that array is non-empty. So a coach suggestion plus three algorithmic results shows the
member nothing at all today.

The minimum exists to stop a thin *algorithmic* set looking weak, which is a real concern. It was
never meant to suppress a named human recommendation. **The gate moves to the algorithmic slice
before coach selections are prepended.** This is a one-line change with a load-bearing consequence,
so it is called out rather than left to be discovered during integration.

### Also, while nearby

The sidebar still reads **Review hidden** at
[AdminPageShell.tsx:142](src/components/admin/AdminPageShell.tsx:142) while the screen it opens is
titled **Not in search yet**. One of them is stale. Small, but it is exactly the kind of drift that
makes an admin distrust the labels.

---

## 1. Find content

The recovery route for every decision. It answers *"where did that thing go, and what did we decide
about it?"* — nothing else.

### Shape

List with the persistent right panel, same geometry as Assign topics. One search field, far left,
above the list. **No filter panel** — the point is to find a known item fast, not to explore. An
admin who wants to browse by state has four job queues for that.

### The field

One input, matching four things at once:

| Matches | Notes |
|---|---|
| Title | Substring, case-insensitive |
| Alternate name | `resources.search_names` / `content_nodes.search_names` |
| `kind:id` or a bare number | See below |
| Containing guide or course title | So "that thing in Sellers Guide" works |

**Decision: a bare number is ambiguous, and the screen says so rather than guessing.** Typing `99`
returns both `resource:99` and `node:99`, each labelled with its kind. This is the one screen where
the composite identity is deliberately surfaced to the admin instead of hidden — because this is the
screen where an admin arrives holding a number they got from somewhere else, and silently picking one
of two items for them is how the collision bug happens again, in a human this time.

Empty result: *"Nothing matched. Try a title, an alternate name, an ID, or the guide it sits in."*

### The panel

Two groups, visually separated, because they are different kinds of fact.

```
Decisions

  Topics             hiring, interviewing              Shelley · 14 Aug        Reopen
  Standalone use     Keep with its lesson              you · 2 Aug             Reopen
  In search          Searchable                        no review recorded      Review


Current state

  Published          Yes                                                       Open in Library
  Homepage browse    On the homepage, under Hiring                             Curate
```

Three states per decision line, and they must read differently in words, not only in colour:

| State | Reads | Action |
|---|---|---|
| Decided | value · who · when | **Reopen** |
| Has a value, never reviewed | value · *no review recorded* | **Review** |
| No value, never reviewed | *no topics assigned* · *not yet reviewed* | **Review** |
| Decided, evidence since changed | value · who · when · *the title has changed since* | **Reopen** |

The middle rows are the whole reason this screen exists. An item tagged two years ago has topics and
no review; it is legitimately outside every queue, and describing it as reviewed would be a lie the
model is specifically built to avoid.

Staleness is shown here even though it is also shown in the jobs, because Find content is where
someone comes to understand an item they are suspicious of.

### Reopen routes to whoever owns that decision

This is the brief's correction to the older spec, and it is right — the older text assumed every
decision was reopened in a discovery job, which stopped being true when the standalone-use decision
moved into the builders.

| Line | Item kind | Routes to |
|---|---|---|
| Topics | resource | Assign topics, scoped to that item |
| Topics | guide or course | that builder's properties panel |
| Standalone use | resource inside a guide | the exact block, in Library Editor or Course Builder |
| In search | any | Not in search yet, scoped |
| Homepage browse | resource | Homepage browse, scrolled to it |
| Published | resource | Resource Library, that resource open |

Published-state routing is kind-aware: resources open in Resource Library, Library lessons in
Library Editor and courses in Course Builder. If a resource has more than one placement, the admin
chooses the placement to open rather than the screen silently selecting one.

Find content searches the complete known inventory, not only discovery-eligible items. Structural
nodes such as chapters and collections are returned with the reason they are outside discovery.
For a numeric-only query, exact resource and node ID matches are shown first in an **ID matches**
group; ordinary title matches containing the same number may follow.

Scoping travels as `?item=resource:204` on the target route. Navigation goes through
`navigateWithDiscoveryGuard`, so an unsaved edit on the destination is handled by the rule already
agreed for bulk: *Cancel / Discard changes / Save changes*.

### What it does not do

No editing. No bulk. No activity feed — without a decision event log it cannot explain that an older
decision was superseded, and **it must not pretend otherwise**. A superseded decision simply reads
as *no review recorded*, which is true. Version one accepts that gap knowingly.

---

## 2. Fix a search

A guided diagnosis. The admin brings a complaint — *"someone searched for the sellers guide and got
nothing"* — and leaves with either a correction applied and verified, or a clear statement that the
cause is not something a correction fixes.

### Shape

A query bar across the top, results in the main column, and the diagnosis in the same right-hand
panel geometry used everywhere else — empty until the admin names what should have been found.

Same panel, same place, on all four list-first screens. That consistency is worth more than a layout
tuned to this one workflow.

### The query bar

```
[ sellers guide                              ]   Showing: General published discovery results  ▾
```

**The default mode is labelled "General published discovery results", never "any member".** No real
member necessarily sees this set, and the label must not claim otherwise. Results whose availability
depends on access are marked in the row.

**Decision: choosing a member is a deliberate second step, never the default and never sticky.**
Reproducing a named person's results means looking at one member's access and history. That should be
an act the admin takes, not an ambient setting they forget is on.

The general mode uses a dedicated admin-only diagnostic query over published discovery content.
The member RPC is access-aware and must not be called with the admin as a substitute for a neutral
catalogue: that would merely reproduce the admin's access. Access-dependent rows in the general
set are labelled honestly.

### Results, and the escape hatch

Results render as ordinary rows with their position shown. Below them, one quiet control:

> **None of these are right** → *What should they have found?* → item picker

The picker is the Find content search, reused.

### Diagnosis: report the first cause, do not invent a fix

The panel states what it checked and stops at the first thing that explains the miss. Every finding
is phrased as an observation; the offer is separate and always declinable.

| Finding | Reads | Offers |
|---|---|---|
| Unpublished | "This is a draft. Nothing will find it until it is published." | Open in Resource Library |
| Not in search | "Nobody has said yet whether members can find this." | Review in *Not in search yet* |
| Kept with its lesson | "This was deliberately kept with its lesson. Members find *[lesson]* instead." The final clause says the search returns it only after the tool has verified that result. | View the decision |
| Member lacks access | "*[Member]* cannot open this. It sits inside *[course]*, which they are not enrolled in." | — not a discovery fix |
| No word matches | "Nothing in this item's title, description, alternate names or topics matches *sellers guide*." | Add as an alternate name · Assign a topic |
| Matched, ranked low | "This **is** returned, at position 14." | — ranking, not a missing word |

The last two rows are the ones that keep this tool honest. A diagnostic that can only ever conclude
"add a synonym" will add synonyms to problems that are actually ranking, access or publication — and
the vocabulary rots. **Being able to report "there is nothing to fix here" is a feature.**

The *kept with its lesson* row matters for a different reason: that is a completed, valid decision.
The wording offers **View**, not a prompt to overturn it.

### Corrections

**Decision: exactly two correction paths begin from this screen.**

- **Add an alternate name** — writes to that item's `search_names`, through the same path the
  builders use.
- **Assign a topic** — hands off to Assign topics scoped to that item, rather than duplicating the
  picker and its bulk rules.

The alternate name is the one inline write. Topic assignment remains a guided handoff.

Everything else routes out to its owning surface. Two is enough to close the common case without this
screen quietly becoming a second settings editor.

### Rerun is automatic

Applying a correction re-runs the search and shows the new outcome in place: *"Now returned at
position 2."* Verification is not a step the admin has to remember, and a correction that did not
work says so immediately.

### Admin searches write no member analytics

This is a property of the call path, not a flag to remember. `record_discovery_search_response` is
invoked from exactly two places —
[home/search:171](src/app/api/home/search/route.ts:171) and
[catalogue:224](src/app/api/discovery/catalogue/route.ts:224). The admin route calls
`search_discovery_items_for_surface` and does not call the recorder.

**Written down as a rule so nobody adds it later for consistency.** Admin test searches polluting the
zero-result data would corrupt the very list this screen is built to serve.

---

## 3. Searches to investigate

Not a separate screen and not a tab.

**Decision: the problem list is what Fix a search shows before anything is typed.** An admin who
arrives with a specific complaint types it. An admin who arrives without one gets the list. Same
screen, same search box, no navigation invented for a list of a dozen rows.

### Three sections, weakest evidence last

Each is labelled with what it does and does not prove. The heading is *Searches worth a look*, never
*failed searches*.

| Section | Rule | What it proves |
|---|---|---|
| **Found nothing** | `total_match_count = 0` | Objective retrieval failure |
| **Kept rephrasing** | a journey with 3+ query changes, ending with nothing opened | Real difficulty, but not which phrase was wrong |
| **Nothing opened** | shown, no `item_open` inside the window | Weakest. A member who found their answer in the summary line looks identical to one who found nothing useful |

`discovery_logical_search_outcomes` already computes `eligible`, `engaged` and `no_click`, so the
third section needs no new logic.

Only ended journeys, or journeys inactive for at least ten minutes, are reported. The terminal
search uses its latest actually displayed result set. **Found nothing** requires an `empty` shown
set; errors and prefetched-but-unshown sets do not qualify. **Gave up after rephrasing** requires no
open anywhere in the journey. A reformulation after an earlier open is labelled neutrally because
the member may have begun looking for something else.

### The unit is the terminal search of a journey

Per [correction 1](#1-query-length-is-not-what-qualified-means). Take the leaf of each
`parent_logical_search_id` chain — the phrasing the member settled on. The chain itself is useful
context, so the panel shows it when there is one:

> *One member tried 4 phrasings before giving up: `sel` → `sellers` → `sellers guide` → `seller
> checklist`.*

That is far more diagnostic than four separate rows, and it is the thing a naive query destroys.

### Columns

Query · distinct members · times seen · last seen. **Distinct members is the primary signal** and
sorts the list; a phrase three people failed on matters more than one phrase failed nine times by the
same person having a bad afternoon.

### Search-data access

This is a small, closely supported coaching programme, and improving member discovery is the
primary reason this information is collected. Authorized administrators can inspect every recorded
search journey, including searches made by one member only.

The default problem list groups matching terminal queries so recurring problems remain visible, but
individual journeys remain inspectable. Journey detail may show the member, exact query and
reformulation sequence, timestamps, delivered results and attributed opens. Coaches may inspect
journeys for members they are authorized to coach; administrators may inspect all members. Admin
diagnostic searches never enter this dataset.

### The window is 90 days and the screen says so

Retention is 30 days unqualified, 90 qualified. The list is inherently rolling, so it carries
*"Last 90 days"* rather than implying an all-time record that does not exist.

### Historical rows came from an older engine

`search_executions.search_version` is recorded per run. A row whose version differs from the current
engine carries a quiet note, and **opening it re-runs the phrase against today's engine**, because
the problem may already be fixed.

**Decision: a row that no longer reproduces is shown as already fixed, not silently dropped.** An
admin watching the list shrink should be able to see why.

Do not re-run the whole list on load. Re-run on open, as step one of the diagnosis.

---

## 4. Coach-selected recommendations

Two surfaces: where a coach picks, and where the member sees it.

Kept deliberately separate from required course assignments and action-step Library links. A
dedicated data model, not an overload of `user_training_assignments` — that table means *required
training*, and borrowing it would make "assigned" mean two different things within a month.

### Coach side

A `SectionCard` in the coaching notes panel, sibling to `TrainingAssignmentPanel`, titled
**Suggest a resource**.

The distinction from assignment has to be visible in one line, because the two panels sit next to
each other:

> *Not required. It appears at the top of their browse area with your name on it.*

The picker is an `Autocomplete`, the same control the course picker already uses.

**Eligibility** — locked by the product owner: published and safely openable; homepage-browse
approval not required. In practice:

| Rule | Why |
|---|---|
| `state = 'published'` | A draft opens for nobody |
| Standalone resource, or a current non-stale *suitable independently* decision | A missing decision is not permission to present an embedded item alone |
| The member can actually access it | A suggestion they cannot open is worse than none |
| No existing Finished / Not interested preference | A newly created suggestion must not be immediately suppressed |

Ineligible items appear in the picker **with their reason**, per the rule that already governs the
homepage browse picker. A coach who cannot find a resource they know exists needs to be told why, not
shown an empty list.

**Ordering:** newest active first, regardless of which coach made it. **Lifetime:** active until
resolved. Multiple coaches may each suggest.

Only one unresolved suggestion may exist for the same member and resource. A newer suggestion of
the same resource supersedes the older active selection; removing the newer row must never resurrect
an old one.

Two actors resolve, and each has their own mechanism — one truth per actor:

| Actor | Act | Stored as |
|---|---|---|
| Coach | removes or replaces the suggestion | `removed_at` on the selection row |
| Member | marks finished / not interested | the existing preference plus a durable resolution on the selection |

The card shows while the selection is active and unresolved. The member's existing hover action is
the resolution interaction.

**Decision:** the coach sees the explicit resolution quietly in the panel, without a notification or
judgement: **Finished** or **Not for me right now**. A durable resolution is stored against the
selection so deleting or changing an unrelated preference cannot make an old suggestion reappear.

### Member side

In the *For you* tab of `ContentBrowser`:

1. **Coach selections first**, above algorithmic results.
2. A plain human badge: **"Bri wanted you to check this out."** The coach's real name, from their
   profile — never a role, never "your coach".
3. **Never styled as algorithmic.** The algorithmic set keeps its restrained line,
   *"Supplementary material related to your current priorities."* A named human recommendation and a
   generated one must not be able to be confused.
4. **Same hover actions**, Finished and Not interested.
5. **Deduplicated** — if the algorithm chose the same resource, the coach version wins and the
   algorithmic copy is dropped from the set.
6. **The four-item minimum does not apply to coach selections.** See
   [correction 3](#3-the-four-item-minimum-currently-hides-a-lone-coach-selection).

### Analytics

Attribution must survive: a coach selection that gets opened is not evidence the algorithm works.

`discovery_result_set_items.ranking_tier` is constrained to `strict | related | recommendation`, but
`reason_code` is free text and already carries values like `strict_priority_label`. So a coach
selection records on the existing `recommendation` tier with `reason_code = 'coach_selection'` and
the coach id in `reason_context` — **no constraint change, no migration to the analytics tables.**

### Not built

Do not add passive suppression. Impressions and opens are not evidence the member no longer needs
something; only explicit finished / not-interested feedback removes an item. This already holds for
the algorithmic set and holds identically here.

---

## Where these live

```
Resources
  Resource Library
  Assign topics            267
  Check standalone use     108
  Not in search yet         15
  Homepage browse
  ─────────────
  Find content
  Fix a search
  Topics & synonyms
```

The first group is the lifecycle of a resource, in order. **Decision: a divider before the last
three,** which are not lifecycle steps — two recovery tools and a vocabulary editor. Eight children
under one section is at the upper end of comfortable; the divider is what keeps it scannable rather
than a list to read top to bottom.

Neither new entry carries a badge. Find content has nothing to count, and putting a number on Fix a
search would turn a rolling 90-day window into a backlog with an implied finish line — the same
mistake the progress bar made.

Coach-selected recommendations gets no admin entry. It lives in the coaching workspace, where the
coach already is.

---

## Still hypotheses

To be confirmed against a real screen with real data, not settled from prose:

- **The problem list as the pre-typing state of Fix a search.** Sound with a dozen rows. Test it once
  there are more than the two searches the local clone holds — if it runs to eighty rows it may want
  its own column beside the diagnosis rather than under it.

Find content deliberately does not match description text. It is a known-item lookup; description
matching would make it compete with Fix a search and reduce the precision of title, alternate-name,
ID and container matches.

---

## Build order

1. **Find content.** `discovery-ux-decisions.md` already rules that nothing is released for real
   curation until Find content and undo exist — an admin making decisions they cannot locate is the
   one failure this model cannot absorb. Undo shipped with the jobs; this is the other half.
2. **Fix a search**, diagnosis workflow first, with the pre-typing state stubbed.
3. **Searches to investigate**, into that stub.
4. **Coach-selected recommendations** — coach picker, then the member card, then the four-item fix.

Steps 1–3 are admin-only and independent of catalogue state. Step 4 is the only one whose value
depends on real curation existing, and it is also the only one that touches member-facing code.
