"use client";

import { X, Loader2, Search } from "lucide-react";

const CYAN = "#22D3C5", AMBER = "#F2B13C", RED = "#FF6B7A", BLUE = "#5AA9FF";
const BADGE_COLORS = [CYAN, AMBER, RED, BLUE];
const MONO = 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';

export function KpiCard({ icon, label, value, accent, badge }: { icon: React.ReactNode; label: string; value: string | number; accent?: string; badge?: number }) {
  const badgeColor = badge != null ? BADGE_COLORS[badge % BADGE_COLORS.length] : undefined;
  const color = accent || CYAN;
  return (
    <div className="relative overflow-hidden bg-panel border border-hairline rounded-lg px-4 py-3.5 transition-shadow hover:shadow-glow">
      <span className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
      <div className="flex items-center gap-1.5 min-w-0">
        {badgeColor && (
          <span
            className="w-4 h-4 rounded text-onaccent text-[9.5px] font-bold flex items-center justify-center shrink-0"
            style={{ background: badgeColor }}
          >
            {badge! + 1}
          </span>
        )}
        <span className="shrink-0 flex" style={{ color }}>{icon}</span>
        <div className="text-[10px] text-[#7F8EA0] font-semibold uppercase tracking-[0.1em] truncate" style={{ fontFamily: MONO }}>{label}</div>
      </div>
      <div className="text-[19px] font-semibold mt-2 break-words leading-tight" style={{ color: accent || "#E6EDF3", fontVariantNumeric: "tabular-nums", fontFamily: MONO }}>{value}</div>
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative bg-panel border border-hairline rounded-lg p-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
      <div className="absolute left-0 right-0 top-0 h-px" style={{ background: "linear-gradient(90deg, rgba(34,211,197,0.55), rgba(34,211,197,0) 45%)" }} />
      <div className="flex items-center gap-2 mb-3.5">
        <span className="w-1.5 h-1.5 rounded-[1px] bg-teal" style={{ boxShadow: "0 0 8px #22D3C5" }} />
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-[#C9D4E0]" style={{ fontFamily: MONO }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[12.5px] text-[#7F8EA0] py-5 text-center" style={{ fontFamily: MONO }}>{children}</div>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-[rgba(2,5,9,0.72)] backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className={`relative bg-panel border border-hairline rounded-xl p-6 w-full ${wide ? "max-w-[560px]" : "max-w-[420px]"} max-h-[90vh] overflow-y-auto shadow-[0_24px_70px_rgba(0,0,0,0.6),0_0_0_1px_rgba(34,211,197,0.08)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute left-0 right-0 top-0 h-px" style={{ background: "linear-gradient(90deg, rgba(34,211,197,0.7), rgba(34,211,197,0) 60%)" }} />
        <div className="flex items-center justify-between mb-1">
          <div className="text-[14px] font-semibold text-ink" style={{ fontFamily: MONO }}><span className="text-teal">&gt;</span> {title}</div>
          <button onClick={onClose} className="text-[#7F8EA0] hover:text-ink"><X size={16} /></button>
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
      <div className="text-[13px] text-[#A3B1C2] leading-relaxed mt-2 mb-5">{message}</div>
      <div className="flex gap-2 justify-end">
        <OutlineBtn onClick={onCancel} disabled={busy}>
          Cancel
        </OutlineBtn>
        <GoldBtn
          onClick={onConfirm}
          disabled={busy}
          style={danger ? { background: RED, color: "#04121A", borderColor: RED, boxShadow: "0 0 18px rgba(255,107,122,0.25)" } : undefined}
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
      <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-2.5 text-[#7F8EA0] pointer-events-none" />
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
          className="absolute top-1/2 -translate-y-1/2 right-2 text-[#7F8EA0] hover:text-ink"
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
  return <label className="text-[11.5px] font-medium text-[#A3B1C2] mb-1.5 mt-3.5 block" style={{ fontFamily: MONO }}>{children}</label>;
}

// Primary action: amber outline with a soft glow. Pass a style to recolour (e.g. danger).
export function GoldBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`flex items-center gap-1.5 text-gold border border-[rgba(242,177,60,0.55)] bg-[rgba(242,177,60,0.12)] hover:bg-[rgba(242,177,60,0.2)] rounded-md px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${props.className ?? ""}`}
      style={{ boxShadow: "0 0 16px rgba(242,177,60,0.08)", ...props.style }}
    >
      {children}
    </button>
  );
}
export function OutlineBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`flex items-center gap-1.5 bg-transparent text-teal border border-[rgba(34,211,197,0.5)] hover:bg-tealsoft rounded-md px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${props.className ?? ""}`}>{children}</button>;
}
export function TinyBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="inline-flex items-center gap-1 bg-tealsoft text-teal border border-[rgba(34,211,197,0.25)] hover:border-[rgba(34,211,197,0.6)] rounded px-2 py-1 text-[11.5px] font-semibold transition-colors">{children}</button>;
}
export function StatusPill({ status }: { status: string }) {
  const done = status === "received" || status === "fulfilled";
  const pending = status === "pending_approval";
  const voided = status === "void";
  const color = voided ? "#7F8EA0" : done ? CYAN : pending ? RED : AMBER;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] border rounded px-2 py-0.5"
      style={{ color, borderColor: `${color}55`, background: `${color}14`, textDecoration: voided ? "line-through" : undefined, fontFamily: MONO }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {status.replace("_", " ")}
    </span>
  );
}

export function FormStyles() {
  return (
    <style jsx global>{`
      .input { font-size: 14px; padding: 9px 11px; border-radius: 8px; border: 1px solid #243140; background: #0D1319; color: #E6EDF3; outline: none; width: 100%; }
      .primary-btn { display: flex; align-items: center; justify-content: center; gap: 6px; background: rgba(34,211,197,0.14); color: #5EEAD4; border: 1px solid rgba(34,211,197,0.6); box-shadow: 0 0 18px rgba(34,211,197,0.12); padding: 11px 14px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; width: 100%; }
      .primary-btn:hover:not(:disabled) { background: rgba(34,211,197,0.22); }
      .primary-btn:disabled { opacity: 0.5; }
    `}</style>
  );
}
