# BIR eForms Lab: report for Phases 2 to 5

Status: all 26 forms of the spec are in the lab, with lesson, filling guide, tips, quick check and three cases each (easy, average, difficult), except 2550M (history lesson only, by design). Nothing is committed or deployed. No migration is needed (0084 already covers the instructor data).

Checks run at the end: `npx tsc --noEmit` clean, `npx eslint src/birlab src/app/bir-lab` clean, `npx next build` succeeds (new routes: calendar, which-form, scenarios, progress, teacher), `npx vitest run` 525 tests pass, `npm test` (node:test suite) 213 pass.

## What was built

| Phase | Forms | Notes |
|---|---|---|
| 1 (done earlier) | 1701A | foundation |
| 2a | 1701Q, 1700 | |
| 2b | 1701, 1701-MS | |
| 2c | 1702-RT, 1702-EX, 1702-MX, 1702Q | 1702-MX uses two columns: regular and special rate |
| 2d | 2316, 2307, 1604-C, 1604-E | |
| 2e | 1706, 1707 | |
| 3 | 2550Q, 2551Q, 1601-C, 0619-E, 1601-EQ, 1606, 2000, 2000-OT, 2550M (history) | |
| 4 | 1800, 1801 | |
| 5 | Filing calendar, "Which form?" helper, 3 cross-form scenarios, My progress, Instructor page | |

Every case key is computed by the form's own engine and every case has hand-computed figures in `src/birlab/__tests__/phase2.test.ts`, written from the case's solution text (not from the code). Every case is also filled in a rendered form in `ui-all.test.tsx`, validated and scored 100%.

## Official versions used (PDFs saved in `docs/bir-forms/`)

1700 Jan 2018 ENCS v6 · 1701 Jan 2018 · 1701A Jan 2018 v5 · 1701-MS Aug 2024 (+ Guide) · 1701Q Jan 2018 (+ Guidelines) · 1702-RT / 1702-EX / 1702-MX / 1702Q Jan 2018 ENCS · 2316 Sep 2021 · 2307 Jan 2018 · 1604-C Jan 2018 · 1604-E Jan 2018 · 1706 Jan 2018 · 1707 Apr 2021 (+ Guidelines) · 2550Q Apr 2024 (+ Guidelines) · 2551Q Jan 2018 · 1601-C Jan 2018 · 1601-EQ Jan 2019 (+ Guide) · 1606 Jan 2018 · 2000 (DST) Jan 2018 · 2000-OT Jan 2018 · 1801 Jan 2018 · 0619-E Guidelines Jan 2018.

## Not built from the official form PDF (check before class)

