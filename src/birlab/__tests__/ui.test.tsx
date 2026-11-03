// @vitest-environment jsdom
// Renders the real filling screen and clicks its buttons: the eBIRForms buttons in order, validation messages, live computed fields, the final copy lock,
// the simulated filing, the case story with the wrong-form zero, "Check my return", and the print view.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn(async () => ({ error: { message: "not applied" } })) } }));
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...rest}>{children}</a> }));

import { FormScreen } from "../components/FormScreen";
import { getCase } from "../cases/f1701a";
import { draftKey, useBirStore } from "../store/useBirStore";
import type { Values } from "../forms/types";

const complete: Values = {
  "1": "12/2025", "2": "no", "3": "no", "4": "000-000-001-00000", "5": "025", "6": "single", "7": "II012", "8": "BAUTISTA, ROSARIO, MENDOZA", "9": "BRGY. SUMACAB ESTE, CABANATUAN CITY", "9A": "3100",
  "10": "03/14/1978", "11": "r@example.com", "12": "FILIPINO", "13": "no", "15": "09170000001", "16": "single", "19": "graduated", "36A": "520000", "37A": "0", "31": "0",
};

const seed = (values: Values, caseId = "", mode: "practice" | "assessment" | "free" = "free", filingDate = "2026-04-10", status: "draft" | "final" = "draft") =>
  useBirStore.getState().saveDraft(draftKey("1701A", caseId, mode), { values, filingDate, status, updatedAt: "2026-01-01T00:00:00.000Z", caseId, mode, formId: "1701A", hintsUsed: 0 });

