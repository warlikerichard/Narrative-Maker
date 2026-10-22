import { test, expect } from "@playwright/test";
import sharp from "sharp";
test.skip(
  process.env.SUPABASE_E2E !== "1",
  "Requires an explicitly configured Supabase test project.",
);

test("complete narrative workflow, persistence, access isolation, and responsive layout", async ({
  page,
  browser,
}) => {
  const email = `creator-${Date.now()}@example.com`;
  const password = "a-strong-test-password";
  await page.goto("/");
  await expect(page).toHaveURL(/login/);
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Your name").fill("Alex Morgan");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your first world is waiting" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-empty.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Explore a sample world" }).click();
  await expect(
    page.getByRole("heading", { name: "Echoes of Aether", exact: true }),
  ).toBeVisible();
  const projectUrl = page.url();
  await page
    .getByRole("button", { name: "New character", exact: true })
    .click();
  await page.getByLabel("Name", { exact: false }).fill("Mira");
  await page
    .getByLabel("Character type", { exact: false })
    .selectOption({ label: "Human" });
  await page
    .getByLabel("Description")
    .fill("A navigator who charts the night sky.");
  await page.getByLabel("Upload image").setInputFiles({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 100, height: 80, channels: 3, background: "#336699" },
    })
      .png()
      .toBuffer(),
  });
  await page
    .getByRole("button", { name: "Create character", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Mira", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("A navigator who charts the night sky."),
  ).toBeVisible();
  await expect(page.getByRole("dialog").locator("img")).toHaveAttribute(
    "src",
    /^\/api\/images\//,
  );
  await page
    .getByRole("button", { name: "Edit character", exact: true })
    .click();
  await page.getByLabel("Name", { exact: false }).fill("Mira Starfall");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Actions for Human" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "used by a character",
  );
  await page.getByRole("button", { name: "Keep it" }).click();
  await page.getByRole("button", { name: "Actions for Mira Starfall" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Mira Starfall", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/project-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "All projects", exact: true }).click();
  await page
    .getByRole("button", { name: "Favorite Echoes of Aether", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Unfavorite Echoes of Aether" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Name", { exact: false }).fill("Neon Odyssey");
  await page
    .getByLabel("Description")
    .fill("A mystery among the last cities beneath a neon sky.");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Neon Odyssey" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New character", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "New character type" }),
  ).toBeVisible();
  await page.getByLabel("Name", { exact: false }).fill("Android");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create character type", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "All projects", exact: true }).click();
  await page.getByLabel("Search projects").fill("Neon");
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.locator(".list-view")).toBeVisible();
  await page.getByRole("button", { name: "Grid view" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).not.toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.locator(".sidebar")).toHaveClass(/is-open/);
  await page
    .getByRole("button", { name: "Close navigation" })
    .click({ position: { x: 350, y: 300 } });
  await page.setViewportSize({ width: 1440, height: 1000 });

  const stranger = await browser.newContext();
  const secondPage = await stranger.newPage();
  await secondPage.goto("/login");
  await secondPage.getByRole("button", { name: "Create an account" }).click();
  await secondPage.getByLabel("Your name").fill("Another Creator");
  await secondPage.getByLabel("Email address").fill(`other-${email}`);
  await secondPage.getByLabel("Password", { exact: true }).fill(password);
  await secondPage
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    secondPage.getByRole("heading", { name: "Your first world is waiting" }),
  ).toBeVisible();
  await secondPage.goto(projectUrl);
  await expect(
    secondPage.getByRole("heading", { name: "This page hasn’t been written." }),
  ).toBeVisible();
  await stranger.close();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/login/);
  await page.screenshot({
    path: "test-results/login-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "incorrect",
  );
  await expect(page.getByLabel("Email address")).toHaveValue(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await page.goto(projectUrl);
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(
    page.getByRole("heading", { name: "Your worlds, one workspace." }),
  ).toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(1);
});