- **1800 (Donor's Tax)**: no official PDF could be downloaded. Built from the Code (6% over ₱250,000 a calendar year; 30 days). Item labels are descriptive, not the printed numbers.
- **0619-E**: only the Guidelines PDF was available. Deadline, who files and penalties are from it; the item labels are descriptive.
- **2550M**: no current PDF exists (the BIR list shows a 2007 version). Taught as history only. Its old due date ("about the 20th") is the author's recollection and is flagged as such in the lesson.

## Rules that are not verified against a BIR document (also on the Instructor page)

The list is `unverifiedRules()` in `src/birlab/rules/2026.ts`:

- `classification`: micro (under ₱3M) and small (₱3M to under ₱20M) are in the 1701-MS Guide; the medium ceiling is from RA 11976.
- `corporate`: 25% / 20% and the ₱5M / ₱100M tests are from the Code (CREATE). The ATC table printed on the 1702 forms still shows 30%.
- `compensation`: ₱90,000 exempt benefits is from the Code; the 25% NRANETB rate is printed on the 1700.
- `ewt`: the creditable withholding rates (WI010, WI011, WC010, WC011, WC100, WC158, WC160). The rate table on page 2 of the 2307 PDF did not extract into a code-to-rate table, so these are from RR 11-2018 as the author knows it. **Check these against the PDF.**
- `certificateDue`: 2307 within 20 days after the quarter (RR 11-2018), 2316 by January 31 (course table).
- `informationReturnDue`: 1604-C January 31 (course table); 1604-E March 1 is from BIR guidance.
- `percentageTax`: the rates are printed on the 2551Q; the 25-day deadline is the Code (Sec. 128), not on the PDF.
- `realPropertyWithholding` (1606): rates are printed on the form; the 10th-day deadline is not.
- `dst` (2000 / 2000-OT): rates are printed on the forms; the 5th-day deadline is not.
- `donorTax` (1800): see above.

Verified against official documents: the individual tax tables, the 8% option and ₱250,000, OSD 40%, April 15 (annual) and May 15 / Aug 15 / Nov 15 (1701Q), the ₱2,000 installment minimum, the 2550Q VAT 12% and 25 days, the 1601-C 10th-day (December: January 15) rule, 1601-EQ and 0619-E deadlines, the 1702Q 60 days, the 1707 30 days, and the penalty rates (25% / 12% general; 10% / 6% micro and small; 50% reduced compromise), which the 2550Q Guidelines state.

## Differences from your table (the official document wins)

- 1701Q first quarter is **May 15** (the form's Guidelines). The eFPS help page still says April 15.
- 1701A OSD is 40% of **net sales (Item 38)**, not gross sales before returns.
- The RMC 37-2026 scan is unreadable, so which of 1701A or 1701-MS applies to a micro or small taxpayer follows the 1701-MS Guide and the lesson says to verify the latest announcement.

## Simplifications (each stated on the form's own page)

- 1701: Parts VIII to X (special/exempt regimes, tax relief, reconciliation) and the detail of Schedules 5 and 6 are not simulated; Items 14 and 15 are typed as totals.
- 1701-MS: special/preferential and exempt regimes are not simulated.
- 1702-RT / EX / MX / 1702Q: special deduction, NOLCO and MCIT-credit schedules are typed totals; 1702Q does not simulate Schedule 1 (exempt/special rates); 1702-MX has two tax-regime columns (the printed form has four).
- 2316: minimum wage earner items are not simulated. 1604-C / 1604-E: the monthly adjustment and penalty columns are totals. 1601-EQ: three ATC lines instead of six. 2307: one ATC line. 2000: three lines of Schedule 1. 1706 / 1707 / 1606: one property or stock line, cash sales only (installment sales are not simulated).
- Compensation earners and individual donors, estates and sellers use the general penalty rates (they are not classified as micro or small taxpayers by sales).

## Phase 5 features

- **Calendar** `/bir-lab/calendar`: any taxable year, filter by taxpayer type; every date comes from the rules file and is marked "taught" when it is not in an official document.
- **Which form?** `/bir-lab/which-form`: questionnaire ending in the form(s) with reasons and links to the lessons.
- **Scenarios** `/bir-lab/scenarios`: X1 professional (2307 to 1701Q to 1701A), X2 employer (1601-C to 1604-C to 2316), X3 one property sale (1606 to 2000-OT). The numbers carry between steps and are tested.
- **My progress** `/bir-lab/progress`: quick-check results, local attempts, attempts saved to the database.
- **Instructor** `/bir-lab/teacher` (teachers only): all students' attempts with filter and CSV export, answer keys with worked solutions, and the list of unverified rules.

## Other changes

- A form-agnostic `forms/kit.ts` (declare a form as header fields plus rows with formulas) and `pack/` (each later form's definition, lesson and cases in one file).
- The free fill-up now puts the taxpayer profile into the right items of each form (it used 1701A's item numbers before).
- Validation messages are sorted by item number.

## To do when you are back

1. Review the "Not built from the official PDF" and `ewt` items above.
2. Commit with explicit paths (the repo root has your untracked handbooks), then deploy. There is no migration.
