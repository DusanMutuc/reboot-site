# Implementation guide seed content

The first seed contains **15 guides and 58 steps**, based on the resource-library PDF audit. It is curated content for the existing Foundation and Legends scorecard systems, not an automatic conversion of PDF headings into checkboxes. Each step links to its supporting resource record and inclusive PDF page range; page numbers are physical PDF pages, not the book's printed numbering.

The source of truth is `data/implementation-guides.seed.json`. Audience and `systemKey` match the active catalog. Step IDs were generated with UUIDv5 using the URL namespace and a stable identity shaped as `https://rebootmembers.com/implementation-guides/v1/{audience}/{systemKey}/{semantic-step-key}`. Preserve those IDs when editing titles or descriptions so existing progress remains attached to the same work.

## Seeded guides

| Audience / system | Steps | Principal sources | Editorial grouping |
| --- | ---: | --- | --- |
| Foundation / Hire First Assistant | 6 | 181 pp. 2-9; 182 pp. 1-5; 183 pp. 2-4 | Scope and role definition, publish an ad, screen, interview, confirm the hire and arrange the two-way review. Example wages, employer details and candidate demographics are not adopted as defaults. |
| Foundation / Red Carpet / Champagne Close | 3 | 188 p. 2; 189 p. 2 | Assemble the kit, prepare the handover process, deliver the experience and share the photo. This documents the **Red Carpet variant**; no Champagne Close procedure was inferred. |
| Foundation / 90 Day Magnet | 4 | 189 p. 2 | Organize the due batch, choose the sleeve/direct-print version, produce it, mail it. Preserves the source's three-month or next-quarter options. |
| Foundation / Birthday System | 4 | 192 p. 2 | Client list, supplier/process, monthly cards/list, supplier handoff. Handoff completion does not claim future deliveries already happened. |
| Foundation / Deal Flow Emails Installed | 4 | 197 pp. 2-10 | Map triggers, adapt the buyer set, adapt the seller set, hand over sending responsibility. No CRM automation or platform tutorial was invented. |
| Legends / Deal by Deal Feedback Tracking | 5 | 198 pp. 2-8; 199 p. 1 | List and trigger, questionnaire, message templates/responsibility, launch, review and thank clients. |
| Legends / Lottery Ticket Anniversary | 4 | 200 pp. 2-8 | Monthly client list, script variants, prepare the batch, send it. Retains relationship/year variants and the fourth-year small-gift variation. |
| Legends / Client Feedback Insulator | 8 | 193 pp. 2-5; 194 p. 1; 277 pp. 2-16 | List/delegation, form, campaign preparation, launch/follow-up, draw, findings, thank-you mailout, next annual date. Removes the source's non-operational “pat yourself on the back” item. |
| Legends / Newsletter System | 5 | 202 pp. 3-7; 203 p. 1 | Platform/cadence/responsibilities, audience, template, first issue/test, actual first send. Retains weekly, fortnightly and monthly options. |
| Legends / Four Quadrant Team Offer | 4 | 240 pp. 1-4 | Each quadrant is a meaningful authored output. Culture uses the five mission-statement pillars. Final step assembles/reviews the offer. Compensation and recruiting are outside this guide's scope. |
| Legends / Relationship Energy Audit | 2 | 237 pp. 7-8 | Complete the relationship ratings, then reflect and identify changes. Does not require completing every resulting conversation before the audit is done. |
| Legends / Environmental Energy Audit | 2 | 237 p. 1 | Complete environment ratings, then record desired changes. Does not conflate an audit with a move or purchase. |
| Legends / Business Task Energy Audit | 2 | 237 pp. 2-3 | Complete the task table, then the work reflection. The image-only task table was visually inspected; its Fuels Me / N/A / Drains Me choices are retained. |
| Legends / Relationship with Fear - Write Letter | 2 | 230 p. 2; 228 p. 1 | Reflect on the relationship, then write the complete three-prompt letter. Does not claim the training or separate questionnaire is complete. |
| Legends / Impact Filter Used for Delegation | 3 | 185 p. 1; 194 p. 1; 193 p. 2 | Define purpose/result, complete the work plan, use it in an actual handoff conversation. The blank filter plus explicit delegation instructions are sufficient for this narrow guide. |

## Completion semantics

A checkbox means the described work has happened. Titles name an observable output or event, with related instructions combined into descriptions. Supplies, templates and scheduling are separate from sending, mailing, interviewing or running a draw. Future execution remains unchecked even if its preparation is finished. Where the system is specifically an audit or installation, the checklist ends at that output; it does not invent a requirement to finish all future work arising from it.

Coaches can perform preparation and writing tasks with the member during calls and verify completed external actions in later calls. Meeting notes can capture batch dates and context without adding a checkbox for every recipient, prompt, card or email. System completion remains a separate coaching decision, particularly where the scorecard name covers more than the sourced variant.

## Source decisions and discrepancies

