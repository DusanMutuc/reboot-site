# Filling in discovery — a guide for the admin

The software does not know what any of this content is about. It knows what you tell it. Search,
browse and recommendations all run off the same handful of fields, and there is no clever layer
underneath compensating for thin data.

So this guide is about what to type and what good looks like. The reasoning behind the design is in
[discovery-admin-design.md](./discovery-admin-design.md).

One thing to know before you start: decisions about an *item* are reversible and findable again
through *Find content*. Decisions about the *vocabulary* are not — merging two topics is one-way,
and undoing it means re-tagging by hand. Take your time over the vocabulary; move fast on items.

---

## What the software does with what you type

**Search** ranks on three signals, in this order:

| Where the words are | Strength |
|---|---|
| Title and alternate names | Strongest — and they get every ranking bonus |
| Topics and their synonyms | Middle |
| Description | Weakest, by a wide margin |

Two real results show what that gap means in practice. For *"energy leaks"*:

| Score | Result |
|---|---|
| **3.24** | `Energy Leaks` |
| 0.10 | `Ep 65 - Business Tasks - Energy Audit [Coaching Replay]` |

A thirty-fold gap, entirely from the title. Both are about the subject. Half the catalogue is
podcasts titled `Ep NN - … [Coaching Replay]`, so for half the catalogue **topics are the only way
in**. And they do work — for *"profit and loss"*:

| Score | Result |
|---|---|
| 2.20 | `Monthly Profit and Loss Report` |
| **1.38** | `To Incorporate or Not? Your 2026 Budget Blueprint` |

The second has none of those words in its title. It is found entirely through its topics.

**Algorithmic recommendations** run down this chain. Every arrow is a place it can return nothing, and the three
marked are the ones you supply:

```
the member's most recent business review
  └─ their action steps that are NOT complete
      └─ the Library guide linked to that step
          └─ the topics on that guide                      ← you supply this
              └─ resources carrying the same topic         ← you supply this
                  └─ that are approved for the homepage    ← you supply this
                      ├─ minus anything already inside that guide
                      └─ minus what the member marked finished / not interested
                          └─ best of each format, taken in turn
                              └─ shown only if this algorithmic slice has at least 4
```

Coach-selected suggestions are a separate, explicit route. A coach pick needs to be published and
safely openable, but it does **not** need homepage browse approval. The newest active coach pick is
shown first and may appear by itself. It remains until the member marks it *Finished* or *Not
interested right now*, or the coach removes it.

Three consequences worth carrying with you:

- **Guides aim the recommender.** An untagged guide produces nothing for any member attached to it,
  however well the resources are tagged.
- **A topic used once recommends nothing.** The match needs a guide *and* a resource to share it.
- **Fewer than four suitable algorithmic results and that slice stays hidden.** A coach-selected
  suggestion is not swallowed by that floor; one valid coach pick may still appear on its own.

---

## The job, in order

Two of these steps get much more expensive if done late, which is the only reason the order matters.

**1. Seed the vocabulary — don't finish it.** *Topics & synonyms.* A first list from what members
actually ask about, each with its category. Expect to revise it; a complete list built in the
abstract rarely survives contact with real content, and merging is one-way.

**2. Calibrate on a sample.** Tag a few guides and thirty or so resources across formats. Run the
searches you know members make. Fix the vocabulary now, while re-tagging means thirty items.

**3. Tag the Library guides and courses.** In the Library Editor and Course Builder properties
panel. There are 27 of them and they aim the entire recommender.

**4. Tag the resources.** *Assign topics.* Bulk for genuine groups — a podcast series, a set of
templates — then the rest from the row. Start with what you'd actually recommend this week.

**5. Approve homepage browse.** *Homepage browse.* This is the step that switches algorithmic
recommendations on. Watch coverage across all four categories, and a spread of formats. Explicit
coach-selected suggestions are the exception and do not require this approval.

**6. Answer standalone use as you go.** Faster while you have the guide open than swept up later.

**7. Keep checking.** *Fix a search* for phrases you know members use; look at a real member's
recommendations once there's more tagged.

---

## The fields

The titles below are real catalogue rows. The topics shown on them are worked examples — nothing is
tagged yet, so these illustrate the shape rather than record what exists.

### Topic — what a resource is *about*

A short phrase from a controlled list, attached to a resource, guide or course. Two to four per
resource. It adds words to search, decides which homepage category the resource appears under, and
aims the recommender.

**The test, before you use one:**

> Would a member ever want to see a list of *everything we have* about this?

**The test, before you create one:**

> Will I use this on at least five things?

If not, it's usually the same idea as a topic you have (make it a synonym), a name for one item
(make it an alternate name), or a subject you don't have content on yet (leave it out).

**What good looks like:**

| Item | Topics |
|---|---|
| `Energy Leaks` | time management · delegation · mindset |
| `Ep 95 - Price Drop Workshop` | price reductions · listing presentation |
| `To Incorporate or Not? Your 2026 Budget Blueprint` | profit and loss · business planning |

