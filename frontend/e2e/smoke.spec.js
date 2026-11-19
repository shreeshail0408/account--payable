/*
 * Smoke tests for the core AP flow. The serial block runs in order: the invoice captured and
 * submitted in "single upload" is the one the approver approves on a 375px phone.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { SAMPLE_INVOICE, USERS, storageFor, waitForPage } from "./helpers.js";

const INVOICE_NUMBER = "SAMPLE-INV-001";

test.describe("signed out", () => {
  test("login with username and password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(USERS.admin.username);
    await page.getByLabel("Password", { exact: true }).fill(USERS.admin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/$/);
    await waitForPage(page, "Dashboard");
    await expect(page.getByRole("button", { name: /Account menu for admin/ })).toBeVisible();
  });

  test("protected pages redirect to login", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});

test.describe("as admin", () => {
  test.use({ storageState: storageFor("admin") });

  test("dashboard loads its cards without errors", async ({ page }) => {
    const failures = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/") && response.status() >= 400) {
        failures.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.goto("/");
    await waitForPage(page, "Dashboard");
    await expect(page.getByText(/Outstanding/i).first()).toBeVisible();
    await expect(page.locator("[role=alert]")).toHaveCount(0);
    expect(failures).toEqual([]);
  });

  test("theme toggle switches to dark and back, and persists", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page, "Dashboard");
    const html = page.locator("html");

    await page.getByRole("button", { name: /Account menu/ }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(html).toHaveClass(/\bdark\b/);

    await page.reload();
    await waitForPage(page, "Dashboard");
    await expect(html).toHaveClass(/\bdark\b/);

    await page.getByRole("button", { name: /Account menu/ }).click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(html).not.toHaveClass(/\bdark\b/);
  });
});

test.describe.serial("capture → approve", () => {
  test.describe("as admin", () => {
    test.use({ storageState: storageFor("admin") });

    test("single upload → OCR review → confirm & submit", async ({ page }) => {
      await page.goto("/invoices");
      await waitForPage(page, "Invoices");
      await page.getByRole("button", { name: "Capture invoices" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Capture invoices" });
      await dialog.locator("input[type=file]").setInputFiles(SAMPLE_INVOICE);

      // One file goes straight to the review workspace; wait for OCR to fill the fields.
      const review = page.getByRole("dialog", { name: /sample-invoice\.png|Review/i });
      await expect(review).toBeVisible();
      await expect(review.getByLabel("Invoice number")).toHaveValue(INVOICE_NUMBER, { timeout: 45_000 });
      await expect(review.locator("#review-total_amount")).toHaveValue("118");
      await expect(review.locator("#review-vendor")).toContainText("Acme Supplies");

      // The reviewer adds the line item OCR didn't pick up, then links the PO (lines auto-link by description).
      await review.getByRole("button", { name: "Add line" }).click();
      await review.getByPlaceholder("Description").fill("A4 paper");
      await review.getByLabel("Qty").fill("2");
      await review.getByLabel("Unit price").fill("50");
      await review.getByRole("radio", { name: "3-way" }).click();
      await review.locator("#review-po").click();
      await page.getByRole("option", { name: /PO-3WAY-DEMO-001/ }).click();
      await expect(review.getByRole("combobox", { name: "PO line for line 1" })).toContainText("A4 paper");
      await expect(review.getByText("All required fields are valid and the totals add up.")).toBeVisible();

      await review.getByLabel(/I checked these fields/).check();
      await review.getByRole("button", { name: "Confirm & submit" }).click();

      await expect(page.locator("[data-sonner-toast]").filter({ hasText: /sent for approval/i })).toBeVisible();
      await expect(review).toBeHidden();
      await expect(page.getByRole("row", { name: new RegExp(INVOICE_NUMBER) })).toContainText(/Pending approval/i);
    });

    test("bulk upload captures several files with per-file progress", async ({ page }, testInfo) => {
      // Distinct bytes per file so the exact-duplicate file check doesn't reject them.
      const files = [1, 2].map((index) => {
        const file = testInfo.outputPath(`bulk-${index}.png`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.concat([fs.readFileSync(SAMPLE_INVOICE), Buffer.from(`e2e-bulk-${index}`)]));
        return file;
      });

      await page.goto("/invoices");
      await waitForPage(page, "Invoices");
      await page.getByRole("button", { name: "Capture invoices" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Capture invoices" });
      await dialog.locator("input[type=file]").setInputFiles(files);

      await expect(dialog.getByText("bulk-1.png")).toBeVisible();
      await expect(dialog.getByText("bulk-2.png")).toBeVisible();
      await dialog.getByRole("combobox", { name: "Vendor for this batch" }).click();
      await page.getByRole("option", { name: /Acme Supplies/ }).click();
      await dialog.getByRole("button", { name: /Upload 2 files/ }).click();

      await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible({ timeout: 90_000 });
      await expect(page.locator("[data-sonner-toast]").filter({ hasText: /captured/i }).first()).toBeVisible();
    });
  });

  test.describe("as approver on a 375px phone", () => {
    test.use({ storageState: storageFor("approver"), viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

    test("approve from the mobile card view", async ({ page }) => {
      await page.goto("/approvals");
      await waitForPage(page, "Approvals");

      const card = page.getByRole("article").filter({ hasText: INVOICE_NUMBER });
      await expect(card).toBeVisible();
      const approve = card.getByRole("button", { name: "Approve", exact: true });
      const box = await approve.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);

      // Reject needs a comment: the confirm button stays disabled until one is typed.
      await card.getByRole("button", { name: "Reject", exact: true }).tap();
      const rejectSheet = page.getByRole("dialog", { name: new RegExp(`Reject ${INVOICE_NUMBER}`) });
      await expect(rejectSheet).toBeVisible();
      await expect(rejectSheet.getByRole("button", { name: "Reject invoice" })).toBeDisabled();
      await rejectSheet.getByRole("textbox").fill("Looks fine");
      await expect(rejectSheet.getByRole("button", { name: "Reject invoice" })).toBeEnabled();
      await rejectSheet.getByRole("button", { name: "Cancel" }).tap();
      await expect(rejectSheet).toBeHidden();

      await approve.tap();
      const sheet = page.getByRole("dialog", { name: new RegExp(`Approve ${INVOICE_NUMBER}`) });
      await expect(sheet).toBeVisible();
      await sheet.getByRole("button", { name: "Approve invoice" }).tap();

      await expect(page.locator("[data-sonner-toast]").filter({ hasText: /approved/i })).toBeVisible();
      await expect(page.getByText("You're all caught up")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
    });
  });
});
