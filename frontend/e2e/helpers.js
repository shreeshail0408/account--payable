import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const API_URL = `http://localhost:${process.env.E2E_API_PORT || "8020"}/api`;
export const BASE_URL = `http://localhost:${process.env.E2E_WEB_PORT || "5190"}`;
export const AUTH_DIR = path.join(here, ".auth");
export const SAMPLE_INVOICE = path.join(here, "..", "..", "docs", "assets", "sample-invoice.png");
export const SCREENSHOT_DIR = path.join(here, "..", "..", "docs", "screenshots");

export const USERS = {
  admin: { username: "admin", password: process.env.E2E_ADMIN_PASSWORD || "e2e-Admin-Pass-2026" },
  approver: { username: "approver", password: process.env.E2E_APPROVER_PASSWORD || "e2e-Approver-Pass-2026" },
  // Extra administrators so the screenshot and a11y runs each get their own per-user rate limit.
  shots: { username: "e2e_shots", password: "e2e-Shots-Pass-2026!", role: "ADMIN", email: "shots@example.test" },
  audit: { username: "e2e_a11y", password: "e2e-A11y-Pass-2026!", role: "ADMIN", email: "a11y@example.test" },
  // Created (with an administrator-set password) but never signed in: the smoke test walks the
  // forced password change and an administrator reset with it.
  newhire: {
    username: "e2e_newhire",
    password: "e2e-Issued-Pass-2026!",
    ownPassword: "e2e-My-Own-Pass-2026!",
    role: "AP_CLERK",
    email: "newhire@example.test",
  },
};

export const storageFor = (name) => path.join(AUTH_DIR, `${name}.json`);

/** Every routed page, used by the screenshot and accessibility suites. */
export const PAGES = [
  { name: "dashboard", path: "/", heading: "Dashboard" },
  { name: "invoices", path: "/invoices", heading: "Invoices" },
  { name: "vendors", path: "/vendors", heading: "Vendors" },
  { name: "purchase-orders", path: "/purchase-orders", heading: "Purchase orders" },
  { name: "goods-receipts", path: "/goods-receipts", heading: "Goods receipts" },
  { name: "approvals", path: "/approvals?view=all", heading: "Approvals" },
  { name: "payments", path: "/payments", heading: "Payments" },
  { name: "reports", path: "/reports", heading: "Reports" },
  { name: "employees", path: "/employees", heading: "Employees" },
  // The styleguide renders a LoadingState specimen on purpose.
  { name: "styleguide", path: "/styleguide", heading: "Design system", keepsSkeletons: true },
];

/** Picks the light or dark theme before the app boots (the ThemeProvider reads "ap-theme"). */
export async function useTheme(page, theme) {
  await page.addInitScript((value) => {
    window.localStorage.setItem("ap-theme", value);
  }, theme);
}

/** Waits until skeletons are gone and the page heading is visible. */
export async function waitForPage(page, heading, { keepsSkeletons = false } = {}) {
  await page.getByRole("heading", { level: 1, name: heading }).waitFor();
  if (keepsSkeletons) {
    await page.waitForLoadState("networkidle");
    return;
  }
  await page.waitForFunction(() => !document.querySelector("[data-slot=skeleton], .animate-pulse"), null, { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
}
