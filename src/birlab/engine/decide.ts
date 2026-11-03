// The "Which form do I file?" helper: a short questionnaire that ends in the form(s) to file and why. Pure, so it can be tested; the page only asks the questions.

export type Area = "income-individual" | "income-corporation" | "withholding" | "business-tax" | "transfer" | "gift-estate";

export interface Answers {
  area?: Area;
  // income-individual
  income?: "compensation" | "business" | "mixed" | "estate-trust";
  period?: "annual" | "quarterly";
  regime?: "osd-or-8" | "itemized";
  microSmall?: "yes" | "no";
  employers?: "one-whole-year" | "several";
  // income-corporation
  entity?: "regular" | "exempt" | "mixed";
  // withholding
  withheldOn?: "compensation" | "expanded" | "certificate";
  when?: "month-1-2" | "month-3" | "year";
  // business-tax
  taxType?: "vat" | "percentage" | "dst";
  // transfer
  transfer?: "real-capital" | "real-ordinary" | "shares";
  // gift-estate
  gift?: "gift" | "estate";
}

export interface Pick { form: string; reason: string }

export const AREA_LABELS: Record<Area, string> = {
  "income-individual": "The income tax of an individual",
  "income-corporation": "The income tax of a corporation, partnership or other non-individual",
  withholding: "Tax I withheld from others (I pay salaries or suppliers) or a certificate of it",
  "business-tax": "Business taxes: VAT, percentage tax or documentary stamp tax",
  transfer: "A sale or transfer of real property or shares",
  "gift-estate": "A gift (donation) or the estate of someone who died",
};

/** The forms to file for these answers, or an empty list when the answers are not complete yet. */
export function recommend(a: Answers): Pick[] {
  switch (a.area) {
    case "income-individual": {
      if (!a.income) return [];
      if (a.income === "compensation") {
        if (!a.employers) return [];
        return a.employers === "one-whole-year"
          ? [{ form: "2316", reason: "One employer for the whole year that withheld the correct tax: substituted filing. The employer's Form 2316 takes the place of the annual return; you do not file Form 1700." }]
          : [{ form: "1700", reason: "Two or more employers in the year (or tax not correctly withheld): no substituted filing, so you file the annual return for compensation income yourself." }, { form: "2316", reason: "Attach each employer's certificate." }];
      }
      if (!a.period) return [];
      if (a.period === "quarterly") return [{ form: "1701Q", reason: "Individuals in business or profession (and estates and trusts) declare and pay income tax each quarter for the first three quarters." }];
      if (a.income === "estate-trust") return [{ form: "1701", reason: "Estates and trusts file the annual return 1701." }];
      if (!a.regime) return [];
      if (a.regime === "itemized") return [{ form: "1701", reason: "Itemized deductions are only available on Form 1701 (mixed income or itemized self-employed)." }];
      if (!a.microSmall) return [];
      if (a.income === "mixed") return a.microSmall === "yes"
        ? [{ form: "1701-MS", reason: "A micro or small taxpayer with mixed income and a single tax regime may use the simplified Form 1701-MS." }, { form: "1701", reason: "Form 1701 is the alternative, and is required with several regimes or activities." }]
        : [{ form: "1701", reason: "Mixed income (compensation plus business or profession) files Form 1701." }];
      return a.microSmall === "yes"
        ? [{ form: "1701-MS", reason: "A micro or small taxpayer (gross sales under ₱20,000,000) is directed to the simplified Form 1701-MS under the BIR's August 2024 guidance (verify the latest announcement)." }, { form: "1701A", reason: "Form 1701A remains the return for purely business or profession income on the OSD or the 8% option." }]
        : [{ form: "1701A", reason: "Purely business or profession income on the OSD or the 8% option: Form 1701A." }];
    }
    case "income-corporation": {
      if (!a.entity || !a.period) return [];
      const annual = a.entity === "regular" ? "1702-RT" : a.entity === "exempt" ? "1702-EX" : "1702-MX";
      const why = a.entity === "regular" ? "Only the regular income tax rate applies." : a.entity === "exempt" ? "The entity is exempt and has no other taxable income." : "Income under more than one tax regime (regular, exempt, or a special rate).";
      return a.period === "annual"
        ? [{ form: annual, reason: why }]
        : [{ form: "1702Q", reason: "Corporations declare and pay income tax each quarter for the first three quarters, within 60 days after the quarter; the annual return takes the place of the fourth." }];
    }
    case "withholding": {
      if (!a.withheldOn) return [];
      if (a.withheldOn === "certificate") return [{ form: "2307", reason: "The payor gives the payee a Form 2307 for creditable (expanded) tax withheld; the payee uses it as a tax credit." }, { form: "2316", reason: "For compensation, the employer gives the employee a Form 2316 instead." }];
      if (a.withheldOn === "compensation") {
        if (!a.when) return [];
        return a.when === "year"
          ? [{ form: "1604-C", reason: "The annual information return of tax withheld on compensation; no payment is made with it." }, { form: "2316", reason: "And a certificate for each employee." }]
          : [{ form: "1601-C", reason: "Compensation withholding is remitted every month (the 10th day of the next month; December: January 15)." }];
      }
      if (!a.when) return [];
      if (a.when === "month-1-2") return [{ form: "0619-E", reason: "Expanded withholding of the first two months of a quarter is remitted monthly with the 0619-E, by the 10th of the next month." }];
      if (a.when === "month-3") return [{ form: "1601-EQ", reason: "The quarterly return reports all the quarter's expanded withholding and pays what the first two months did not." }];
      return [{ form: "1604-E", reason: "The annual information return of expanded withholding (due March 1); no payment is made with it." }];
    }
    case "business-tax": {
      if (!a.taxType) return [];
      if (a.taxType === "vat") return [{ form: "2550Q", reason: "A VAT-registered person files the quarterly VAT return. The monthly 2550M is no longer required from 2023." }];
      if (a.taxType === "percentage") return [{ form: "2551Q", reason: "Non-VAT persons subject to percentage tax file quarterly (unless an individual elected the 8% income tax rate in lieu of it)." }];
      return [{ form: "2000", reason: "Documentary stamp tax on the instruments of the month; one-time sales of real property or shares use the 2000-OT." }, { form: "2000-OT", reason: "For a one-time sale or transfer of real property or shares of stock." }];
    }
    case "transfer": {
      if (!a.transfer) return [];
      if (a.transfer === "real-capital") return [{ form: "1706", reason: "The seller pays the 6% capital gains tax on a real property held as a capital asset." }, { form: "2000-OT", reason: "And the documentary stamp tax on the deed." }];
      if (a.transfer === "real-ordinary") return [{ form: "1606", reason: "The buyer withholds tax on the sale of an ordinary-asset real property; the sale is income of the seller." }, { form: "2000-OT", reason: "And the documentary stamp tax on the deed." }];
      return [{ form: "1707", reason: "The 15% capital gains tax on shares not traded through the stock exchange." }, { form: "2000-OT", reason: "And the documentary stamp tax on the transfer." }];
    }
    case "gift-estate": {
      if (!a.gift) return [];
      return a.gift === "gift"
        ? [{ form: "1800", reason: "Donor's tax: 6% of net gifts above ₱250,000 a calendar year, within 30 days after the gift." }, { form: "2000-OT", reason: "And the documentary stamp tax if the gift is real property or shares." }]
        : [{ form: "1801", reason: "Estate tax: 6% of the net taxable estate, within one year from death." }];
    }
    default:
      return [];
  }
}

