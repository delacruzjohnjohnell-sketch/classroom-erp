// @vitest-environment jsdom
// The shared page frame (used by the Standard, Manufacturing and AIS editions): on a phone or tablet its menu is a drawer that opens from a button,
// closes with Escape, the backdrop or the close button, and the page content never sits inside it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn(async () => ({ data: [] })), channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })), removeChannel: vi.fn() } }));
vi.mock("@/lib/session", () => ({ useSession: () => ({ userId: "u1" }) }));
vi.mock("@/lib/useUnreadMessages", () => ({ useUnreadMessages: () => 0 }));
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

import { MfgFrame } from "../../components/mfg/MfgShell";

const frame = () => render(
  <MfgFrame pathname="/dashboard" fullName="Ana Cruz" role="student" isTeacher={false} tenantName="Demo Co" otherViewers={[]}
    items={[{ href: "/dashboard", label: "Dashboard", icon: () => null }, { href: "/sales", label: "Invoices", icon: () => null }]}
    searchSlot={<input aria-label="search" />} companySlot={<span>Company switcher</span>} onSignOut={() => {}} onAllCompanies={() => {}}>
    <p>page content</p>
  </MfgFrame>,
);
afterEach(cleanup);

describe("the page frame on small screens", () => {
  it("starts with the drawer closed and a button that opens it", () => {
    frame();
    const open = screen.getByRole("button", { name: "Open menu" });
    expect(open.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("app-menu")?.className).toContain("-translate-x-full");
  });
  it("opens from the button and closes with Escape, the backdrop and the close button", () => {
    frame();
    const menu = () => document.getElementById("app-menu")!.className;
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(menu()).not.toContain("-translate-x-full");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(menu()).toContain("-translate-x-full");
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(document.querySelector('[aria-hidden="true"].fixed') as Element);
    expect(menu()).toContain("-translate-x-full");
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(menu()).toContain("-translate-x-full");
  });
  it("keeps the page content outside the drawer and shows the company switcher inside it for phones", () => {
    frame();
    expect(document.getElementById("app-menu")?.contains(screen.getByText("page content"))).toBe(false);
    expect(document.getElementById("app-menu")?.textContent).toContain("Company switcher");
  });
});
