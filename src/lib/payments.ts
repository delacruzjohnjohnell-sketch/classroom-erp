import { todayStr } from "./types";

export type PaymentStatus = "Draft" | "Pending Approval" | "Open" | "Partial" | "Paid" | "Overdue" | "Void";

export function computePaymentStatus(postedStatus: "draft" | "pending_approval" | "fulfilled" | "received" | "void", total: number, paid: number, dueDate: string | null): PaymentStatus {
  if (postedStatus === "void") return "Void";
  if (postedStatus === "draft") return "Draft";
  if (postedStatus === "pending_approval") return "Pending Approval";
  if (paid >= total - 0.005) return "Paid";
  const overdue = dueDate && dueDate < todayStr();
  if (paid > 0) return overdue ? "Overdue" : "Partial";
  return overdue ? "Overdue" : "Open";
}

export const STATUS_COLOR: Record<PaymentStatus, string> = {
  Draft: "#8a8172",
  "Pending Approval": "#A6402F",
  Open: "#C08A2E",
  Partial: "#5B7B93",
  Paid: "#12524F",
  Overdue: "#A6402F",
  Void: "#8a8172",
};

// Aging buckets for AR/AP reports.
export function agingBucket(dueDate: string | null): "Current" | "1-30" | "31-60" | "61-90" | "90+" {
  if (!dueDate) return "Current";
  const days = Math.floor((new Date(todayStr()).getTime() - new Date(dueDate).getTime()) / 86400000);
  if (days <= 0) return "Current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}
