// Structural audit of every form definition: ids that must exist do exist, blank and hostile input never throws or yields NaN, a wrong TIN is always caught,
// and an empty answer scores low. Written after the Phase 2-5 build to catch typos the per-case tests cannot see.
import { describe, expect, it } from "vitest";
import { ALL_CASES } from "../cases";
import { checkReturn, keyValues } from "../engine/check";
import { FORMS } from "../forms/registry";
import type { FormDef } from "../forms/types";

const built = FORMS.filter((f) => f.def).map((f) => f.def as FormDef);
const ids = (def: FormDef) => {
  const fields = new Set<string>(), rows = new Set<string>(), tins = new Set<string>();
  for (const p of def.pages) for (const s of p.sections) for (const r of s.rows) {
    if (r.type === "fields") r.fields.forEach((f) => { fields.add(f.id); if (f.kind === "tin") tins.add(f.id); });
    if (r.type === "amounts") r.cols.forEach((c) => rows.add(r.id + c));
  }
  return { fields, rows, tins };
};

describe("form definitions are internally consistent", () => {
  for (const def of built) {
    it(`${def.id}: every id used by scoring exists on the form`, () => {
      const { fields, rows } = ids(def);
      const c = ALL_CASES.find((x) => x.form === def.id);
      const given = c ? { ...c.profile, ...c.facts } : {};
      for (const s of def.scoring(given)) expect(fields.has(s.id) || rows.has(s.id), `${def.id} scores unknown id ${s.id}`).toBe(true);
    });
    it(`${def.id}: item ids are unique across the form`, () => {
      const seen = new Map<string, number>();
      for (const p of def.pages) for (const s of p.sections) for (const r of s.rows) {
        if (r.type === "fields") r.fields.forEach((f) => seen.set(f.id, (seen.get(f.id) ?? 0) + 1));
        if (r.type === "amounts") r.cols.forEach((c) => seen.set(r.id + c, (seen.get(r.id + c) ?? 0) + 1));
      }
      expect([...seen].filter(([, n]) => n > 1).map(([k]) => k)).toEqual([]);
    });
    it(`${def.id}: a blank form computes without NaN and validates without throwing`, () => {
      const out = def.compute({}, { filingDate: "2026-04-10" });
      for (const [k, v] of Object.entries(out)) expect(/NaN|Infinity/.test(v), `${def.id} ${k}=${v}`).toBe(false);
      expect(() => def.validate({}, { filingDate: "2026-04-10" })).not.toThrow();
    });
    it(`${def.id}: garbage in amount boxes does not break compute`, () => {
      const { rows } = ids(def);
      const out = def.compute(Object.fromEntries([...rows].map((r) => [r, "abc"])), {});
      for (const [k, v] of Object.entries(out)) expect(/NaN|Infinity/.test(v), `${def.id} ${k}=${v}`).toBe(false);
    });
  }
});

describe("cases", () => {
  for (const c of ALL_CASES) {
    const def = FORMS.find((f) => f.id === c.form)?.def;
    if (!def) continue;
    it(`${c.id}: a malformed TIN is rejected`, () => {
      const given = { ...c.profile, ...c.facts };
      const target = [...ids(def).tins].find((id) => given[id]);
      if (!target) return;
      expect(def.validate({ ...given, [target]: "123" }, { filingDate: c.filingDate, classification: c.classification }).length).toBeGreaterThan(0);
    });
    it(`${c.id}: an empty answer scores far below 100%`, () => {
      const ctx = { filingDate: c.filingDate, classification: c.classification };
      const key = keyValues(def, { ...c.profile, ...c.facts }, ctx);
      expect(checkReturn(def, key, {}, ctx).percent).toBeLessThan(40);
    });
    it(`${c.id}: the story, hints and solution carry no stray placeholders`, () => {
      for (const t of [...c.story, ...c.hints, ...c.solution]) expect(/undefined|NaN|\[object|TODO|\?\?\?/.test(t), t).toBe(false);
    });
  }
});
