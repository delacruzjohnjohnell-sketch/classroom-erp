"use client";
// The student's BIR Lab work, kept in the browser and tied to the signed-in user: the taxpayer profile, drafts, attempts and quick-check results.
// Whatever an older version saved is repaired on load, so an old shape can never crash a page.
import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Values } from "../forms/types";

export interface Profile { tin: string; rdo: string; last: string; first: string; middle: string; tradeName: string; address: string; zip: string; tel: string; email: string; line: string }
export const emptyProfile = (): Profile => ({ tin: "", rdo: "", last: "", first: "", middle: "", tradeName: "", address: "", zip: "", tel: "", email: "", line: "" });

export type DraftStatus = "draft" | "validated" | "final" | "submitted";
export interface Draft { values: Values; filingDate: string; status: DraftStatus; updatedAt: string; caseId: string; mode: "practice" | "assessment" | "free"; formId: string; hintsUsed: number }
export interface Attempt { id: string; formId: string; caseId: string; mode: "practice" | "assessment"; score: number; max: number; percent: number; at: string; seconds: number; wrongForm: boolean }
export interface QuizResult { best: number; attempts: number; passed: boolean }

export const draftKey = (formId: string, caseId: string, mode: string) => `${formId}:${caseId || "free"}:${caseId ? mode : "free"}`;

interface BirState {
  owner: string | null;
  profile: Profile;
  drafts: Record<string, Draft>;
  attempts: Attempt[];
  quiz: Record<string, QuizResult>;
  /** Forms whose lesson the student has opened, so the filling screen can follow the lesson. */
  visited: Record<string, boolean>;
  setOwner: (userId: string) => void;
  setProfile: (p: Partial<Profile>) => void;
  saveDraft: (key: string, d: Draft) => void;
  deleteDraft: (key: string) => void;
  addAttempt: (a: Attempt) => void;
  saveQuiz: (formId: string, score: number, total: number) => void;
  visit: (formId: string) => void;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function normalizeProfile(raw: unknown): Profile {
  const r = obj(raw);
  const p = emptyProfile();
  for (const k of Object.keys(p) as (keyof Profile)[]) p[k] = str(r[k]);
  return p;
}
function normalizeValues(raw: unknown): Values {
  return Object.fromEntries(Object.entries(obj(raw)).filter(([, v]) => typeof v === "string")) as Values;
}
function normalizeDrafts(raw: unknown): Record<string, Draft> {
  const out: Record<string, Draft> = {};
  for (const [k, d] of Object.entries(obj(raw))) {
    const r = obj(d);
    if (!str(r.formId)) continue;
    out[k] = {
      values: normalizeValues(r.values), filingDate: str(r.filingDate),
      status: (["draft", "validated", "final", "submitted"] as const).find((s) => s === r.status) ?? "draft",
      updatedAt: str(r.updatedAt), caseId: str(r.caseId), formId: str(r.formId),
      mode: (["practice", "assessment", "free"] as const).find((s) => s === r.mode) ?? "free",
      hintsUsed: typeof r.hintsUsed === "number" ? r.hintsUsed : 0,
    };
  }
  return out;
}

export const useBirStore = create<BirState>()(
  persist(
    (set) => ({
      owner: null,
      profile: emptyProfile(),
      drafts: {},
      attempts: [],
      quiz: {},
      visited: {},
      setOwner: (userId) => set((s) => (s.owner === userId ? s : { owner: userId, profile: emptyProfile(), drafts: {}, attempts: [], quiz: {}, visited: {} })),
      setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
      saveDraft: (key, d) => set((s) => ({ drafts: { ...s.drafts, [key]: d } })),
      deleteDraft: (key) => set((s) => { const { [key]: _gone, ...rest } = s.drafts; void _gone; return { drafts: rest }; }),
      addAttempt: (a) => set((s) => ({ attempts: [a, ...s.attempts].slice(0, 200) })),
      saveQuiz: (formId, score, total) => set((s) => {
        const prev = s.quiz[formId];
        const passed = score / total >= 0.8;
        return { quiz: { ...s.quiz, [formId]: { best: Math.max(prev?.best ?? 0, score), attempts: (prev?.attempts ?? 0) + 1, passed: passed || !!prev?.passed } } };
      }),
      visit: (formId) => set((s) => (s.visited[formId] ? s : { visited: { ...s.visited, [formId]: true } })),
    }),
    {
      name: "birlab-v1", version: 1, storage: createJSONStorage(() => localStorage), skipHydration: true,
      merge: (persisted, current) => {
        const p = obj(persisted);
        return {
          ...current,
          owner: typeof p.owner === "string" ? p.owner : null,
          profile: normalizeProfile(p.profile),
          drafts: normalizeDrafts(p.drafts),
          attempts: Array.isArray(p.attempts) ? (p.attempts as Attempt[]).filter((a) => a && typeof a.formId === "string") : [],
          quiz: Object.fromEntries(Object.entries(obj(p.quiz)).map(([k, q]) => { const r = obj(q); return [k, { best: Number(r.best) || 0, attempts: Number(r.attempts) || 0, passed: !!r.passed }]; })),
          visited: Object.fromEntries(Object.entries(obj(p.visited)).filter(([, v]) => v === true).map(([k]) => [k, true])) as Record<string, boolean>,
        };
      },
    },
  ),
);

/** True once the saved work has been read from this browser; render saved data only after this. */
export function useBirHydrated(): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => { void Promise.resolve(useBirStore.persist.rehydrate()).then(() => setDone(true)); }, []);
  return done;
}
