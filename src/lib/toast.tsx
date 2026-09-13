"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

type ToastItem = { id: number; type: "success" | "error"; message: string };
type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let listeners: Listener[] = [];
let nextId = 1;

function emit() {
  listeners.forEach((l) => l(items));
}

function push(type: ToastItem["type"], message: string) {
  const id = nextId++;
  items = [...items, { id, type, message }];
  emit();
  setTimeout(() => dismiss(id), type === "error" ? 7000 : 4000);
  return id;
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/** Call from anywhere — no hooks required — to surface a message to the user. */
export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
};

/**
 * Mount once (in AppShell) to render whatever toasts are currently queued.
 */
export function ToastHost() {
  const [list, setList] = useState<ToastItem[]>(items);
  useEffect(() => {
    listeners.push(setList);
    return () => {
      listeners = listeners.filter((l) => l !== setList);
    };
  }, []);

  if (list.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[200] flex flex-col gap-2"
      style={{ maxWidth: 360, width: "calc(100vw - 32px)" }}
    >
      {list.map((t) => (
        <div
          key={t.id}
          className="flex items-start gap-2 rounded-lg px-3.5 py-3 text-[13px] font-medium shadow-lg border"
          style={{
            background: t.type === "error" ? "#FCEFEC" : "#EAF3F1",
            color: t.type === "error" ? "#A6402F" : "#12524F",
            borderColor: t.type === "error" ? "#F0C6BC" : "#BFE0DB",
          }}
        >
          {t.type === "error" ? (
            <XCircle size={16} className="mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          )}
          <div className="flex-1">{t.message}</div>
          <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100 shrink-0">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
