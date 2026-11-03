// The only place the BIR Lab talks to the database. It uses the same Supabase client and login as the rest of the ERP; the functions are in migration 0084.
// If the migration is not applied (or the student is offline) every call fails quietly: the lab keeps working from the browser.
import { supabase } from "@/lib/supabase";
import type { Values } from "../forms/types";

export interface AttemptInput { formId: string; caseId: string; mode: "practice" | "assessment" | "free"; values: Values; score: number; max: number; final: boolean; seconds: number; wrongForm: boolean }

/** Records an attempt for the signed-in student. Returns false when it could not be saved (not applied yet, offline). */
export async function logAttempt(a: AttemptInput): Promise<boolean> {
  try {
    const r = await supabase.rpc("bir_lab_log_attempt", { p_form: a.formId, p_case: a.caseId, p_mode: a.mode, p_values: a.values, p_score: a.score, p_max: a.max, p_final: a.final, p_seconds: a.seconds, p_wrong_form: a.wrongForm });
    return !r.error;
  } catch {
    return false;
  }
}

export interface AttemptRow { id: string; form_id: string; case_id: string; mode: string; score: number; max_score: number; final: boolean; seconds: number; wrong_form: boolean; created_at: string }
export interface TeacherRow extends AttemptRow { student: string }

/** The signed-in student's saved attempts, newest first; null when they cannot be read (migration not applied, offline). */
export async function fetchMyAttempts(): Promise<AttemptRow[] | null> {
  try {
    const r = await supabase.rpc("bir_lab_my_attempts");
    return r.error ? null : ((r.data ?? []) as AttemptRow[]);
  } catch {
    return null;
  }
}

/** Every student's attempts with the student's name. Teachers only: the database refuses anyone else. */
export async function fetchTeacherList(): Promise<TeacherRow[] | null> {
  try {
    const r = await supabase.rpc("bir_lab_teacher_list");
    return r.error ? null : ((r.data ?? []) as TeacherRow[]);
  } catch {
    return null;
  }
}
