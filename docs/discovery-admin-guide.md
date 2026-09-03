# Filling in discovery — a guide for the admin

Written 2026-09-03. Every claim about ranking and recommendations here was run against the current
search functions on the local development database — a clone of the real catalogue — and the worked
examples are real rows from it. Nothing was measured against production.

This is not a manual for the buttons. The buttons are mostly obvious. What is not obvious is what
each thing you type *does* three steps later, on a member's screen — and that is what decides
whether this system feels useful or feels broken.

---

## The one thing to understand first

The software does not know what any of this content is about. It knows what you tell it.

Search, browse categories, and recommendations are all downstream of the same handful of fields.
There is no clever layer that compensates for thin data — the engine is only as good as the
vocabulary underneath it. **How you fill this in *is* the member experience.** Not an input to it.

Which is also the good news, with one exception. Decisions about an *item* — its topics, whether it
is searchable, whether it works on its own — are recorded, reversible, and findable again through
*Find content*. Take your time over the *vocabulary* instead: merging two topics is one-way, and
undoing it means re-tagging by hand.

---

## If you read nothing else

| Field | What it is | The rule |
|---|---|---|
| **Topic** | What a resource is about | Two to four per resource; give every topic one category |
| **Synonym** | Another word for a *topic* | Use when it would suit everything under that topic |
| **Alternate name** | Another name for *one item* | Use when it only suits that one item |
| **In search** | May members find this by searching | |
| **On the homepage** | Offer this to people who aren't searching | Also switches on recommendations |

Three things that surprise people:

- **Topics on Library guides are what aim recommendations.** Untagged guides mean no recommendations
  for anybody, however well the resources are tagged.
- **"On the homepage" gates algorithmic recommendations, not just browse.** Explicit coach-selected suggestions are the exception; they need to be published and safely openable, not browse-approved.
- **Tagging a resource kept with its lesson is not wasted** — it is what makes the lesson findable.

Everything below is why those are true. Read it once; work from the card.

---

## The five things, and what each one is for

### 1. Topics — what a resource is *about*

A short phrase from a controlled list, attached to a resource, guide or course.

**What a topic actually does — three separate jobs:**

1. **It adds words to search.** The topic's name *and every one of its synonyms* get added to that
   resource's searchable text, at the middle weight — below the title, above the description.
2. **It decides which homepage category the resource appears under.** A resource has no category of
   its own. It inherits every category from its topics. No topics with a category → it appears in
   *All* and nowhere else.
3. **It aims the recommender.** A resource gets recommended when it shares a topic with the Library
   guide attached to something the member is behind on. No shared topic, no recommendation.

That third job is the one people miss, and it is the most valuable one.

**The test for whether something is a topic:**

> Would a member ever want to see a list of *everything we have* about this?

"Hiring" — yes. "Referrals" — yes. "Price reductions" — yes.

"Stanchions" — no. It is a real word in a real resource title (*Order Your Stanchions*), and that is
exactly the trap: a word can be genuinely present in the content and still be useless as a topic,
because nobody will ever go looking for a shelf of stanchion material.

A topic is a thing members have a recurring need about. It is not a keyword lifted from a title.

**How many per resource: two to four.**

Extra topics do not hurt a resource's ranking. That was measured: adding six unrelated topics left
the score identical, and a query that matches two of a resource's topics actually scores *higher*
than one matching a single topic. So the reason to stop at four is not ranking.

The reason is placement. Every topic puts the resource into another category chip and another
recommendation pool. A resource tagged with eight topics is being offered to eight different needs,
which means it is a good answer to none of them — and it will keep turning up as a recommendation
for members whose actual problem is something else.

**How many topics in total: keep the list small enough to hold in your head.**

The recommender works by finding a resource that shares a topic with a Library guide. A topic that
lands on one thing and nothing else can never produce that match — it is a label, not a connection.
Topics only do their most valuable job when they are **reused**.

So the test is applied when you *create* a topic, not afterwards:

