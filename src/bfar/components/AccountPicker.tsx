"use client";
// The account box used everywhere a student chooses an account: type a code or the first letters, pick from the matches. The whole chart is never shown as a list.
import { useId, useState } from "react";
import { getAccount, suggestAccounts } from "../core/chart-of-accounts";

const input = "w-full rounded border border-gray-300 px-1.5 py-1 text-xs";

export function AccountSelect({ value, onChange, disabled, taken = [], className = input, label: ariaLabel = "Account" }: { value: string; onChange: (code: string) => void; disabled?: boolean; taken?: string[]; className?: string; label?: string }) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const shown = value ? `${value} ${getAccount(value)?.name ?? ""}` : "";
  const matches = suggestAccounts(query).filter((a) => !taken.includes(a.code) || a.code === value);
  const choose = (code: string) => { onChange(code); setOpen(false); setQuery(""); };
  return (
    <div className="relative">
      <input
        role="combobox" aria-expanded={open && query !== ""} aria-controls={listId} aria-autocomplete="list" aria-label={ariaLabel} disabled={disabled}
        value={open ? query : shown} placeholder="Type a code or name, e.g. ca" autoComplete="off" className={className}
        onFocus={() => { setOpen(true); setQuery(""); setActive(0); }}
        onBlur={() => setOpen(false)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); if (e.target.value === "" && value) onChange(""); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((x) => Math.min(x + 1, Math.max(matches.length - 1, 0))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((x) => Math.max(x - 1, 0)); }
          else if (e.key === "Enter" && open && matches[active]) { e.preventDefault(); choose(matches[active].code); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && query.trim() !== "" && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-0.5 max-h-56 w-full min-w-[14rem] overflow-auto rounded border border-gray-300 bg-white py-1 text-xs shadow-lg">
          {matches.length === 0 ? <li className="px-2 py-1 text-gray-500">No account matches &quot;{query}&quot;</li> : matches.map((a, i) => (
            <li key={a.code} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); choose(a.code); }} onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-2 py-1 ${i === active ? "bg-blue-600 text-white" : "hover:bg-gray-100"}`}><b>{a.code}</b> {a.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
