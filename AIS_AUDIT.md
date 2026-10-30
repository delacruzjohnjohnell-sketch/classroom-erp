# AIS edition: functionality audit (2026-10-31)

Question asked: before writing the handbook, does the AIS edition do what it should, so that students **understand all the transaction cycles and apply them hands-on**?

Short answer: the machinery is sound and secure, but today it teaches **one cycle, by reviewing documents**, not **all cycles, by doing them**. Fix the learning loop, then build the cycles as hands-on workbenches, then write the handbook.

## 1. What was checked

| Area | How | Result |
|---|---|---|
| Hidden data | As a student's API role: read keys, results, planted exceptions, sets, set templates; read another company's packets, ledger, decisions | 0 rows everywhere |
| Writes | Direct updates and inserts to packets, scores, seats, phase; calling teacher-only and other-seat functions; deciding another company's document | All refused or changed 0 rows |
| Supabase advisors | Security and performance, filtered to `ais_` objects | Nothing unexpected (see 4) |
| Logic | Rolled-back runs of the whole flow on the live engine: desk (both modes), close, seeded population, 7 tests, sampling, workpapers, findings, reversal, scoring, gradebook | Every figure matched a hand calculation (desk 66/78 and 78/78; audit 111/166, 126/166, 0/150) |
| Screens | Live teacher pages (AIS companies, class gradebook) in the browser: render, console errors | Render correctly, no console errors |
| NOT checked | Student screens (inbox, document review, Audit room) in a real browser; phones; accessibility | Only type-checked, linted and unit-tested |

## 2. What works

- Two seats with real separation: the Accounting seat cannot use the Audit functions and the reverse; keys never reach a student; a decision is final; the ledger can only be written by posting a document.
- A practice set is data (documents, hidden key, planted exceptions) with per-company numbers from a seed, so students cannot copy each other.
- The Audit seat has real tools: population, seven CAAT-style tests, reproducible sampling, workpapers that freeze when signed, findings in condition / criteria / cause / effect form, reversal after the closed period.
- The teacher sees the key, the planted exceptions, a class gradebook (CSV), which exception types the class misses, and which desk documents fooled it.

## 3. Findings

| # | Finding | Why it matters | Severity |
|---|---|---|---|
| F1 | **No feedback loop in graded mode, and none on revisiting a document.** The explanation of the right answer is shown only once, immediately, in practice mode. After the graded phase closes the student sees a score but never why a document was right or wrong. | Learning happens in the explanation. Right now the best teaching text in the set is read only by the teacher. | High |
| F2 | **Packets are not tied to the books.** "Balance owed before this order" is always 0.00, so the credit-limit control is a single comparison and no accounts-receivable balance exists to check. | Hall's revenue cycle is about checking an order against the customer's running balance. | High |
| F3 | **Segregation of duties is only a document trap.** The company setting (enforce / allow-and-log) exists but nothing reads it: no maker-checker, no approvals, no limits. | One of the main controls in the textbook cannot be practised. | High |
| F4 | **No reset.** One practice set per company, no unassign or reset; the teacher cannot fix a set once it is assigned. Every re-run needs a new company. | Awkward in a real class; typos are permanent. | Medium |
| F5 | **No pairing or rotation.** A student can hold both seats and audit their own posting. The "independent auditor" idea is not enforced or taught. | The Audit seat's value is independence. | Medium |
| F6 | **Unfair noise in one test.** The set's cash receipts are round amounts, so the round-amount test flags a non-planted entry and a student who reports it loses 2 points. | Punishes sound judgement. | Medium |
| F7 | **Tests are built for the revenue population.** The gap test reads "Sales invoice INV-n" memos; duplicates match customer + amount. A purchases or payroll population needs its own tests. | Every new cycle needs test work, not only content. | Medium |
| F8 | **Process is not graded.** Scoring counts exceptions found, not sampling quality, workpaper completeness or reasoning. Closing the audit does not require a signed workpaper. | Students can score by luck with no documented work. | Medium |
| F9 | **No teaching layer in the app.** Screens have one-line hints; nothing explains the cycle, the documents or the controls before the student must decide. A practice-mode refusal gives no hint beyond "wrong journal". | A student who has not read the textbook cannot start. | Medium |
| F10 | The Accounting seat can read the whole ledger, including the seeded population, before the audit (it cannot read what was planted). | A solo student can pre-run analytics. Acceptable in practice rounds. | Low |
| F11 | Student screens have never been clicked through in a real browser; mobile and accessibility unchecked. | Unknown defects on the screens students use most. | Unknown |