> **Before adding a topic, ask: will I use this on at least five things?**
>
> If the answer is no, it is usually one of three things — the same idea as a topic you already have
> (make it a synonym), a name for one specific item (make it an alternate name), or a real subject
> you simply do not have much content on yet (leave it out for now and add it when you do).

A large literal vocabulary feels thorough and behaves worse. It fragments the catalogue into pockets
too small for anything to overlap, and it turns tagging into a search through a list nobody can
remember.

There is no target number, and you should distrust anyone who gives you one before there is real
tagging to look at. What matters is the shape: **a short list of topics that each cover a lot of
material**, rather than a long list that each cover one thing.

---

### 2. Synonyms — the same idea, said differently

A synonym is an alternative word for a **topic**. It applies across the whole catalogue.

**What it does mechanically:** when you attach a topic to a resource, the resource's search text
gets the topic's name *plus every synonym of that topic*. So adding a synonym to a topic instantly
makes **every resource already carrying that topic** findable by the new word. Retroactively, with
no re-tagging.

That is the whole reason synonyms exist. One edit, catalogue-wide.

**The test:**

> If a member typed this word, would they be happy with *everything* filed under that topic?

Yes → synonym. Only right for one specific item → that is an alternate name, not a synonym.

**What is genuinely worth a synonym — and what is not.** This distinction was measured, not
guessed:

| Kind | Example | Worth a synonym? |
|---|---|---|
| Misspellings members keep making | `refferal` → *referral* | **Yes.** Search does not connect them |
| Abbreviations | `p&l`, `pnl` → *profit and loss* | **Yes.** No relationship the engine can infer |
| Real alternatives | *listing presentation*, *listing appointment* | **Yes.** Different words, one idea |
| Word forms | `delegating`, `delegation` → *delegate* | **No need.** Already handled |
| Plurals | `clients` → *client* | **No need.** Already handled |

Search stems English words before matching, so `delegate` / `delegating` / `delegation` are already
one word to it, as are `hire` / `hiring` and `tag` / `tagging`. This was tested directly against the
engine. It means you never need both forms — pick one, and the other already works.

Misspellings are different. `refferal` does not stem to `referral`. Fuzzy matching may still scrape
it into the weaker "related" band of results, but it will sit below everything else. A synonym
promotes it to a proper match.

Add one only for a misspelling members **keep** making, not for every typo you can imagine. *Fix a
search* shows you which ones actually recur; a synonym list padded with one-off typos is just
another thing to maintain.

**Merging is how you create a synonym.** Merging *"refferal"* into *"referral"* keeps every tagged
item (they simply become tagged with *referral*), keeps the old word working in search, and removes
the old word from the picker. It is safe for the content and **one-way for the vocabulary** — there
is no undo, and reversing it means re-tagging by hand.

Which is why the vocabulary comes before the tagging. See the work order.

---

### 3. Alternate names — what people call this one thing

Extra names for **a single item**. Not vocabulary; not shared with anything else.

**What it does:** alternate names carry the *same weight as the title* — the strongest signal in the
whole engine. They are also the single most effective fix for one specific item that is not being
found.

**What they are for:** the name people actually use, that isn't in the title.

- *"the TIM letter"* — for `Ep 52 - Ben explains the TIM letter`
- *"red carpet script"* — for a resource titled something more formal
- The name it used to have before it was renamed
- The thing members call it in the Facebook group

**What they are not for:** describing a kind of thing. If the word would suit five resources, it is a
topic or a synonym, not an alternate name.

Nothing in the catalogue has an alternate name today. This is the cheapest high-value field in the
system and it is completely unused.

---

### 4. Categories — the four homepage buckets

Fixed, not editable: **Marketing & sales · Systems & operations · Hiring & team · Mindset &
leadership.**

**You do not put a resource in a category. You put a *topic* in a category, and every resource
carrying that topic inherits it.**

This is the part most likely to cause a "why is browse empty?" moment, so it is worth being blunt:

> A topic with no category contributes nothing to the four category chips. Tag a hundred resources
> with uncategorised topics and all four chips stay empty — though the resources still show up in
> *All*, if they are approved for the homepage.

**Give every topic exactly one category, at the moment you create it.** Nothing in the software
enforces this — it is a habit that keeps browse working. A topic that genuinely
belongs to two is almost always two topics that got collapsed — *"client events"* is marketing,
*"client onboarding"* is systems, and *"clients"* is neither.

---

### 5. The three switches: published, in search, on the homepage

These get confused constantly because they sound similar. They are three different questions with
three different consequences.

| Setting | The question it answers | What it gates |
|---|---|---|
| **Published** | Is this finished? | Everything. Nothing works without it |
| **In search** | May members find this by searching? | Search results |
| **On the homepage** | Should we offer this to someone who isn't looking for anything? | Browse and **algorithmic recommendations** |
| **Standalone use** | Does this make sense outside its lesson? | Whether it appears as itself or as its guide |

**Two of these have non-obvious consequences.**

**"On the homepage" also gates algorithmic recommendations.** The related-material algorithm draws
from the browse surface, which requires this switch. An explicit coach-selected suggestion is the
exception: if it is published and safely openable, it may appear without homepage approval.

**"Keep with its lesson" does not waste your tagging.** A resource kept with its lesson still
matches on its own title and its own topics — but the search result shown to the member is the
**lesson**, not the bare file. So tagging an embedded worksheet is how you make the lesson findable
by the words on that worksheet. It is some of the most valuable tagging you can do, and it looks
like the least.

---

## How search actually ranks things

You do not need the formula, but you do need the hierarchy, because it decides where your effort
pays off.

| Where the words are | Strength |
|---|---|
| **Title and alternate names** | Strongest — and they get every ranking bonus |
| **Topics and their synonyms** | Middle |
| **Description** | Weakest, by a wide margin |

The title gets bonuses nothing else gets: a large one for matching exactly, a smaller one for
starting with the query, another for containing it, and a fuzzy-match bonus for near-misses and
typos. Topics get a modest version of two of those. Descriptions get almost nothing.

**What follows from this:**

**A short, descriptive title beats everything.** Here are two real results for *"energy leaks"*:

| Score | Result |
|---|---|
| **3.24** | `Energy Leaks` |
| 0.10 | `Ep 65 - Business Tasks - Energy Audit [Coaching Replay]` |

A thirty-fold gap, entirely from the title. The Energy Audit episodes are genuinely about the
subject; they lose because their titles are episodic.

**Which means: the longer and more episodic the title, the more the topics matter.** Half the
catalogue is podcasts titled `Ep NN - ... [Coaching Replay]`. Some of those will still match a
member who types the exact phrase in the title — *price drop workshop* finds `Ep 95 - Price Drop
Workshop`. But a member searching for the *need* rather than the episode name will not, and for
those, topics are the only way in.

**This is not a licence to rename things for search.** An accurate title, a couple of alternate
names and the right topics do the job together. A title rewritten to game ranking is worse for the
member reading a list of results, which is where titles do most of their real work.

**Topics genuinely work.** A real result for *"profit and loss"*:

| Score | Result |
|---|---|
| 2.20 | `Monthly Profit and Loss Report` |
| **1.38** | `To Incorporate or Not? Your 2026 Budget Blueprint` |

The second has none of those words in its title. It is found entirely through its topics, and it
ranks above everything else that isn't a literal title match.

**Descriptions are mostly for the member.** They do count for search — they are the weakest of the
three signals, and about a fifth as strong as the title on a fuzzy match. So write them for the
person deciding whether to open something, and take the small search benefit as a bonus. Almost
nothing in the catalogue has one.

---

## How recommendations actually work

This matters because it is the half of the system that runs without the member asking for anything,
and it is the part most sensitive to how you fill things in.

The chain, in order:

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
                              └─ shown only if there are at least 4