/** The next question to ask for these answers, or null when `recommend` has an answer. */
export interface Question { key: keyof Answers; text: string; options: { value: string; label: string }[] }
export function nextQuestion(a: Answers): Question | null {
  const q = (key: keyof Answers, text: string, options: [string, string][]): Question => ({ key, text, options: options.map(([value, label]) => ({ value, label })) });
  if (!a.area) return q("area", "What do you need to report or pay?", (Object.entries(AREA_LABELS) as [string, string][]));
  if (recommend(a).length > 0) return null;
  switch (a.area) {
    case "income-individual":
      if (!a.income) return q("income", "What kind of income?", [["compensation", "Only salary or wages (compensation)"], ["business", "Only business or profession"], ["mixed", "Both salary and business or profession"], ["estate-trust", "An estate or a trust"]]);
      if (a.income === "compensation" && !a.employers) return q("employers", "How many employers in the year?", [["one-whole-year", "One employer for the whole year, tax correctly withheld"], ["several", "Two or more employers, or tax not correctly withheld"]]);
      if (!a.period) return q("period", "Which return?", [["quarterly", "A quarterly return (1st to 3rd quarter)"], ["annual", "The annual return"]]);
      if (!a.regime) return q("regime", "How are deductions taken?", [["osd-or-8", "Optional standard deduction (40%) or the 8% rate"], ["itemized", "Itemized deductions"]]);
      return q("microSmall", "Is the taxpayer a micro or small taxpayer (gross sales under ₱20 million)?", [["yes", "Yes"], ["no", "No"]]);
    case "income-corporation":
      if (!a.entity) return q("entity", "What income does the entity have?", [["regular", "Only income at the regular rate"], ["exempt", "Only exempt income (for example a general professional partnership)"], ["mixed", "Regular plus exempt or special-rate income"]]);
      return q("period", "Which return?", [["quarterly", "A quarterly return"], ["annual", "The annual return"]]);
    case "withholding":
      if (!a.withheldOn) return q("withheldOn", "What was withheld?", [["compensation", "Tax on employees' compensation"], ["expanded", "Expanded (creditable) tax on suppliers, rent or professionals"], ["certificate", "I need to issue or understand a certificate"]]);
      if (a.withheldOn === "compensation") return q("when", "Which period?", [["month-1-2", "A month (monthly remittance)"], ["year", "The whole year"]]);
      return q("when", "Which period?", [["month-1-2", "The first or second month of a quarter"], ["month-3", "The whole quarter (third month)"], ["year", "The whole year"]]);
    case "business-tax":
      return q("taxType", "Which tax?", [["vat", "VAT (I am VAT-registered)"], ["percentage", "Percentage tax (I am not VAT-registered)"], ["dst", "Documentary stamp tax"]]);
    case "transfer":
      return q("transfer", "What was transferred?", [["real-capital", "Real property held as a capital asset"], ["real-ordinary", "Real property that is an ordinary asset (business or for sale)"], ["shares", "Shares of stock not traded through the exchange"]]);
    default:
      return q("gift", "Which?", [["gift", "A gift (donation) during life"], ["estate", "The estate of a decedent"]]);
  }
}