## 4. Housekeeping from the advisors (low)
10 foreign keys on `ais_` tables without an index (small tables); two policies (`ais_controls`, `ais_finding_types`) re-evaluate `auth.uid()` per row (wrap it in a select). The 37 "callable by signed-in users" warnings are the intended RPC surface; each function checks the seat or the teacher. The 5 "RLS enabled, no policy" warnings are the answer-key tables, on purpose.

## 5. Coverage of Hall's transaction cycles (topic names, not chapter numbers)

"Hands-on" below means the student **performs** the steps and meets the controls, not only reviews finished documents.

| Cycle / topic | In AIS today | What hands-on needs |
|---|---|---|
| **Revenue** (sales order, credit check, shipping, billing, A/R, cash receipts, returns) | Review and post/hold 13 documents; audit the sales ledger | Enter the order, run the credit check against the real A/R balance, ship, bill, collect; customer subledger and aging; allowance for doubtful accounts |
| **Expenditure: purchases and A/P** (requisition, PO, receiving, supplier invoice, three-way match) | Nothing | The full flow with a match step and a hold queue; vendor master; A/P subledger |
| **Expenditure: cash disbursements** | Nothing | Payment batch, approval limits, check/transfer, bank reconciliation |
| **Payroll** | Nothing | Time and master-file changes, payroll register, the ghost-employee control |
| **Fixed assets** | Nothing | Acquisition vs expense, depreciation run, disposal, physical count |
| **Conversion / inventory** | Nothing (the Manufacturing edition covers production) | Inventory movements, count differences, costing |
| **General ledger and reporting** | Ledger and trial balance | Adjusting entries, closing, financial statements, management reports |
| **Controls and IT** | Seven analytics tests; one SoD document trap | Access and change logs (ITGC), approval limits, maker-checker, a tamper-evident audit log |
| **Auditing IT** | Sampling, Benford, duplicates, gaps | Test data / integrated test facility, embedded audit module rules |
| **Data and systems** (REA, relational design, SQL, SDLC, ERP) | Nothing | REA diagram builder, sandboxed SQL, change-request approval |

## 6. The design gap behind the goal

The edition is built around **reviewing** (decide on a finished packet; test finished books). Hall's cycles are about **processing** transactions under controls. The next layer should be a **cycle workbench**: a guided sequence where the student creates each document in order (the system generates the next from what they entered), controls fire at the right step (credit check against the live balance, three-way match, approval limits), subledgers update, and then a **second student reviews the first student's postings** with the Audit tools. The existing engine can carry this: tasks instead of finished packets, forms instead of a journal grid, the same hidden keys and the same scoring.

## 7. Recommended order

1. **Close the learning loop (small).** Explanations after the phase closes and on revisit (F1); practice-mode hints after repeated refusals; a teacher reset / re-assign (F4); fix the round-receipt noise (F6); the housekeeping in section 4.
2. **Click-test the student flow in a real browser** with a test student (F11) and fix what it finds.
3. **Build the revenue cycle as a workbench** (F2, F3, F5): customer master, A/R balance and aging, order, credit check, shipping, billing, cash receipt, maker-checker with approval limits, pairing of an Accounting student with an Audit student. This is the template for the other cycles.
4. **Repeat for expenditure** (three-way match, A/P, disbursements), then **payroll**, **fixed assets**, **general ledger close and statements**, with their own planted exceptions and tests (F7).
5. **Grade the process** (F8) and add the **teaching layer**: a short primer per cycle and per document type, in the app (F9).
6. **Then the handbook**, written against screens that have stopped changing.

## 8. Decisions needed

1. Is "hands-on" the **processing workbench** described above (students create the transactions), with review as the second half?
2. The order of cycles after revenue: purchases and disbursements first, then payroll, fixed assets, close?
3. **Pairing:** should the teacher assign an Accounting student and an Audit student per company (recommended), or may one student hold both?
