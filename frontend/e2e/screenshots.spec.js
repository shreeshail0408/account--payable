/*
 * Captures every page in light and dark at 1440px and 375px into docs/screenshots/
 * (`npm run screenshots`). Runs after the smoke flow so lists have data.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { API_URL, PAGES, SAMPLE_INVOICE, SCREENSHOT_DIR, USERS, storageFor, useTheme, waitForPage } from "./helpers.js";

const VIEWPORTS = [
  { label: "1440", width: 1440, height: 900, mobile: false },
  { label: "375", width: 375, height: 812, mobile: true },
];
const SHOWN = PAGES.filter((target) => target.name !== "styleguide");

test.use({ storageState: storageFor("shots") });

test.beforeAll(async ({ request }) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  // Generate a payment for the approved invoice so the Payments page has a record.
  const state = JSON.parse(fs.readFileSync(storageFor("shots"), "utf8"));
  const token = state.origins[0].localStorage.find((item) => item.name === "access").value;
  const headers = { Authorization: `Bearer ${token}` };
  const invoices = await (await request.get(`${API_URL}/invoices/?status=APPROVED`, { headers })).json();
  const approved = (invoices.results || invoices)[0];
  if (approved) {
    const response = await request.post(`${API_URL}/payments/generate/`, {
      headers,
      data: { invoice: approved.id, payment_method: "NEFT" },
    });
    expect([200, 201, 400]).toContain(response.status());
  }
  expect(USERS.shots.username).toBeTruthy();
});

async function settle(page) {
  // Let entrance animations and charts finish so screenshots are stable.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(400);
}

for (const theme of ["light", "dark"]) {
  for (const viewport of VIEWPORTS) {
    test.describe(`${theme} ${viewport.label}px`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.mobile,
        hasTouch: viewport.mobile,
      });

      test.beforeEach(async ({ page }) => {
        await useTheme(page, theme);
      });

      test("login", async ({ browser }) => {
        // Contexts inherit the project's storageState; start signed out explicitly.
        const context = await browser.newContext({
          storageState: { cookies: [], origins: [] },
          viewport: { width: viewport.width, height: viewport.height },
          isMobile: viewport.mobile,
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        await useTheme(page, theme);
        await page.goto("/login");
        await page.getByRole("heading", { name: "Sign in" }).waitFor();
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `login-${theme}-${viewport.label}.png`) });
        await context.close();
      });

      for (const target of SHOWN) {
        test(target.name, async ({ page }) => {
          await page.goto(target.path);
          await waitForPage(page, target.heading, target);
          await settle(page);
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${target.name}-${theme}-${viewport.label}.png`) });
        });
      }

      test("invoice review", async ({ page }) => {
        // A fresh capture shows the OCR result; the review is closed without saving.
        await page.goto("/invoices");
        await waitForPage(page, "Invoices");
        await page.getByRole("button", { name: "Capture invoices" }).first().click();
        await page.getByRole("dialog").locator("input[type=file]").setInputFiles(SAMPLE_INVOICE);
        const review = page.getByRole("dialog");
        await expect(review.getByLabel("Invoice number")).toHaveValue(/SAMPLE/, { timeout: 45_000 });
        await page.waitForLoadState("networkidle");
        await settle(page);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `invoice-review-${theme}-${viewport.label}.png`) });
      });
    });
  }
}
