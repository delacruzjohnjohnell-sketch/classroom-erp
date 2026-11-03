// Who may use which system: a waiting or rejected student sees nothing, an approved student sees only the ticked systems, the teacher sees all,
// and a profile from before the approvals update (no new fields) keeps full access.
import { describe, expect, it } from "vitest";
import { accessState, canUse, moduleOfEdition, ALL_MODULES } from "../../lib/access";

const student = (extra: Record<string, unknown> = {}) => ({ role: "student" as const, ...extra }) as Parameters<typeof canUse>[0];

describe("system access", () => {
  it("the teacher always has everything", () => {
    for (const m of ALL_MODULES) expect(canUse({ role: "teacher" } as Parameters<typeof canUse>[0], m)).toBe(true);
    expect(accessState({ role: "teacher", approval: "pending" })).toBe("ok");
  });
  it("a new student waits and can use nothing", () => {
    const p = student({ approval: "pending", modules: [] });
    expect(accessState(p as never)).toBe("pending");
    for (const m of ALL_MODULES) expect(canUse(p, m)).toBe(false);
  });
  it("a rejected student can use nothing and is told so", () => {
    const p = student({ approval: "rejected", modules: [] });
    expect(accessState(p as never)).toBe("rejected");
    expect(canUse(p, "bir")).toBe(false);
  });
  it("an approved student can use only the ticked systems", () => {
    const p = student({ approval: "approved", modules: ["bir"] });
    expect(accessState(p as never)).toBe("ok");
    expect(canUse(p, "bir")).toBe(true);
    expect(canUse(p, "standard")).toBe(false);
    expect(canUse(p, "bfar")).toBe(false);
  });
  it("an existing student without the new fields keeps full access", () => {
    for (const m of ALL_MODULES) expect(canUse(student(), m)).toBe(true);
  });
  it("maps an edition to its module", () => {
    expect(moduleOfEdition("STANDARD")).toBe("standard");
    expect(moduleOfEdition("MANUFACTURING")).toBe("manufacturing");
    expect(moduleOfEdition("AIS")).toBe("ais");
    expect(moduleOfEdition(null)).toBe("standard");
  });
});
