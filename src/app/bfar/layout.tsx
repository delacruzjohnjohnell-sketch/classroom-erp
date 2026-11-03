import type { ReactNode } from "react";
import { BfarNav } from "@/bfar/components/BfarNav";

// BFAR is a standalone fourth module: it does not use AppShell, the session or the database.
export default function BfarLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <BfarNav />
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
