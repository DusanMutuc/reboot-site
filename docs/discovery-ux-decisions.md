# Discovery admin — UX decisions

Revision 2. Job shapes and interaction rules are settled. Some exact visual treatments are marked
**hypothesis** — they should be inspected on a realistic screen with real data before being
treated as decided.

Companion to `discovery-jobs-spec.md` (what each job is) and `discovery-queue-semantics.md`
(how decisions are recorded and go stale).

---

## Navigation

Four tabs: **Jobs · Fix a search · Find content · Topics & synonyms**

Jobs opens on the work areas with their counts. No progress bar — a bar implies a finish line the
model denies.

**Caught up applies to Jobs A, B and C only.** Homepage browse never finishes, so it shows coverage
and warnings instead and must not display a count that reads as a backlog.

Removed from the current screen: the progress bar; *"No category from topics"* (a diagnostic —
becomes a header line naming the cause and linking to Tags); *"Approved for homepage browse"* as a
queue row (it is Job D's entry point).

---

## The shape of a queue follows the evidence its decision needs

| Job | Evidence | Shape |
|---|---|---|
| A · Topics | Often the title; the panel supplies more when it doesn't | List, decide from the row — resources, Library guides and whole courses together |
| B · Guide context | Always the surrounding guide | Focused, one at a time, full width |
| C · Hidden | The recorded decision, plus any current blocker | List, decide from the row |
| D · Browse | — not a decision queue | Collection |

**Titles often settle the topic decision; they are not assumed to.** The persistent panel makes
further evidence immediately available for the ones that don't, which is what keeps a list-first
shape from encouraging superficial tagging.

---

## Preview: a persistent detail panel

**Decision.** List-first surfaces (A, C, Find content) use a fixed right-hand panel, about a third
of the width, filled from whichever row has focus and updated as the admin moves with arrow keys.

**Why not inline expansion:** it shifts every row below it, which is disorienting mid-list and
breaks keyboard rhythm. **Why not a modal:** it demands a dismiss action for information that is
often only glanced at. **Why the panel wins:** the extra evidence is already on screen the moment
it is wanted.

**The panel carries the evidence and decision history relevant to the current job** — not
everything known about the item. Job A needs description and placements; it does not need homepage
warnings. Find content shows every decision because that is its entire purpose. Stating it as
"everything known" would, over time, justify putting the whole settings surface back on screen.

**It never embeds the material.** One *Open the file* action, new tab. A PDF or audio player in a
third of a column serves nobody.

**Below roughly 1100px** the panel moves beneath the list as a detail section for the focused row.
Below tablet width it becomes a drawer opened deliberately from the row. The panel is a
desktop-first affordance and must degrade rather than squeeze.

Job B ignores all of this: the guide context is the job, so it takes the full width.

---

## Both answers are primary; skip is a different category

- **Equal visual weight** for the two answers. Same size, same treatment, symmetric verbs. The
  moment one is a button and the other a link, admins over-choose the button to avoid appearing to
  give up.
- **They sit together, right-aligned,** change first and keep-current second. Order is unavoidable;
  weight is what signals preference, so weight stays equal.
- **Skip sits apart** — left-aligned, quieter, worded as time (*Skip for now*) rather than as an
  answer. It never joins the answer group.

---

## Keyboard

| Key | Action |
|---|---|
| `↑` `↓` | Move between rows (list jobs) |
| `1` | First answer |
| `2` | Second answer |
| `Enter` | Commit what is entered (Job A: save the topics typed) |
| `S` | Skip for now |
| `Z` | Undo the last decision |
| `/` | Focus search |

`1` and `2` rather than mnemonics, because mnemonics collide across jobs — `k` would mean *keep
within guide* in one and *keep hidden* in another.

**Required behaviour, not optional polish:**

- Shortcuts are **inert while a text input, picker or search field has focus.** No exceptions.
- A row or decision workspace must hold **visible focus** before `1`, `2` or `S` does anything.
  Focus is never implicit.
- Shortcuts are **supplementary**. Every action is also a visible, clickable control.
- The shortcut list is exposed accessibly — a persistent one-line hint at the foot of the list, and
  the same information available to screen readers, not hidden behind `?`.

**Rows are controls, and must be built as controls.** A row that responds to a click but is only a
styled `div` is unreachable by keyboard and unnamed to a screen reader. This is an implementation
requirement, not a visual one — none of it changes how a row looks.

- **Job D's browse collection rows** each select an item, so each is a button: reachable by `Tab`,
  activated by `Enter` and `Space`, carrying an accessible name that identifies the item rather than
  reading as "button".
- **Job A and Job C's queue rows** are a single-selection list, not a set of buttons. The list is one
  tab stop with roving selection: `role="listbox"` on the container, `role="option"` and
  `aria-selected` on each row, arrow keys moving selection. Thirty tab stops per screen would be worse
  than none.
- The distinction is deliberate — a collection you pick from behaves differently from a queue you walk
  through, and the two must not be given the same interaction model just because both are lists.

---

## Undo

Decisions persist and remove items from queues, which makes every keystroke feel consequential —
and hesitant admins are slow admins. Find content is the slow way back; undo is the fast one.

A persistent line in the action bar, not a toast:

```
Last: "Ep 32 — Re-Engagement Done Right" → No topic needed   ·   Undo
```

Always visible, updates on each decision, never interrupts. Toasts at 240 items would flicker.

**Contract:**

- Undo restores **the exact prior state**, not merely the absence of a decision. If topics were
  `[hiring, interviewing]` and were replaced, undo restores those two. The stack therefore holds
  before-images, not operations.
- **A bulk write is one entry.** Undoing a 23-item bulk reverses all 23 as a single action, never
  one row at a time.
- If another admin has changed an item since, undo **skips that item and names it** rather than
  overwriting their decision. A bulk undo that restores 20 of 23 says which three it did not, and
  why.

**Lifetime.** The stack survives moving between tabs inside Discovery admin. It is discarded on
navigating elsewhere in admin, on refresh, and on sign-out. It is in-memory session state and is
never persisted — Find content is the durable recovery route, and two mechanisms claiming to be
that route would be worse than one.

---

## Concurrency

Decisions are shared; skips are private and unstored. But last-write-wins is not acceptable
silently.

Each decision carries an **opaque token**, regenerated on every write and never reused. The client
sends the token it loaded; if it no longer matches, the write is refused and the admin is told who
changed it and when, with the choice to reload or deliberately overwrite.

Not `decided_at`, which is a display value rather than a concurrency primitive — it breaks on
same-instant writes and on clock differences between clients. And not an incrementing revision
either: an external edit **deletes** a decision, so a counter would restart at 1, and a client still
holding the old 1 would match a decision it had never seen. `decided_at` stays, for showing when.

This is a check on write, not a lock. The volume does not warrant locking, but a decision replaced
without anyone noticing is worse than a rare extra prompt.

---

## Job A · Add topics

**Opens on** the list — resources, canonical Library guides and whole courses together — sorted by **format, then title**,
with no grouping headers. Kind is shown on the row and available as a filter, but the two are not
split into separate modes: the question and the evidence are identical for both.

Sorting clusters similar material and builds rhythm. Grouping *headers* are deliberately absent: a
heading reading "Podcasts — 126" invites treating them as a set, which is the inference the bulk
guardrail exists to prevent. The clustering is navigation, not a claim about subject.

Format filter and title search above the list.

**Row** shows title, format, and current topics as compact chips — or an em dash when there are
none. **The topic picker is not permanently mounted.** It appears when the row takes focus and
collapses when focus leaves. *(hypothesis — verify on a realistic screen)*

Two reasons: 240 always-mounted comboboxes recreate the inert-control noise that made the original
screen unusable; and a mounted input would capture `1`, `2` and `S`, which the keyboard contract
forbids. Focus-to-edit resolves both.

**Answers.** `Save topics` (enabled once topics are chosen) · `No topic needed`.

**Where those answers sit is a hypothesis, not a decision.** Two buttons on every one of 240 rows is
the same repetition problem as the picker. Three candidates to test: on every row; on the focused
row only; or in a stable action area tied to the focused row. The third pairs naturally with the
panel — which already follows focus — and would keep the list densest, but that is a prediction, not
a finding.

**Bulk stages in the list, not a dialog:**

1. Select rows, or search and select all results.
2. *Copy topics from…* → **search for and choose an already-tagged item**, then see its exact topics
   before anything is proposed. The representative is never inferred, defaulted, or derived from a
   format marker. *Choose topics directly* is the alternative entry point.
3. Its topics appear on every selected row as **pending chips**, visually distinct from the topics
   those rows already carry, so existing and proposed are never confused.
4. Deselect any row to exclude it.
5. The action bar states the operation unambiguously: **`Add 3 topics to 23 items`**.

**An unsaved single-item edit blocks the start of bulk work.** The focused item's picker holds a
draft that has not been recorded; a bulk proposal would then put two uncommitted sets of topics on
screen at once, one of them invisible below the fold. So starting bulk asks first, and names the item:
**Save changes · Discard changes · Cancel.** Cancel leaves the draft untouched and starts nothing.
This is the only modal in the job, and it exists because the alternative is two competing drafts with
no way to tell them apart.

**Bulk adds. It never replaces.** Existing topics survive. Replacing an item's whole topic set is a
materially different action and must never happen implicitly through *Copy topics from…*; if
replacement is ever needed it is a separate, explicitly labelled operation.

No confirmation dialog listing 23 titles — the list is a better review surface than a modal,
because it shows each title in the context the admin has been reading all along.

**After a bulk write** the list stays filtered to exactly those items, their new topics shown as
committed, with the single bulk undo available. That is the moment a mistake is cheapest to catch.

---

## Job B · Check resources used inside guides

**Full width, one item at a time.** The guide is the workspace.

The containing guide is shown as a sequence of blocks with the resource highlighted in place. What
sits before and after it is the evidence — that is the entire question.

Where a resource sits in several guides, **all placements are shown** *(hypothesis — stacking may
not be the right presentation for an item in five guides; verify with real data)*. The decision is
whether it survives leaving *all* of them, so a count with one example is not enough.

**Answers.** `Suitable independently` · `Keep within its guide`.

**Deliberately absent:** topics, browse approval, visibility.

---

## Job C · Review hidden content

**Unblocked.** Canonical Library guides and whole courses are searchable types; course-internal
lessons and chapters are not. So the collection is **hidden resources, Library guides and whole
courses — none today**. Hidden structural nodes are outside the job entirely: allowing one in search
would do nothing because it is not an independent result.

**Two rules:**

- **A discovery decision and a current blocker are different things and are shown separately.**
  *Decision:* not yet decided, or deliberately hidden. *Blocker:* draft, archived, inaccessible.
  Unpublished is an observable blocker; it is not evidence of why something was hidden, and the
  interface must not infer intent from state.
- **Answers.** `Allow in search` · `Keep out of search`. These name a permission, not an outcome:
  a draft item can be allowed and still blocked from appearing until it is published, so wording
  that promises immediate findability would be untrue for part of the queue. The row states any
  blocker separately. Keeping something out of search is a completion, counted identically.

---

## Job D · Curate homepage browse

Not a queue. No completion, no percentage, no items-remaining, no caught-up state.

**Header is coverage, and the counts must not read as a breakdown:**

```
12 items approved for browse

Appearing in each category — an item with topics in two categories appears in both
  marketing 5     systems 4     hiring 3     mindset 0  ⚠ nothing here
```

Categories overlap, so they do not sum to the total, and the layout must never imply they do — no
stacked bar, no counts sitting adjacent to the total as if partitioning it. `mindset 0` is flagged
as worth investigating, and the wording says investigate, never fill.

**Two warning classes are filter chips on the collection, not a separate report:**
`Can't appear yet (3)` — unpublished, or embedded and still marked keep-within-guide.
`No inherited category (5)` — approved, but will only ever show under All.

**Body** is a compact list: title, format, inherited categories, warnings. Not a grid of
member-style cards; a card preview is available from the panel on demand.

**Add material** opens a searchable picker with **two sections**:

```
Ready to add
  Ep 32 — Re-Engagement Done Right   podcast · systems

Cannot be added currently
  Handling Objections     pdf · context not yet reviewed      → Review context
  Client Onboarding Pack  pdf · kept within its guide         → View context decision
  Client Feedback Form    pdf · unpublished                   → Open in Resource Library
```

Ineligible items are **shown with the reason**, never hidden — hiding them means an admin searches
for something they know exists, gets nothing, and cannot find out why.

**The wording is deliberately neutral.** "Needs preparation" would be untrue and quietly harmful: a
resource marked *keep within its guide* is a finished, valid decision, not unfinished work, and
implying otherwise pressures admins into overturning good decisions to fill a category. Hence three
distinct cases, and note that the middle one offers **View**, not a call to change it:

| Reason | Link | Why |
|---|---|---|
| Context not yet reviewed | Review context | Genuinely outstanding work |
| Deliberately kept within its guide | View context decision | A completed decision, shown for information |
| Unpublished | Open in Resource Library | Not a discovery decision at all |

Every link routes **out** to the owning surface. None lets the blocking decision be made from
inside this picker, which is what would turn curation into a back door.

---

## Fix a search

1. **What did the member type?** — free text.
2. **What they get now.** Default mode is labelled **General published discovery results**, not
   "any member" — no real member necessarily sees this, and the label must not claim otherwise.
   Results whose availability depends on member access are marked as such. Selecting a specific
   member reproduces that member's actual experience.
3. **None of these are right** → *What should they have found?* → item picker.
4. **The system recommends a correction** and explains its reasoning:
   *"'sellers guide' is not a topic, and this item has no alternate name. Adding it as an alternate
   name for this item would make this search find it."*
   It is a **recommendation, not an automatic fix.** Sometimes the cause is ranking or access
   rather than a missing word, and the workflow says so rather than inventing a synonym. The admin
   can always decline and take no action.
5. **Apply, and the search re-runs automatically**, showing the new result. Verification is not a
   step the admin has to remember.

**Admin test searches must not write member analytics events.** They would otherwise pollute the
zero-result data that is meant to feed this very workflow later.

A missing-topic fix hands off to Job A scoped to that item rather than duplicating the picker.

The tab states plainly that the analytics-fed problem list is still to come.

---

## Find content

The recovery route for every decision, so its search must be more than title lookup. **One field**
matching:

- Title
- Alternate name
- Resource or node ID
- Containing guide

One input, no filter panel — the point is to find a known item quickly, not to explore.

Select a result and the panel reads its decisions back in plain language:

```
Topics          "hiring", "interviewing"        you · 14 Aug
Guide context   Keep within its guide           Shelley · 2 Aug
Visibility      Searchable                      not yet decided
```

Each line has **Reopen**, routing into that decision's job scoped to that item. Nothing is edited
here. The moment raw settings appear on this screen, the jobs stop being where decisions are made.

---

## Filters, per surface

- **Job A** — format, title search.
- **Job B** — containing guide, format.
- **Job C** — decision state, blocker, content kind.
- **Job D** — category chips, title search, the two warning classes.
- **Find content** — the single combined search above.

---

## Build order

Nothing is released for real curation until Find content and undo exist. An admin making decisions
they cannot locate or reverse is the one failure this model cannot absorb.

1. Decision records, question-specific staleness, the undo contract, concurrency check.
2. Shared queue behaviour.
3. **Job B** — the smallest workflow with no unresolved product prerequisite, and the only focused
   flow, so it proves the hardest layout before four screens are built on an assumption. It does
   have a collection prerequisite: 108 embedded resources awaiting a context decision.
4. **Find content** — before any high-volume decision making.
5. **Job A** with bulk.
6. **Job D.**
7. **Fix a search.**
8. **Job C** — last by current volume, not by blocker: its queue is empty today, and Find content
   plus the higher-volume jobs matter more first. It remains available as new hidden content arrives.

---

## Still hypotheses

To be confirmed against a realistic screen with real data, not settled from prose:

- Focus-to-edit topic picker in Job A rows.
- Placement of the two answers: every row, focused row, or an action area tied to focus.
- One-third panel width, and the breakpoint where it moves below the list.
- Stacked presentation of multiple placements in Job B.

The first three are one question wearing three hats — **how much lives on the row versus in the
focused-item area** — and should be tested together as a single layout, not settled separately.
Answering them in isolation is how a screen ends up internally inconsistent.