**The trap:** tagging what a resource *mentions* rather than what it's *about*. `Order Your
Stanchions` contains the word "stanchions" and nobody will ever go looking for a shelf of stanchion
material. Extra topics don't hurt ranking — that was measured — but every topic puts the resource
into another category chip and another recommendation pool, so eight topics means being offered to
eight different needs and answering none of them well.

### Synonym — the same idea, said differently

An alternative word for a **topic**, applying across the whole catalogue. Adding one instantly makes
every resource already carrying that topic findable by the new word, with no re-tagging.

**The test:**

> If a member typed this word, would they be happy with *everything* filed under that topic?

**What good looks like — and what's already handled:**

| Kind | Example | Worth a synonym? |
|---|---|---|
| Misspellings members keep making | `refferal` → *referral* | **Yes.** Search does not connect them |
| Abbreviations | `p&l`, `pnl` → *profit and loss* | **Yes.** No relationship the engine can infer |
| Real alternatives | *listing presentation* / *listing appointment* | **Yes.** Different words, one idea |
| Word forms | `delegating`, `delegation` → *delegate* | **No need.** Already handled |
| Plurals | `clients` → *client* | **No need.** Already handled |

Search stems English words before matching, so `hire`/`hiring` and `tag`/`tagging` are already one
word to it — pick one form and the other works.

**The trap:** a synonym list padded with one-off typos. Add one for a misspelling members *keep*
making; *Fix a search* shows you which ones recur. Note that you create synonyms by **merging**,
which keeps every tagged item and keeps the old word working in search — but is one-way.

### Alternate name — what people call this one thing

Extra names for **a single item**. Not vocabulary, not shared. They carry the *same weight as the
title* — the strongest signal in the engine — and are the most effective fix for one item that isn't
being found.

**The test:**

> Is this the name people actually use, that isn't in the title?

**What good looks like:**

| Item | Alternate name |
|---|---|
| `Ep 52 - Ben explains the TIM letter` | "the TIM letter" |
| A formally-titled script resource | "red carpet script" |
| Anything renamed | its previous name |

Also worth adding: whatever members call it in the Facebook group.

**The trap:** using one to describe a *kind* of thing. If the word would suit five resources, it's a
topic or a synonym. Nothing in the catalogue has an alternate name today — this is the cheapest
high-value field in the system and it is completely unused.

### Category — the four homepage buckets

Fixed, not editable: **Marketing & sales · Systems & operations · Hiring & team · Mindset &
leadership.**

You do not put a resource in a category. You put a **topic** in a category, and every resource
carrying that topic inherits it. Give every topic exactly one category, at the moment you create it;
the *No category* filter catches what you missed.

**The trap:** uncategorised topics. Tag a hundred resources with them and all four chips stay empty,
though the resources still appear in *All*. A topic that genuinely belongs to two categories is
almost always two topics collapsed — *client events* is marketing, *client onboarding* is systems,
and *clients* is neither.

### The switches — four different questions

| Setting | The question it answers | What it gates |
|---|---|---|
| **Published** | Is this finished? | Everything. Nothing works without it |
| **In search** | May members find this by searching? | Search results |
| **On the homepage** | Should we offer this to someone who isn't looking? | Browse and **algorithmic recommendations** |
| **Standalone use** | Does this make sense outside its lesson? | Whether it appears as itself or as its guide |

**The trap, twice over.** *On the homepage* also gates algorithmic recommendations, so an
unapproved resource cannot be selected by the related-material algorithm, however well it is
tagged. An explicit coach-selected suggestion is the exception: it only needs to be published and
safely openable. And *keep with its lesson* does not waste your tagging: the resource still matches
on its own title and topics, but the result shown to the member is the **lesson**. Tagging an
embedded worksheet is how the lesson becomes findable by the words on that worksheet.

---

## The screens

Under **Resources** in the admin sidebar. The first group follows the life of a resource; the last
three are tools you reach for when you need them.

| Screen | What it is for |
|---|---|
| **Resource Library** | Adding and editing resources — the file, title, description, publication |
| **Assign topics** | The tagging queue. Everything untagged, one at a time or in bulk |
| **Check standalone use** | Resources inside guides awaiting a decision on whether they work alone |
| **Not in search yet** | Content nobody has yet said members may find. New content starts here |
| **Homepage browse** | Choosing what appears when a member browses without searching |
| **Find content** | Locating an item and reading back every decision recorded about it |
| **Fix a search** | Diagnosing why a search did or didn't return what it should |
| **Topics & synonyms** | The vocabulary — creating, merging, categorising, retiring |

A count next to a screen means a queue that empties. *Homepage browse*, *Find content* and *Fix a
search* have no count because they never finish.

**Nothing is a decision until you make it.** A setting having a value doesn't mean anyone chose it.
*Find content* will tell you plainly when something has a value nobody reviewed — that's the
difference between "we decided this" and "this is what it defaulted to."

---

## Where things stand

*Snapshot, 3 September 2026 — here to show scale, not to be checked against later.*

258 resources, all published and in search. 20 Library guides, 7 courses. By format: 126 podcasts,
60 videos, 44 PDFs, 19 images, 7 links, 2 documents.

Treat the vocabulary as empty and the tagging as unstarted — in every way that matters, they are:

- No guide or course has topics — the recommender has nothing to aim with
- Nothing is approved for the homepage — the recommender has nothing to draw from
- 256 of 258 resources have no description
- Nothing has an alternate name

Two numbers to keep in mind while you work. Half the catalogue is podcasts with episode titles —
the content that most needs topics to be findable at all. And with 126 podcasts against 104 videos
and PDFs combined, step 5 will drift podcast-heavy unless you push against it.