```

Every arrow is a place it can return nothing, and the three marked above are the three you supply.
Until all three have something in them the recommender returns nothing for everybody — which is the
state today, and is not a bug.

**What falls out of this:**

**Tag the Library guides first.** They are what aims the recommender. An untagged guide produces no
topic signal for any member attached to it, no matter how well the resources are tagged. There are
20 Library guides and 7 courses — a morning's work, and the single highest-leverage hour in this
entire project.

**A topic used once recommends nothing.** The match requires a guide *and* a resource to share it.
This is the same argument as the small vocabulary, arriving from the other direction.

**Approve a spread of formats.** Recommendations are assembled by taking the best of each format in
turn — one video, one podcast, one PDF, then the second of each. If everything approved for the
homepage is a podcast, every recommendation is a podcast. The catalogue is 126 podcasts, 60 videos,
44 PDFs, so this is a live risk, not a theoretical one.

**There is a floor of four.** Fewer than four suitable results and the member sees no
recommendations at all, rather than a thin-looking set.

That floor applies to a member's whole recommendation set, not to each category — categories play no
part in aiming recommendations, shared topics do. So it is not "four per category"; it is that a
member whose priorities only reach three suitable resources sees nothing.

---

## The size of the job

*Catalogue snapshot, 3 September 2026. These counts go out of date the moment work begins — they are
here to show the scale, not to be checked against later.*

Treat the vocabulary as empty and the tagging as unstarted — in every way that matters, they are.
What exists is the material, not the organisation of it.

**What there is to organise:**

| | |
|---|---|
| Resources, all published and all in search | 258 |
| Library guides | 20 |
| Courses | 7 |

**What they are:**

| Format | Count |
|---|---|
| Podcast | 126 |
| Video | 60 |
| PDF | 44 |
| Image | 19 |
| Link | 7 |
| Document | 2 |

Two things follow from that mix.

**Half the catalogue is podcasts with episode titles** — the content that most needs topics to be
findable at all. See the ranking section above.

**A podcast-heavy catalogue produces podcast-heavy recommendations** unless you deliberately approve
videos and PDFs for the homepage. Recommendations take the best of each format in turn, so the
spread you approve is the spread members get.

**What is not yet decided, and gates everything:**

- No Library guide or course has topics yet — the recommender has nothing to aim with
- Nothing is approved for the homepage — the recommender has nothing to draw from
- 256 of 258 resources have no description — members choosing from a list have little to go on
- Nothing has an alternate name — the cheapest high-value field in the system, entirely unused

---

## The order to do this in

The sequence matters, because two of these steps are much more expensive if done late.

**1. Seed the vocabulary — don't finish it.**
*Topics & synonyms.* Write a first list from what you know members actually ask about — the recurring
subjects of the programme, not a survey of the catalogue. Give each topic its category as you create
it; the *No category* filter shows anything you missed.

Resist the urge to design the whole taxonomy up front. An elegant list built in the abstract rarely
survives contact with real content, and merging is one-way, so a wrong guess is expensive. A first
pass you expect to revise is safer than a complete one you expect to keep.

**2. Calibrate on a sample before committing.**
Tag a representative handful — a few Library guides and thirty or so resources across different
formats. Then run the searches you know members make, and look at a real member's recommendations.
You will find topics too broad to be useful and gaps you did not predict. Fix the vocabulary now,
while re-tagging means thirty items rather than three hundred.

**3. Tag the Library guides and courses.**
In the Library Editor and Course Builder properties panel. Highest leverage in the system — this is
what points the recommender at anything at all, and there are only 27 of them.

**4. Tag the resources.**
*Assign topics.* Two to four each. Use bulk for genuine groups — a podcast series, a set of
templates — and do the rest from the row. Start with anything you would actually recommend to a
member this week; there is no need to reach the bottom of the list before the system starts working.

**5. Approve homepage browse.**
*Homepage browse.* Watch two things: coverage across all four categories, and a spread of formats.
This is the step that switches algorithmic recommendations on. Explicit coach-selected suggestions
do not require homepage approval.

**6. Answer standalone use as you go.**
*Check standalone use*, or directly in the builder while you have the guide open. Answering it while
assembling a guide is much faster than sweeping for it later.

**7. Keep checking.**
*Fix a search* for the phrases you know members use, and look again at a real member's
recommendations once there is more tagged. Expect to find gaps — that is what the screen is for.

---

## Rules of thumb, collected

1. A topic is something a member has a **recurring need** about, not a word from a title.
2. **Two to four topics** per resource. Extra topics don't hurt ranking — they push the resource
   into category chips and recommendation pools where it isn't the best answer.
3. **Before adding a topic, ask whether you will use it on at least five things.** If not, it is a
   synonym or an alternate name. Reuse is what makes recommendations possible.
4. **Synonym** if it would suit everything under that topic. **Alternate name** if it only suits this
   one item.
5. Don't bother making synonyms of **plurals and word forms** — search already handles those. Do make
   synonyms of **misspellings and abbreviations** — it does not.
6. Every topic gets **exactly one category**. A topic that needs two is probably two topics.
7. **Short descriptive titles win.** Where the title is a long episode name, topics are the only
   thing that will find it.
8. Write **descriptions for the member reading the card**, not for search. They barely affect
   ranking.
9. **Tag the guides before the resources.** Guides aim the recommender.
10. Approve a **spread of formats** for the homepage, or every recommendation will be a podcast.
11. Fewer than **four** suitable results and a member sees no recommendations at all.
12. Tagging a **resource kept with its lesson** is not wasted — it is how the lesson becomes findable.
13. **Settle the vocabulary before tagging at scale.** Merging is one-way, and a topic invented late
    does not appear on what you already tagged.

---

## The screens, briefly

Under **Resources** in the admin sidebar. The first group follows the life of a resource; the last
three are tools you reach for when you need them.

| Screen | What it is for |
|---|---|
| **Resource Library** | Adding and editing resources themselves — the file, title, description, publication |
| **Assign topics** | The tagging queue. Everything with no topics yet, one at a time or in bulk |
| **Check standalone use** | Resources sitting inside guides, awaiting a decision on whether they work alone |
| **Not in search yet** | Content nobody has yet said members may find. New content starts here by default |
| **Homepage browse** | Choosing what appears when a member browses without searching |
| **Find content** | Locating a specific item and reading back every decision recorded about it |
| **Fix a search** | Diagnosing why a search did or didn't return what it should, and the searches worth looking at |
| **Topics & synonyms** | The vocabulary itself — creating, merging, categorising, retiring |

Two things worth knowing about how these behave:

**A count next to a screen means a queue that empties.** *Homepage browse*, *Find content* and *Fix
a search* have no count because they never finish — they are collections and tools, not backlogs.

**Nothing is a decision until you make it.** A setting having a value does not mean anyone chose it.
The queues are careful about this distinction, and *Find content* will tell you plainly when
something has a value that nobody ever reviewed. That is not a bug in the display — it is the
difference between "we decided this" and "this is what it defaulted to", and it is worth trusting.

---

## What this guide is not sure about

Stated plainly, because a guide that sounds certain about everything is harder to correct.

“Two to four topics per resource” is a judgement, not a measurement. Extra topics are provably
rank-neutral, so the number rests on an argument about placement — that a resource offered to eight
different needs answers none of them well. That argument seems right, but it has not been tested
against members, and it should be revisited once there is real tagging and real traffic to look at.

The same applies to tagging guides before resources: it follows from how the recommender is wired,
not from experience with this catalogue.

What is *not* uncertain is the direction: a small, reused, categorised vocabulary beats a large
literal one; guides must be tagged for recommendations to work at all; and the homepage switch is
the gate on the whole recommendation system. Those follow from the engine's construction, and
measurements against the real catalogue back them up.
