// Shape of a BFAR practice set: the narrative, every transaction and adjustment with its solution key, and the figures the statements must show.
import type { AdjustmentType, BusinessType, InventorySystem, JournalKind, JournalLine } from "../core/types";

/** Pesos to centavos, for writing the keys in readable amounts. */
export const P = (pesos: number): number => Math.round(pesos * 100);

export interface PracticeTransaction {
  id: string;
  date: string;
  description: string;
  kind: JournalKind;
  /** The solution key. */
  key: JournalLine[];
  /** Shown after a wrong attempt, in Ballada's voice. */
  hint?: string;
  /** Credit terms and shipping terms, shown beside the narrative, e.g. "2/10, n/30; FOB shipping point". */
  terms?: string;
}

export interface PracticeAdjustment {
  tag: string;
  date: string;
  description: string;
  adjType: AdjustmentType;
  key: JournalLine[];
  hint?: string;
}

export interface PracticeSet {
  id: string;
  title: string;
  business: BusinessType;
  inventory?: InventorySystem;
  entity: string;
  /** e.g. "For the month ended December 31, 2026" */
  period: string;
  asOf: string;
  closingDate: string;
  reversingDate: string;
  summary: string;
  transactions: PracticeTransaction[];
  adjustments: PracticeAdjustment[];
  /** Periodic system: the physical count at the end of the period. */
  endingInventory?: number;
  /** The figures a correct set of books must produce, for the answer key and for the tests. */
  expected: { netIncome: number; totalAssets: number; endingCapital: number; costOfGoodsSold?: number };
}
