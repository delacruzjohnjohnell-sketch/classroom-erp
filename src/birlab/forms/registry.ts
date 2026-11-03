// Every form in the BIR Lab, in the order of the spec, with the due date the lab will teach and whether it is built yet.
// A form is "available" once its definition, lecture and cases exist. The rest show as coming in a later phase.
import { F1701A } from "./f1701a";
import type { FormDef } from "./types";

export type Track = "A" | "B" | "C";

export interface FormEntry {
  id: string;
  number: string;
  name: string;
  track: Track;
  whoFiles: string;
  /** The due date as taught, to be verified against the form's own instructions before the form is built. */
  due: string;
  /** Present once the form is built. */
  def?: FormDef;
}

export const TRACKS: Record<Track, string> = { A: "Income taxation", B: "Business taxation and withholding", C: "Transfer taxation" };

export const FORMS: FormEntry[] = [
  { id: "1700", number: "1700", name: "Annual Income Tax Return (compensation income)", track: "A", whoFiles: "Individuals earning purely compensation income (not qualified for substituted filing)", due: "April 15" },
  { id: "1701", number: "1701", name: "Annual Income Tax Return (mixed income)", track: "A", whoFiles: "Mixed-income earners, self-employed using graduated rates with itemized deductions, estates and trusts", due: "April 15" },
  { id: "1701A", number: "1701A", name: "Annual Income Tax Return (purely business/profession)", track: "A", whoFiles: "Individuals purely in business/profession using graduated rates with OSD, or the 8% option", due: "April 15", def: F1701A },
  { id: "1701-MS", number: "1701-MS (Aug 2024)", name: "Annual Income Tax Return (micro and small taxpayers)", track: "A", whoFiles: "Individuals classified as micro or small taxpayers (simplified annual return)", due: "April 15" },
  { id: "1701Q", number: "1701Q", name: "Quarterly Income Tax Return (individuals)", track: "A", whoFiles: "Individuals in business/profession, quarterly", due: "May 15, Aug 15, Nov 15" },
  { id: "1702-RT", number: "1702-RT", name: "Annual Income Tax Return (regular rate)", track: "A", whoFiles: "Corporations/partnerships subject only to the regular rate", due: "15th day of the 4th month after year-end" },
  { id: "1702-EX", number: "1702-EX", name: "Annual Income Tax Return (exempt)", track: "A", whoFiles: "Non-individuals exempt under the Tax Code or special laws, no other taxable income", due: "15th day of the 4th month after year-end" },
  { id: "1702-MX", number: "1702-MX", name: "Annual Income Tax Return (mixed income)", track: "A", whoFiles: "Non-individuals with mixed income, multiple or special/preferential rates", due: "15th day of the 4th month after year-end" },
  { id: "1702Q", number: "1702Q", name: "Quarterly Income Tax Return (non-individuals)", track: "A", whoFiles: "Corporations/partnerships, quarterly", due: "Within 60 days after each of the first three quarters" },
  { id: "2316", number: "2316", name: "Certificate of Compensation Payment / Tax Withheld", track: "A", whoFiles: "Employer-issued certificate of compensation and tax withheld", due: "Issued by January 31" },
  { id: "2307", number: "2307", name: "Certificate of Creditable Tax Withheld at Source", track: "A", whoFiles: "Payor-issued certificate of creditable tax withheld at source", due: "Issued with the quarterly remittance cycle" },
  { id: "1604-C", number: "1604-C", name: "Annual Information Return (compensation)", track: "A", whoFiles: "Employers: annual information return of income taxes withheld on compensation", due: "January 31" },
  { id: "1604-E", number: "1604-E", name: "Annual Information Return (expanded withholding)", track: "A", whoFiles: "Withholding agents: annual information return of creditable income taxes withheld (expanded)", due: "March 1" },
  { id: "1706", number: "1706", name: "Capital Gains Tax Return (real property)", track: "A", whoFiles: "Capital gains tax on sale of real property held as capital asset", due: "Within 30 days after each sale" },
  { id: "1707", number: "1707", name: "Capital Gains Tax Return (shares not traded)", track: "A", whoFiles: "Capital gains tax on shares not traded on the exchange", due: "Within 30 days after each sale" },
  { id: "2550Q", number: "2550Q (April 2024)", name: "Quarterly Value-Added Tax Return", track: "B", whoFiles: "VAT-registered persons, quarterly VAT", due: "25th day after quarter-end" },
  { id: "2550M", number: "2550M", name: "Monthly Value-Added Tax Declaration (history only)", track: "B", whoFiles: "No longer required from 2023; taught as history", due: "—" },
  { id: "2551Q", number: "2551Q", name: "Quarterly Percentage Tax Return", track: "B", whoFiles: "Non-VAT persons subject to percentage tax, quarterly", due: "25th day after quarter-end" },
  { id: "1601-C", number: "1601-C", name: "Monthly Remittance Return of Income Taxes Withheld on Compensation", track: "B", whoFiles: "Employers, monthly withholding on compensation", due: "10th of the following month (December: January 15)" },
  { id: "0619-E", number: "0619-E", name: "Monthly Remittance Form of Creditable Income Taxes Withheld (Expanded)", track: "B", whoFiles: "Monthly remittance of expanded withholding, first two months of the quarter", due: "10th of the following month" },
  { id: "1601-EQ", number: "1601-EQ", name: "Quarterly Remittance Return of Creditable Income Taxes Withheld (Expanded)", track: "B", whoFiles: "Quarterly remittance of expanded (creditable) withholding", due: "Last day of the month after quarter-end" },
  { id: "1606", number: "1606", name: "Withholding Tax Remittance Return (real property, ordinary asset)", track: "B", whoFiles: "Withholding on sale of real property classified as ordinary asset", due: "Month after the transaction" },
  { id: "2000", number: "2000", name: "Documentary Stamp Tax Declaration/Return", track: "B", whoFiles: "Monthly documentary stamp tax declaration", due: "5th day after month-end" },
  { id: "2000-OT", number: "2000-OT", name: "Documentary Stamp Tax Declaration/Return (one-time transactions)", track: "B", whoFiles: "One-time DST (for example sale of real property, shares)", due: "5th day after month-end of the transaction" },
  { id: "1800", number: "1800", name: "Donor's Tax Return", track: "C", whoFiles: "Donor's tax return", due: "Within 30 days after the gift" },
  { id: "1801", number: "1801", name: "Estate Tax Return", track: "C", whoFiles: "Estate tax return", due: "Within 1 year from death" },
];

export const getForm = (id: string): FormEntry | undefined => FORMS.find((x) => x.id === id);
export const availableForms = (): FormEntry[] => FORMS.filter((x) => x.def);
