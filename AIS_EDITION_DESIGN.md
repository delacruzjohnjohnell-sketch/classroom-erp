# AIS Edition: merged design (2026-10-31)

Third edition of classroom-erp for Accounting Information Systems (James Hall). Built from three read-only studies: Hall's topics, the existing schema, and the Audit seat and controls. Nothing has been built or applied. The Standard and Manufacturing editions stay untouched.

Notes on sources: the Hall study used two web searches and public outlines, not the book. The student activities in it are proposals. Check the topic list against the edition you teach.

## 1. Decisions

| Question | Recommendation |
|---|---|
| Repo state | Settled. GitHub now matches the deployed code (HEAD 290deb3). |
| Ledger | Reuse `journal_entries` / `journal_lines`, period lock and immutability. No second ledger. |
| Posting | New `ais__post_entry`. Do NOT reuse `mfg__post_entry`: it absorbs up to 0.05 into a Rounding account and would hide the errors students must find. Exact balance only. |
| Seats | New `ais_company_roles` (ACCOUNTING, AUDIT), separate from `mfg_company_roles`, so none of the Manufacturing role gates touch AIS. A solo student can hold both seats. |
| Wrong decisions | A wrong POST still posts as the student chose. That posted error is what the Audit seat later finds. |
| Audit reversal | Your plan: the Audit seat executes the reversal. Studies suggest an option where Audit only proposes and Accounting executes (auditor independence). Make this a scenario switch; default per your plan. |
| Segregation of duties | Hard block in practice rounds; `ALLOW_LOGGED` in graded rounds so violations exist for Audit to detect. Teacher-only switch. |
| SQL lab and REA builder | Move after the MVP (big build, security surface). Your plan has them in Phase 6; the Hall study agrees with deferring. |
| Seeded randomness | Hash-based on seed + ids, never `random()`. Same seed gives the same packet, so regrading works. |

## 2. Architecture

**Reuse as-is:** ledger tables, period lock, immutability trigger, `is_teacher()`, `my_tenant_id()`, `tenant_edition()`, edition switch tables, `MfgFrame`, `CompanySwitcher`, `ListReport`, `ReverseModal`, `VoucherView`.

**Copy the pattern (do not call):** teacher-only key tables with no policies (0052); `mfg__my_tenant`; the activity loader interpreter (0063); key release (0051, but a separate `ais_key_releases` table).

**Minimal changes to existing objects (migration 0066):**
- Extend three edition CHECK constraints (0023, lines 30, 64, 198) to allow `AIS`. Find them by definition, do not hard-code names.
- Insert the `AIS` row into `edition_settings` (closed by default).
- New `ais_guard_membership` trigger, mirroring the Manufacturing one.

**Frontend code that assumes two editions:** `src/lib/edition.ts`, `src/lib/useEdition.ts` (silently maps unknown to Standard), `AppShell.tsx`, `choose/page.tsx`, `teacher/page.tsx` (`!== "MANUFACTURING"` lumps AIS in with Standard), `tests/edition.test.ts`. Read `node_modules/next/dist/docs/` before writing `/ais` pages.

## 3. Tables (all RLS; keys have no policies)

- Content (teacher only): `ais_sets`, `ais_set_txns` (packet template), `ais_set_keys` (hidden answer), `ais_controls` (control taxonomy, readable).
- Assignment: `ais_assignments`, `ais_company_roles`, `ais_instances` (one per company, holds the seed and the phase ACCOUNTING / AUDIT / CLOSED), `ais_instance_txns` (resolved packet, PENDING / POSTED / HELD), `ais_instance_keys`.
- Results: `ais_decisions` (result flags only, never key text), `ais_scores`.
- Audit seat: `ais_populations`, `ais_audit_tests`, `ais_samples`, `ais_workpapers`, `ais_findings`, `ais_audit_keys` (planted exceptions, teacher only), `ais_party_attrs` (bank account, tax ID, address, for overlap tests; avoids altering Standard tables).
- Release: `ais_key_releases`.

## 4. Functions (security definer; revoke from public and anon)

- Setup: `ais_create_team_company`, `ais__instantiate(instance, seed)`, `ais_set_import`.
- Accounting seat: `ais_next_packet`, `ais_decide` (post or hold; checks seat, phase, period lock, exact balance; grades against the key; echoes only pass or fail, if the teacher allows), `ais_close_accounting` (locks the books at `lock_date`, opens the Audit phase).
- Audit seat: `ais_population`, Benford, seeded sampling (random, stratified, monetary-unit), duplicate / gap / round / weekend / just-below-limit / vendor-employee-overlap tests, `ais_save_workpaper`, `ais_save_finding`, `ais_reverse_entry`, `ais_score_audit`.
- Teacher: key release, `ais_my_review`, `ais_teacher_review`, reset.

## 5. Practice sets, planted exceptions and grading

