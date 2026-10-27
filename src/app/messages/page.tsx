"use client";

import AppShell from "@/components/AppShell";
import MessagesPanel from "@/components/MessagesPanel";

// Messages with the teacher, in whichever ERP the student is working in (the shell picks the right menu).
export default function MessagesPage() {
  return (
    <AppShell>
      <MessagesPanel />
    </AppShell>
  );
}
