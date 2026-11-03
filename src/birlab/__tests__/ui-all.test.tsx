// @vitest-environment jsdom
// Renders the real filling screen for EVERY built form and EVERY case: the blank form opens, and a case seeded with the correct values validates and scores 100%.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn(async () => ({ error: { message: "not applied" } })) } }));
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...rest}>{children}</a> }));

import { ALL_CASES } from "../cases";
import { FormScreen } from "../components/FormScreen";
import { LearnPage } from "../components/LearnPage";
import { LESSONS } from "../content/lessons";
import { availableForms } from "../forms/registry";
import { draftKey, useBirStore } from "../store/useBirStore";

beforeEach(() => {
  localStorage.clear();
  useBirStore.setState({ drafts: {}, attempts: [], quiz: {}, visited: {} });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("every form opens", () => {
  for (const f of availableForms()) {
    it(`${f.id}: the blank form renders with its banner, version and buttons, on every page`, () => {
      render(<FormScreen formId={f.id} mode="free" />);
      expect(screen.getAllByText(/Educational simulation only/).length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "Validate" })).toBeTruthy();
      const pages = f.def!.pages.length;
      for (let p = 2; p <= pages; p++) fireEvent.click(screen.getByRole("button", { name: `Page ${p}` }));
    });
    it(`${f.id}: the lesson page renders`, () => {
      const lesson = LESSONS[f.id];
      expect(lesson, `lesson for ${f.id}`).toBeTruthy();
      render(<LearnPage formId={f.id} lesson={lesson} />);
      expect(screen.getAllByText(new RegExp(`Form ${f.number.replace(/[()]/g, ".")}`)).length).toBeGreaterThan(0);
    });
  }
});

describe("every case works end to end", () => {
  for (const c of ALL_CASES) {
    it(`${c.id}: the correct values validate and "Check my return" gives 100%`, () => {
      useBirStore.getState().saveDraft(draftKey(c.form, c.id, "practice"), { values: { ...c.profile, ...c.facts }, filingDate: c.filingDate, status: "draft", updatedAt: "2026-01-01T00:00:00.000Z", caseId: c.id, mode: "practice", formId: c.form, hintsUsed: 0 });
      render(<FormScreen formId={c.form} caseDef={c} mode="practice" />);
      fireEvent.click(screen.getByRole("button", { name: "Validate" }));
      expect(screen.getByRole("status").textContent).toMatch(/Validation successful/);
      fireEvent.click(screen.getByRole("button", { name: "Check my return" }));
      expect(screen.getByText(/points \(/).textContent).toMatch(/\(100%\)/);
    });
  }
});

describe("the taxpayer profile prefills the right items of each form", () => {
  it("puts the TIN in the TIN item, not in whatever item number the 1701A uses", () => {
    useBirStore.setState({ profile: { ...useBirStore.getState().profile, tin: "000-000-999-00000", rdo: "025", last: "Reyes", first: "Ana", middle: "Cruz" } });
    render(<FormScreen formId="1701Q" mode="free" />);
    expect((document.getElementById("f-5") as HTMLInputElement | null)?.value).toBe("000-000-999-00000");
    expect((document.getElementById("f-4") as HTMLInputElement | null)?.value ?? "").toBe("");
    expect((document.getElementById("f-9") as HTMLInputElement | null)?.value).toBe("REYES, ANA, CRUZ");
  });
});
