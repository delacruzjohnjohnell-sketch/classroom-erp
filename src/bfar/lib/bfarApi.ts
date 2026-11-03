// The only place BFAR talks to the database: the student's own submission, and the teacher's list and marking.
// It uses the same Supabase client and login as the other editions; the functions are in migration 0083.
import { supabase } from "@/lib/supabase";
import type { JournalLine } from "../core/types";
import type { ReleasedResult, SubmissionStatus } from "../store/useAccountingStore";

export type Answers = Record<string, JournalLine[]>;

export interface MySubmission {
  status: SubmissionStatus;
  answers: Answers;
  submittedAt: string | null;
  released?: ReleasedResult;
}

export interface TeacherRow {
  id: string;
  student: string;
  setId: string;
  status: SubmissionStatus;
  answers: Answers;
  submittedAt: string | null;
  score: number | null;
  max: number | null;
  comment: string | null;
  updatedAt: string;
}

/** The signed-in student's saved work for a set, or null when nothing is saved yet. The teacher's marking only comes back once it was released. */
export async function loadMine(setId: string): Promise<MySubmission | null> {
  const r = await supabase.rpc("bfar_my", { p_set: setId });
  if (r.error) throw new Error(r.error.message);
  const row = ((r.data as { status: SubmissionStatus; answers: Answers; submitted_at: string | null; checked: ReleasedResult["items"] | null; score: number | null; max_score: number | null; comment: string | null }[]) ?? [])[0];
  if (!row) return null;
  return {
    status: row.status, answers: row.answers ?? {}, submittedAt: row.submitted_at,
    released: row.status === "released" && row.checked ? { items: row.checked, score: row.score ?? 0, max: row.max_score ?? row.checked.length, comment: row.comment } : undefined,
  };
}

export async function saveMine(setId: string, answers: Answers, submit: boolean): Promise<SubmissionStatus> {
  const r = await supabase.rpc("bfar_save", { p_set: setId, p_answers: answers, p_submit: submit });
  if (r.error) throw new Error(r.error.message);
  return r.data as SubmissionStatus;
}

/** TEACHER ONLY. */
export async function listSubmissions(): Promise<TeacherRow[]> {
  const r = await supabase.rpc("bfar_teacher_list");
  if (r.error) throw new Error(r.error.message);
  return ((r.data as { id: string; student: string; set_id: string; status: SubmissionStatus; answers: Answers; submitted_at: string | null; score: number | null; max_score: number | null; comment: string | null; updated_at: string }[]) ?? [])
    .map((x) => ({ id: x.id, student: x.student, setId: x.set_id, status: x.status, answers: x.answers ?? {}, submittedAt: x.submitted_at, score: x.score, max: x.max_score, comment: x.comment, updatedAt: x.updated_at }));
}

/** TEACHER ONLY. Stores the marking; with `release` the student can see it (and the key) from then on. */
export async function checkSubmission(id: string, marking: ReleasedResult, release: boolean): Promise<void> {
  const r = await supabase.rpc("bfar_teacher_check", { p_id: id, p_checked: marking.items, p_score: marking.score, p_max: marking.max, p_comment: marking.comment, p_release: release });
  if (r.error) throw new Error(r.error.message);
}