- **Deal-by-deal survey trigger:** 198 p. 4 recommends a conditions-waived milestone, while 199 p. 1 describes the deal as complete. The guide asks the coach/member to choose and record the appropriate trigger; neither source's wording becomes a universal transaction rule. The invitation examples also say six questions while the question list contains ten prompts; the seed asks authors to make the invitation match the survey they built.
- **Environmental rating typo:** 237 p. 1 says to avoid 5 and 7, but its first printed row includes 5 and omits 4. The seed follows the written instruction. The business-work reflection uses the stated 1-10 scale rather than copying its inconsistent printed numeral row.
- **Historical/legal/platform details:** The hiring and deal-flow PDFs contain local examples and transaction claims. The seed asks members to define/adapt their actual arrangement and communications; it does not propagate sample compensation, hiring-demographic preferences, default possession times or broad legal claims. Newsletter menu paths, free-tier limits, benchmark percentages and summarized consent rules are not copied as current product instructions.
- **Dates and options:** Actual source options are retained. November is described as the Insulator guide's recommendation; members save their own campaign dates. Fixed dates on sample Impact Filters, newsletter review times and sample sender identities are not defaults. Generic Impact Filter content retains the form's five work chunks but uses the real project's completion date.
- **Aliases and duplicates:** “Team Offer Builder” is the four-quadrant workbook. The Fear letter uses 228 instead of duplicating the equivalent 231 exercise. Resource 185 has a hiring title but contains a generic blank Impact Filter. Resource 277 is only an example of summarizing findings, not evidence of how to implement every system mentioned in respondents' comments.
- **External references:** The Insulator PDF points to a separate Google Form and video. The seed cites the PDF's instructions; it does not invent those external resource IDs or claim that their availability was verified in the PDF audit.

## What is intentionally not seeded

All 15 proposed candidates were included, with the narrower scopes above. Other scorecard systems remain unseeded in this first content set; this is not a claim that none have useful resources. In particular:

- Listing Presentation, The Guarantee, Commission Breakdown and Market Curve have useful sample assets and teaching material, but no complete implementation sequence was inferred from those examples in this seed.
- Re-engagement and Christmas in July have planning worksheets/Impact Filters. Their full campaign procedure was not expanded beyond what those short supporting sources actually establish.
- Second Assistant Hired and Buyer's Agent or Team Member Hired are not automatically filled from a first-assistant guide or an offer worksheet; those sources support only parts of the respective workflows.
- Relationship with Fear Training is separate from Write Letter. The lesson refers to a questionnaire not contained in the PDF, so the letter guide is not promoted into a complete training guide.
- Buyers Dinner has presentation slides, not an event implementation process. The energy workbook does not establish a 48 Hour Time Audit, and its body-reflection pages do not belong to the three named energy audits.
- Social Tag Conversion and Proof Builder have substantial material but no exact current scorecard system. No new system was created, and those guides were not forced into unrelated social-media/video systems.

Seed validation checked every audience/key pair against the active catalog, UUID uniqueness, required content, title/description limits, PDF resource existence and page bounds. It did not modify the application, database or source PDFs.

## Seed migration and regeneration

`supabase/migrations/20260925030000_seed_system_implementation_guides.sql` is generated from the curated JSON by `node tools/generate-implementation-guides-seed.mjs`. Run the command with `--check` to validate the content and confirm the checked-in migration matches it without writing a file. The generator has no network or database dependency; it freezes only the 20 audited source identities and PDF page counts needed to validate this seed. Source titles are exact, including the trailing space in resource 185's title.

The migration runs as a privileged transaction and:

1. Resolves each source by original ID **and** exact title/type. If that combination does not exist locally, it accepts a single exact title/type match under a different ID. Missing or ambiguous matches produce a `NOTICE` and omit only that source link. A reused numeric ID with a different title or media type never wins. The checklist prose is retained, and an empty resource array is valid.
2. Seeds only systems whose stable key belongs to an active scorecard for the specified audience. Inactive or absent systems produce a `NOTICE` and are skipped.
3. Preserves every existing guide header and version, including an intentionally cleared guide. Concurrent first creation also uses `ON CONFLICT DO NOTHING`, so administrator work is never replaced.
4. Remaps references and then calls `normalize_system_implementation_guide_steps`, the same internal validator used for administrator saves. It inserts a new header at revision 1 and its version-1 snapshot atomically. The existing deferred foreign key permits that insertion order.

Guide UUIDs use the URL namespace and `https://rebootmembers.com/implementation-guides/v1/{audience}/{systemKey}`. The migration briefly takes a shared lock on the resources table so source renames, deletions and new duplicate titles cannot race reference resolution. The lock ends with the transaction. Existing guides are not updated on reruns; skipped guides can be seeded by rerunning this SQL after their scorecard becomes available, while intentionally omitted resource links on already-seeded guides can be added through the admin editor.

Regenerate this migration while it is still being prepared for its first deployment. After deployment, publish content changes through the versioned administrator workflow or a new migration; changing this historical file does not update a guide already present in a database.
