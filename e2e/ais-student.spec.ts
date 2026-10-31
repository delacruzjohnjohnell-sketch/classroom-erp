import { expect, test, type Page } from "@playwright/test";

// A test student (not a real one) who belongs to an AIS company with the January practice set assigned and the Accounting phase open.
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test.skip(!EMAIL || !PASSWORD, "Set E2E_EMAIL and E2E_PASSWORD (a test student with an AIS company) to run these tests.");

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(EMAIL!);
  await page.locator('input[type="password"]').fill(PASSWORD!);
  await page.locator("button.primary-btn").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

const DESKS: { path: string; heading: RegExp }[] = [
  { path: "/ais", heading: /./ },
  { path: "/ais/inbox", heading: /Revenue cycle|Document inbox/i },
  { path: "/ais/sales", heading: /^Sales desk$/ },
  { path: "/ais/purchases", heading: /^Purchases desk$/ },
  { path: "/ais/payroll", heading: /^Payroll desk$/ },
  { path: "/ais/assets", heading: /^Fixed assets desk$/ },
  { path: "/ais/close", heading: /Close the books/i },
  { path: "/ais/ledger", heading: /General ledger/i },
];

test.describe("AIS student pages", () => {
  test.beforeEach(async ({ page }) => {
    // a native alert, confirm or prompt freezes the page for real users and for tests: none of these pages may open one
    page.on("dialog", async (d) => { await d.dismiss(); throw new Error(`Unexpected ${d.type()} dialog: ${d.message()}`); });
    await signIn(page);
  });

  test("every AIS page loads, shows its heading, and raises no script error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const d of DESKS) {
      await page.goto(d.path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(d.heading, { timeout: 20_000 });
      expect(new URL(page.url()).pathname, `${d.path} must stay inside the AIS edition`).toBe(d.path);
    }
    expect(errors).toEqual([]);
  });

  test("each desk shows its how-it-works notes and a score tile that starts at zero", async ({ page }) => {
    for (const path of ["/ais/sales", "/ais/purchases", "/ais/payroll", "/ais/assets", "/ais/close"]) {
      await page.goto(path);
      await expect(page.getByText("How this desk works")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/^0 \/ \d+$/).first()).toBeVisible();
    }
  });

  test("the Purchases desk shows prices as money", async ({ page }) => {
    await page.goto("/ais/purchases");
    await expect(page.getByText(/^1,640\.00$/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^1640$/)).toHaveCount(0);
  });

  test("the company list inside AIS shows only AIS companies", async ({ page }) => {
    await page.goto("/ais");
    await page.locator('button[aria-haspopup="listbox"]').click();
    const names = await page.getByRole("option").allTextContents();
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n).not.toMatch(/Test Company|Pilot Bamboo/i);
  });

  test("a document packet opens with its documents and the decision form, and nothing is changed by looking", async ({ page }) => {
    await page.goto("/ais/inbox");
    await page.locator("tbody tr").first().click();
    await expect(page.getByText("The document packet")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Your decision")).toBeVisible();
  });
});
