// Gathers the scores the teacher's "Find the top scorers" button works from, one system at a time. It reuses the readers the class scores page and the BFAR and BIR teacher
// pages already use, so a score here is the same score the teacher sees there. The ranking and the wording are in announce.ts.
import { counted, markBestMatch } from "@/lib/classScores";
import { loadAisRows, loadClassCompanies, loadMfgSet, loadMfgSets, mapLimit, PRACTICE_SETS, scoreMfgAll, scoreStandardAll } from "@/lib/classScoresLoad";
import { fromBfar, fromBir, fromScoreRows, type ScoreLine, type SystemId } from "@/lib/announce";
import { listSubmissions } from "@/bfar/lib/bfarApi";
import { PRACTICE_SETS as BFAR_SETS } from "@/bfar/practice-sets";
import { fetchTeacherList } from "@/birlab/lib/birApi";

export async function loadLines(system: SystemId, onProgress?: (done: number, total: number) => void): Promise<ScoreLine[]> {
  if (system === "STANDARD") {
    const companies = (await loadClassCompanies()).filter((c) => c.edition === "Standard");
    const res = await mapLimit(companies, 3, (c) => scoreStandardAll(c, PRACTICE_SETS).catch(() => []), onProgress);
    return fromScoreRows(counted(markBestMatch(res.flat())));
  }
  if (system === "MANUFACTURING") {
    const companies = (await loadClassCompanies()).filter((c) => c.edition === "Manufacturing");
    const sets = await Promise.all((await loadMfgSets()).map((x) => loadMfgSet(x.id)));
    const res = await mapLimit(companies, 3, (c) => scoreMfgAll(c, sets).catch(() => []), onProgress);
    return fromScoreRows(counted(markBestMatch(res.flat())));
  }
  if (system === "AIS") return fromScoreRows(await loadAisRows());
  if (system === "BIR") {
    const rows = await fetchTeacherList();
    if (!rows) throw new Error("The BIR Lab attempts could not be read (the BIR Lab database update may not be applied).");
    return fromBir(rows);
  }
  const rows = await listSubmissions();
  return fromBfar(rows.map((r) => ({ student: r.student, setId: r.setId, score: r.score, max: r.max })), Object.fromEntries(BFAR_SETS.map((s) => [s.id, s.title])));
}
