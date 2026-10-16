// Layout for the Manufacturing ERP workspace (/mfg/...). The sidebar, edition badge and the
// "wrong ERP" guard live in AppShell, which switches to the Manufacturing navigation when the active
// company is a Manufacturing company; this wrapper marks the section for edition-specific styling.
export default function MfgLayout({ children }: { children: React.ReactNode }) {
  return <div data-edition="mfg">{children}</div>;
}