- A set is any number of transactions (5 to 500) tied to a handout topic; each has a packet and a hidden key (post or hold, correct journal, failed control tag).
- Tag every exception by type (credit limit, no receiving report, duplicate invoice, segregation of duties, cutoff, ghost employee, lapping, unauthorized journal entry, just-below-limit split). Grade as found / missed / false positive per type, which feeds the detection-rate heatmap.
- Seeded populations include clean-looking noise so false positives are possible.
- Benford needs about 300 or more items, so scenarios must generate bulk transactions.
- First sample set: the Sinag Rice Trading prototype (13 documents) loaded through the importer.

## 6. Topic map (Hall, by topic name)

Revenue cycle; expenditure cycle (purchases, cash disbursements, payroll, fixed assets); conversion cycle (reuse the Manufacturing engine); financial and management reporting (GL, adjusting entries, trial balance); ethics, fraud and internal control (COSO, SOX 404, fraud triangle, segregation of duties); IT governance and ITGCs (access, program change); auditing IT (test data, ITF, embedded audit module, CAATs); data management (relational DB, REA, SQL); systems development; ERP.

MVP features, ranked: exception registry and keys; document viewer; revenue three-way match and posting; purchases three-way match; audit sampling and vouching; findings with COSO / SOX rating; segregation-of-duties matrix and access review; payroll against HR roster (ghost employee); cutoff test; embedded-audit-module rules builder; test-data / ITF simulator; journal entry testing.

Defer: SQL sandbox, REA and normalization drag-and-drop, fixed-asset and conversion variances, DR, network, XBRL, SDLC, feasibility and ERP (quiz form only), Benford and lapping simulators until after the MVP.

## 7. Fraud scenario scripts (later phase)

Lapping, ghost employee, fictitious vendor, cutoff, duplicate payments (normalized `INV-100` vs `INV100`, since exact duplicates are already blocked), kiting. Each pairs a detective control for Accounting with a detection test for Audit.

## 8. Risks needing your sign-off

These exist today, before any AIS work:
1. **Students can write the ledger directly.** The 0001 tenant policy lets a student insert `journal_entries` over the API, bypassing any control. Fix: an additive RESTRICTIVE insert policy on `journal_entries` and `journal_lines` for AIS tenants. This touches existing tables, so it needs your approval. Alternative: accept it as a known limit.
2. **Students can change `books_locked_through` on their own company** (`guard_tenant_update`), so an Audit student could unlock the books. Fix: an AIS-only trigger.
3. **`reverse_journal_entry` has no seat or edition check** and any signed-in user can call it. Mitigated by the lock date and the policy in item 1.

Also: a posted decision is final and attempts are limited, otherwise a student can brute-force HOLD tags; the public repo exposes the teacher email in migration 0005 (consider making the repo private); do not touch the unrelated `omr_*` tables; Vercel SSO protection must not block students on `classroom-erp.vercel.app`.

## 9. Phases (each ends with a review and a regression check)

0. Done: recon and this design.
1. **MVP, Accounting seat end to end.** Migration 0066 (constraints, edition row, membership guard); 0067 (content, instance and decision tables; create-company, instantiate, post-entry, decide, close). One hand-written set of about 10 transactions. Frontend: edition plumbing, `/ais` inbox, packet review, ledger, teacher setup. Result: one real class session.
2. **Audit seat core.** Population, Benford, sampling, workpapers, findings, reversal, scoring, seeded anomalies.
3. **Key release and teacher tools.** Release, review, gradebook, heatmap, reset, full SQL integration test.
4. **Content and depth.** Hall practice sets by cycle, hash-chained audit log with verify function, access and change logs, approval limits, fraud scripts, handbook PDF.
5. **Data room.** REA builder, ER view, sandboxed read-only SQL lab.
6. **Systems development, seat rotation, set authoring screen.**

Regression approach: re-run `supabase/tests/regression_standard.sql` and the Manufacturing tests unchanged after each migration; extend `tests/edition.test.ts` for all 3x3 route guards; add `supabase/tests/integration_ais_phase1.sql` (keys unreadable to students, seat gating, unbalanced and locked-period posts rejected, double decision rejected, same seed gives identical packet, a wrong POST leaves exactly one entry, a reversal nets to zero once only, Standard and Manufacturing fingerprints unchanged).

## 10. Open questions

1. Apply migrations to a Supabase branch first (check branch cost) or straight to the live project? Recommended: branch.
2. First handout topic for the first real practice set. Recommended: revenue cycle (credit and shipping controls), as in the prototype.
3. Confirm: private company per student; hard block on segregation of duties in practice rounds; discard the earlier standalone schema draft.
4. Approve the ledger-hardening items in section 8 (items 1 and 2)?
5. Audit seat executes reversals (your plan) or proposes only?
6. Unconfirmed technical points before writing 0067: `pgcrypto` availability, the exact columns of `journal_entries` (`created_at`, `created_by`) and whether seeded rows may carry a chosen timestamp.
