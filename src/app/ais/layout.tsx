// Layout for the Accounting Information Systems workspace (/ais/...). The sidebar, edition badge and the
// "wrong ERP" guard live in AppShell, which switches to the AIS navigation when the active company is an
// AIS company; this wrapper marks the section for edition-specific styling.
export default function AisLayout({ children }: { children: React.ReactNode }) {
  return <div data-edition="ais">{children}</div>;
}
