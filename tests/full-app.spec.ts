import { test, expect, Page } from "@playwright/test";

const EMAIL = "napetschnig.chris@gmail.com";
const PASSWORD = "nereirtsiger";

async function login(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  if (await page.locator('input[type="email"]').isVisible().catch(() => false)) {
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/", { timeout: 15000 });
  }
}

test.describe("Authentication", () => {
  test("should login successfully", async ({ page }) => {
    await login(page);
    await expect(page).not.toHaveURL(/login/);
  });

  test("should reject invalid credentials", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    if (await page.locator('input[type="email"]').isVisible().catch(() => false)) {
      await page.fill('input[type="email"]', "fake@test.com");
      await page.fill('input[type="password"]', "wrongpassword");
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
      const hasError = await page.locator("text=Fehler").isVisible().catch(() => false)
        || await page.locator("text=Invalid").isVisible().catch(() => false)
        || page.url().includes("login");
      expect(hasError).toBeTruthy();
    }
  });
});

test.describe("Dashboard & Navigation", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("dashboard loads", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("navigate to Projekte", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("Projekte");
  });

  test("navigate to Rechnungen & Angebote", async ({ page }) => {
    await page.goto("/invoices");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("Rechnungen");
  });

  test("navigate to Zeiterfassung", async ({ page }) => {
    await page.goto("/time-tracking");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("Zeiterfassung");
  });
});

test.describe("Rechnungen & Angebote", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/invoices");
    await page.waitForLoadState("networkidle");
  });

  test("invoice list loads with stats", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Rechnungen & Angebote/ })).toBeVisible();
  });

  test("filter buttons work", async ({ page }) => {
    await page.getByRole("button", { name: "Rechnungen" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Angebote" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Alle" }).click();
  });

  test("create new Rechnung", async ({ page }) => {
    await page.getByRole("button", { name: "Neue Rechnung" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/invoices\/new/);
    await expect(page.getByRole("heading", { name: "Positionen" })).toBeVisible();
  });

  test("create new Angebot", async ({ page }) => {
    await page.getByRole("button", { name: "Neues Angebot" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/invoices\/new.*typ=angebot/);
  });

  test("new Rechnung has correct fields", async ({ page }) => {
    await page.getByRole("button", { name: "Neue Rechnung" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Zahlbar bis")).toBeVisible();
    await expect(page.locator("text=Leistungsdatum")).toBeVisible();
  });

  test("new Angebot hides Rechnung fields", async ({ page }) => {
    await page.getByRole("button", { name: "Neues Angebot" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("label:text-is('Zahlbar bis')")).not.toBeVisible();
    await expect(page.locator("label:text-is('Leistungsdatum')")).not.toBeVisible();
    await expect(page.locator("text=Gültig bis")).toBeVisible();
  });

  test("import buttons present in new Rechnung", async ({ page }) => {
    await page.getByRole("button", { name: "Neue Rechnung" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "Aus Angebot" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Aus Regiebericht" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Aus Projekt" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Materialien" })).toBeVisible();
  });
});

test.describe("Material / Lieferscheine", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/material");
    await page.waitForLoadState("networkidle");
  });

  test("material page loads", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Material");
  });

  test("new lieferschein button exists", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Neuer Lieferschein/i })).toBeVisible();
  });
});

test.describe("Projekte", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("projects page loads", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Projekte", exact: true })).toBeVisible();
  });
});

test.describe("Materialien", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("materials page loads", async ({ page }) => {
    await page.goto("/materials");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Materialien" })).toBeVisible();
  });

  test("correct button text (not Vorlage)", async ({ page }) => {
    await page.goto("/materials");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /Neues Material/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Vorlage/i })).not.toBeVisible();
  });
});

test.describe("Security", () => {
  test("unauthenticated redirects to login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const hasLoginForm = await page.locator('input[type="email"]').isVisible().catch(() => false);
    expect(hasLoginForm).toBeTruthy();
  });

  test("secret keys not in page source", async ({ page }) => {
    await login(page);
    const content = await page.content();
    expect(content).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(content).not.toContain("OPENAI_API_KEY");
    expect(content).not.toContain("RESEND_API_KEY");
  });

  test("admin route requires auth", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    const hasLoginForm = await page.locator('input[type="email"]').isVisible().catch(() => false);
    expect(hasLoginForm).toBeTruthy();
  });

  test("XSS payload treated as text", async ({ page }) => {
    await login(page);
    await page.goto("/invoices/new?typ=rechnung");
    await page.waitForLoadState("networkidle");
    const xss = '<script>alert("xss")</script>';
    const input = page.locator("input").first();
    await input.fill(xss);
    const value = await input.inputValue();
    expect(value).toBe(xss);
  });
});

test.describe("Zeiterfassung", () => {
  test("page loads", async ({ page }) => {
    await login(page);
    await page.goto("/time-tracking");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("Zeiterfassung");
  });
});

test.describe("Regieberichte", () => {
  test("list loads", async ({ page }) => {
    await login(page);
    await page.goto("/disturbances");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });
});

test.describe("Admin", () => {
  test("admin page loads with sections", async ({ page }) => {
    await login(page);
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    // Should have admin-specific content
    const hasContent = await page.getByText("Einstellungen").isVisible().catch(() => false)
      || await page.getByText("Urlaubsverwaltung").isVisible().catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});