beforeEach(() => {
  localStorage.clear();
  useBirStore.setState({ drafts: {}, attempts: [], quiz: {}, visited: {} });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("the filling screen", () => {
  it("shows the simulation banner, the version and the six eBIRForms buttons in order", () => {
    render(<FormScreen formId="1701A" mode="free" />);
    expect(screen.getAllByText(/Educational simulation only — not connected to the BIR/).length).toBeGreaterThan(0);
    expect(screen.getByText(/version January 2018/)).toBeTruthy();
    const names = ["Validate", "Edit", "Save", "Print", "Final Copy", "Submit/File Final"];
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    const idx = names.map((n) => buttons.indexOf(n));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it("Validate lists each error with its item number", () => {
    render(<FormScreen formId="1701A" mode="free" />);
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Item 4")).toBeTruthy();
    expect(alert.textContent).toMatch(/TIN must be 3-3-3-5 digits/);
    expect(alert.textContent).toMatch(/Choose the tax rate/);
  });

  it("shows computed fields live, read-only and shaded", () => {
    seed(complete);
    render(<FormScreen formId="1701A" mode="free" />);
    expect(screen.getByLabelText("Item 29A, computed").textContent).toBe("9,300.00"); // Part II is on page 1
    fireEvent.click(screen.getByRole("button", { name: "Page 2" })); // Part IV is on page 2, as on the official form
    expect(screen.getByLabelText("Item 46A, computed").textContent).toBe("9,300.00");
    expect(screen.getByLabelText("Item 38A, computed").textContent).toBe("520,000.00");
    // changing sales recomputes at once
    fireEvent.change(screen.getByLabelText("Item 36A"), { target: { value: "1000000" } });
    expect(screen.getByLabelText("Item 46A, computed").textContent).toBe("62,500.00");
  });

  it("adds penalties live when the filing date is after the due date", () => {
    seed(complete, "", "free", "2026-06-30");
    render(<FormScreen formId="1701A" mode="free" />);
    expect(screen.getByText(/Filed late/)).toBeTruthy();
    expect(screen.getByLabelText("Item 25A, computed").textContent).toBe("930.00");
    expect(screen.getByLabelText("Item 26A, computed").textContent).toBe("116.00");
  });

  it("validates a complete return, locks it as a Final Copy, files it (simulated) and shows the mock email", () => {
    seed(complete);
    render(<FormScreen formId="1701A" mode="free" />);
    fireEvent.click(screen.getByRole("button", { name: "Submit/File Final" }));
    expect(screen.getByRole("status").textContent).toMatch(/Final Copy first/);
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(screen.getByRole("status").textContent).toMatch(/Validation successful/);
    fireEvent.click(screen.getByRole("button", { name: "Final Copy" }));
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect((screen.getByLabelText("Item 36A") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Submit/File Final" }));
    expect(screen.getByText(/Your return has been filed \(simulated\)/)).toBeTruthy();
    expect(screen.getByText("Subject: Tax Return Receipt Confirmation")).toBeTruthy();
    expect(screen.getAllByText(/Simulation/i).length).toBeGreaterThan(1);
    expect(screen.getByText(/does not process any payment/)).toBeTruthy();
    // Edit unlocks a locked form
    cleanup();
    seed(complete, "", "free", "2026-04-10", "final");
    render(<FormScreen formId="1701A" mode="free" />);
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect((screen.getByLabelText("Item 36A") as HTMLInputElement).disabled).toBe(false);
  });

  it("Save stores a draft", () => {
    seed(complete);
    render(<FormScreen formId="1701A" mode="free" />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("status").textContent).toMatch(/Draft saved/);
    expect(useBirStore.getState().drafts[draftKey("1701A", "", "free")]).toBeTruthy();
  });

  it("Print opens the long bond paper preview with every page", () => {
    seed(complete);
    render(<FormScreen formId="1701A" mode="free" />);
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(screen.getByText(/long bond paper, 8.5 x 13 in/)).toBeTruthy();
    expect(screen.getAllByText(/1701A January 2018 — Page/).length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText(/long bond paper/)).toBeNull();
  });
});

describe("a case problem", () => {
  const c = getCase("1701A-difficult")!;

  it("scores zero for the wrong form and explains which form applies and why", () => {
    render(<FormScreen formId="1701A" caseDef={c} mode="practice" />);
    expect(screen.getByText(/Mang Pedro's hardware/)).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "1701" } });
    fireEvent.click(screen.getByRole("button", { name: "Open this form" }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/Score: 0/);
    expect(alert.textContent).toMatch(/files Form 1701A/);
    expect(useBirStore.getState().attempts[0]).toMatchObject({ score: 0, wrongForm: true });
  });

  it("opens the form for the right choice, prefilled like the taxpayer profile", () => {
    render(<FormScreen formId="1701A" caseDef={c} mode="practice" />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "1701A" } });
    fireEvent.click(screen.getByRole("button", { name: "Open this form" }));
    expect((screen.getByLabelText("Item 4") as HTMLInputElement).value).toBe("000-000-003-00000");
    expect((screen.getByLabelText("Item 8") as HTMLInputElement).value).toMatch(/VILLANUEVA/);
  });

  it("Check my return marks a wrong entry red and shows no expected values until the return is final", () => {
    seed({ ...c.profile, ...c.facts, "41A": "0" }, c.id, "practice", c.filingDate);
    render(<FormScreen formId="1701A" caseDef={c} mode="practice" />);
    fireEvent.click(screen.getByRole("button", { name: "Check my return" }));
    expect(screen.getByText(/points \(/).textContent).toMatch(/Check my return/);
    expect(screen.queryByText(/you have/)).toBeNull(); // the expected values stay hidden until the return is final
    expect(screen.getByText(/expected values appear after you file the final return/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(screen.getByLabelText("Item 46A, computed").className).toMatch(/rose/);
  });

  it("practice hints appear one at a time; the assessment has none", () => {
    seed({ ...c.profile, ...c.facts }, c.id, "practice", c.filingDate);
    render(<FormScreen formId="1701A" caseDef={c} mode="practice" />);
    fireEvent.click(screen.getByRole("button", { name: /Hint \(0\/3\)/ }));
    expect(screen.getByText(/final tax are NOT part/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Hint \(1\/3\)/ })).toBeTruthy();
    cleanup();
    seed({ ...c.profile, ...c.facts }, c.id, "assessment", c.filingDate);
    render(<FormScreen formId="1701A" caseDef={c} mode="assessment" />);
    expect(screen.queryByRole("button", { name: /Hint/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Check my return" })).toBeNull();
  });

  it("a correct return filed in assessment mode scores 100% and reveals the worked solution", () => {
    seed({ ...c.profile, ...c.facts }, c.id, "assessment", c.filingDate, "final");
    render(<FormScreen formId="1701A" caseDef={c} mode="assessment" />);
    fireEvent.click(screen.getByRole("button", { name: "Submit/File Final" }));
    expect(screen.getByText(/\(100%\)/)).toBeTruthy();
    expect(screen.getByText("Worked solution")).toBeTruthy();
    expect(useBirStore.getState().attempts[0]).toMatchObject({ percent: 100, wrongForm: false, mode: "assessment" });
  });

  it("a wrong return filed in assessment mode shows the expected values only now", () => {
    seed({ ...c.profile, ...c.facts, "41A": "0", "41S": "" }, c.id, "assessment", c.filingDate, "final");
    render(<FormScreen formId="1701A" caseDef={c} mode="assessment" />);
    expect(screen.queryByText(/expected/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Submit/File Final" }));
    expect(screen.getAllByText(/you have/).length).toBeGreaterThan(0);
    expect(useBirStore.getState().attempts[0].percent).toBeLessThan(100);
  });
});
