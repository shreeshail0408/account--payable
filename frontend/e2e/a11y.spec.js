/*
 * Accessibility: axe-core WCAG 2.1 A/AA rules (including color contrast) on every page in light and
 * dark, on open dialogs and drawers, plus keyboard checks for the shell.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PAGES, SAMPLE_INVOICE, storageFor, useTheme, waitForPage } from "./helpers.js";

test.use({ storageState: storageFor("audit") });

function summarize(violations) {
  return violations.map((violation) => {
    const targets = violation.nodes.slice(0, 4).map((node) => `      ${node.target.join(" ")}  ${node.failureSummary?.split("\n")[1]?.trim() || ""}`);
    return `${violation.id} (${violation.impact}, ${violation.nodes.length}): ${violation.help}\n${targets.join("\n")}`;
  });
}

async function audit(page, include) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (include) {
    builder = builder.include(include);
  }
  const { violations } = await builder.analyze();
  return summarize(violations);
}

for (const theme of ["light", "dark"]) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await useTheme(page, theme);
      await page.emulateMedia({ reducedMotion: "reduce" });
    });

    test("login page", async ({ browser }) => {
      // Contexts inherit the project's storageState; start signed out explicitly.
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, reducedMotion: "reduce" });
      const page = await context.newPage();
      await useTheme(page, theme);
      await page.goto("/login");
      await page.getByRole("heading", { name: "Sign in" }).waitFor();
      expect(await audit(page)).toEqual([]);
      await context.close();
    });

    for (const target of PAGES) {
      test(`${target.name} page`, async ({ page }) => {
        await page.goto(target.path);
        await waitForPage(page, target.heading, target);
        expect(await audit(page)).toEqual([]);
      });
    }

    test("dialogs and drawers", async ({ page }) => {
      const results = {};

      await page.goto("/vendors");
      await waitForPage(page, "Vendors");
      await page.getByRole("button", { name: "Add vendor" }).first().click();
      await page.getByRole("dialog").waitFor();
      results.vendorForm = await audit(page, "[role=dialog]");
      await page.keyboard.press("Escape");

      await page.locator("tbody").getByRole("button").first().click();
      await page.getByRole("dialog").getByRole("tab", { name: "Profile" }).waitFor();
      results.vendorDrawer = await audit(page, "[role=dialog]");
      await page.getByRole("dialog").getByRole("tab", { name: "Onboarding" }).click();
      await page.waitForLoadState("networkidle");
      results.vendorOnboarding = await audit(page, "[role=dialog]");
      await page.keyboard.press("Escape");

      await page.goto("/purchase-orders?new=1");
      await page.getByRole("dialog", { name: "Create purchase order" }).waitFor();
      results.poForm = await audit(page, "[role=dialog]");

      await page.goto("/invoices");
      await waitForPage(page, "Invoices");
      await page.getByRole("button", { name: "Capture invoices" }).first().click();
      await page.getByRole("dialog").waitFor();
      results.uploadDialog = await audit(page, "[role=dialog]");

      // OCR review workspace for a fresh capture (closed without saving).
      await page.getByRole("dialog").locator("input[type=file]").setInputFiles(SAMPLE_INVOICE);
      const review = page.getByRole("dialog", { name: "Review new invoice" });
      await expect(review.getByLabel("Invoice number")).toHaveValue(/SAMPLE/, { timeout: 45_000 });
      results.reviewWorkspace = await audit(page, "[role=dialog]");
      await review.getByRole("button", { name: "Close review" }).click();

      await page.goto("/payments");
      await waitForPage(page, "Payments");
      const firstPayment = page.locator("tbody").getByRole("button").first();
      if (await firstPayment.count()) {
        await firstPayment.click();
        await page.getByRole("dialog").waitFor();
        await page.waitForLoadState("networkidle");
        results.paymentDrawer = await audit(page, "[role=dialog]");
        await page.keyboard.press("Escape");
      }

      for (const [name, list] of Object.entries(results)) {
        expect(list, name).toEqual([]);
      }
    });
  });
}

test.describe("375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  for (const theme of ["light", "dark"]) {
    test(`approvals, invoices and payments (${theme})`, async ({ page }) => {
      await useTheme(page, theme);
      const results = {};
      for (const target of PAGES.filter((item) => ["approvals", "invoices", "payments", "dashboard"].includes(item.name))) {
        await page.goto(target.path);
        await waitForPage(page, target.heading, target);
        results[target.name] = await audit(page);
      }
      for (const [name, list] of Object.entries(results)) {
        expect(list, name).toEqual([]);
      }
    });
  }
});

test.describe("motion", () => {
  test("drawers and dialogs animate, and don't when reduced motion is requested", async ({ browser }) => {
    const durations = {};
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const context = await browser.newContext({ storageState: storageFor("audit"), reducedMotion });
      const page = await context.newPage();
      await page.goto("/vendors");
      await waitForPage(page, "Vendors");
      await page.locator("tbody").getByRole("button").first().click();
      const sheet = page.getByRole("dialog");
      await sheet.waitFor();
      durations[reducedMotion] = await sheet.evaluate((element) => parseFloat(getComputedStyle(element).animationDuration) * 1000);
      await context.close();
    }
    expect(durations["no-preference"]).toBeGreaterThanOrEqual(150);
    expect(durations.reduce).toBeLessThan(1);
  });
});

test.describe("keyboard", () => {
  test("skip link, command palette and sidebar are keyboard operable", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page, "Dashboard");

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();

    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog").filter({ has: page.getByRole("combobox") });
    await expect(palette).toBeVisible();
    await page.keyboard.type("Vendors");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/vendors/);
    await waitForPage(page, "Vendors");
  });

  test("every focusable control shows a visible focus indicator", async ({ page }) => {
    const missing = [];
    for (const path of ["/", "/vendors", "/payments", "/reports", "/approvals?view=all"]) {
      await page.goto(path);
      await page.locator("h1").waitFor();
      await page.waitForLoadState("networkidle");
      await page.locator("body").focus();
      for (let index = 0; index < 40; index += 1) {
        await page.keyboard.press("Tab");
        const result = await page.evaluate(() => {
          const element = document.activeElement;
          if (!element || element === document.body) {
            return null;
          }
          const style = window.getComputedStyle(element);
          const ring = style.boxShadow && style.boxShadow !== "none";
          const outline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
          const label = element.getAttribute("aria-label") || element.textContent.trim().slice(0, 40) || element.tagName;
          return { visible: ring || outline, label: `${element.tagName.toLowerCase()} "${label}"` };
        });
        if (result && !result.visible) {
          missing.push(`${path}: ${result.label}`);
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  test("icon-only buttons have accessible names", async ({ page }) => {
    const unnamed = [];
    for (const target of PAGES) {
      await page.goto(target.path);
      await waitForPage(page, target.heading, target);
      const found = await page.evaluate(() => [...document.querySelectorAll("button, a[href], [role=button]")]
        .filter((element) => !element.closest("[aria-hidden=true]"))
        .filter((element) => {
          const text = element.textContent.trim();
          const name = element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.getAttribute("title");
          return !text && !name;
        })
        .map((element) => element.outerHTML.slice(0, 120)));
      unnamed.push(...found.map((html) => `${target.name}: ${html}`));
    }
    expect(unnamed).toEqual([]);
  });
});
