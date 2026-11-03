// Shape of a BFAR practice set as students see it: the source documents and the facts. The solution keys live in keys.ts and are never part of this shape.
import type { AdjustmentType, BusinessType, InventorySystem, JournalKind } from "../core/types";

/** Pesos to centavos, for writing amounts readably. */
export const P = (pesos: number): number => Math.round(pesos * 100);

/** A business paper the student journalizes from: official receipt, invoice, check voucher, payroll register, and so on. */
export interface SourceDocument {
  type: string;
  no: string;
  date: string;
  /** The other party on the paper, with how they relate to the business ("Received from", "Billed to", "Paid to"...). */
  partyLabel: string;
  party: string;
  items: { desc: string; amount: number }[];
  /** Printed terms and remarks (credit terms, FOB, mode of payment). */
  terms?: string;
  note?: string;
}

export interface PracticeTransaction {
  id: string;
  date: string;
  kind: JournalKind;
  /** What happened, for the teacher's reference and for the journal explanation. Students work from the document, not from this. */
  description: string;
  terms?: string;
  document?: SourceDocument;
}

export interface PracticeAdjustment {
  tag: string;
  date: string;
  adjType: AdjustmentType;
  description: string;
  /** Facts the student needs to compute the adjustment (a count sheet, a schedule, a contract term). */
  document?: SourceDocument;
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
  /** Papers that are not journalized but are needed at period end, such as the inventory count sheet. */
  periodEndDocuments?: SourceDocument[];
}
