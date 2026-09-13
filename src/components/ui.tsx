"use client";

import { X, Loader2, Search } from "lucide-react";

const BADGE_COLORS = ["#12524F", "#C08A2E", "#A6402F", "#3E5C76"];

export function KpiCard({ icon, label, value, accent, badge }: { icon: React.ReactNode; label: string; value: string | number; accent?: string; badge?: number }) {
  const badgeColor = badge != null ? BADGE_COLORS[badge % BADGE_COLORS.length] : undefined;
  return (
    <div className="bg-panel border border-hairline rounded-[11px] px-4 py-3.5 flex items-start gap-2.5 shadow-[0_1px_2px_rgba(27,36,48,0.04)]">
      <div className="mt-0.5" style={{ color: accent || "#12524F" }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {badgeColor && (
            <span
              className="w-4 h-4 rounded-full text-white text-[9.5px] font-bold flex items-center justify-center shrink-0"
              style={{ background: badgeColor }}
            >
              {badge! + 1}
            </span>
          )}
          <div className="text-[11px] text-[#8a8172] font-semibold uppercase tracking-wide truncate">{label}</div>
        </div>
        <div className="text-[19px] font-bold mt-0.5" style={{ color: accent || "#1B2430", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      </div>
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-panel border border-hairline rounded-xl p-[18px] shadow-[0_1px_3px_rgba(27,36,48,0.05)]">
      <div className="text-[13px] font-bold mb-3 text-[#3f3a30]">{title}</div>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] text-[#8a8172] py-4 text-center">{children}</div>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-[rgba(27,36,48,0.45)] flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className={`bg-panel rounded-2xl p-6 w-full ${wide ? "max-w-[560px]" : "max-w-[420px]"} max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="font-serif text-base font-bold">{title}</div>
          <button onClick={onClose} className="text-[#8a8172]"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="text-[13px] text-[#6b6357] leading-relaxed mt-2 mb-5">{message}</div>
      <div className="flex gap-2 justify-end">
        <OutlineBtn onClick={onCancel} disabled={busy}>
          Cancel
        </OutlineBtn>
        <GoldBtn
          onClick={onConfirm}
          disabled={busy}
          style={danger ? { background: "#A6402F" } : undefined}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : null} {confirmLabel}
        </GoldBtn>
      </div>
    </Modal>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative" style={{ width: 220 }}>
      <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-2.5 text-[#8a8172] pointer-events-none" />
      <input
        className="input"
        style={{ paddingLeft: 28 }}
        placeholder={placeholder ?? "Search…"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute top-1/2 -translate-y-1/2 right-2 text-[#8a8172]"
        >
          <X size={13} />
        </button>
      )}
      {/* .input's CSS normally only loads while a modal (FormStyles) is open — SearchBox
          lives in the main toolbar, so it carries its own copy. Harmless if duplicated. */}
      <FormStyles />
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-semibold text-[#5c5548] mb-1.5 mt-3.5 block">{children}</label>;
}

export function GoldBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`flex items-center gap-1.5 bg-gold text-white border-none rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-50 ${props.className ?? ""}`}>{children}</button>;
}
export function OutlineBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`flex items-center gap-1.5 bg-panel text-teal border border-teal rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-50 ${props.className ?? ""}`}>{children}</button>;
}
export function TinyBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="inline-flex items-center gap-1 bg-tealsoft text-teal border-none rounded px-2 py-1 text-[11.5px] font-semibold">{children}</button>;
}
export function StatusPill({ status }: { status: string }) {
  const done = status === "received" || status === "fulfilled";
  const pending = status === "pending_approval";
  const color = done ? "#12524F" : pending ? "#A6402F" : "#C08A2E";
  return (
    <span className="text-[11px] font-semibold capitalize border rounded-full px-2.5 py-0.5" style={{ color, borderColor: color }}>
      {status.replace("_", " ")}
    </span>
  );
}

export function FormStyles() {
  return (
    <style jsx global>{`
      .input { font-size: 14px; padding: 9px 11px; border-radius: 8px; border: 1px solid #DDD8CC; background: #F5F3EE; color: #1B2430; outline: none; width: 100%; }
      .primary-btn { display: flex; align-items: center; justify-content: center; gap: 6px; background: #12524F; color: #fff; border: none; padding: 11px 14px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; width: 100%; }
      .primary-btn:disabled { opacity: 0.5; }
    `}</style>
  );
}
