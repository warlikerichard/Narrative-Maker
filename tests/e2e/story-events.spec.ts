import { test, expect } from "@playwright/test";
import sharp from "sharp";
test.skip(
  process.env.SUPABASE_E2E !== "1",
  "Requires an explicitly configured Supabase test project.",
);

test("cloud story event creation, page editing, persistence, deletion, and isolation", async ({
  page,
  context,
}) => {
  const email = `stories-${Date.now()}@example.com`;
  const password = "story-event-test-password";
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Your name").fill("Story Creator");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByRole("button", { name: "Explore a sample world" }).click();
  await expect(
    page.getByRole("heading", { name: "Echoes of Aether", exact: true }),
  ).toBeVisible();
  const projectUrl = page.url();
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });

  await page
    .getByRole("button", { name: "0 Story events", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New story event", exact: true })
    .click();
  await page
    .getByLabel("Title", { exact: false })
    .fill("The fall of the citadel");
  await page.getByLabel("Story event image").setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 100, height: 80, channels: 3, background: "#336699" },
    })
      .png()
      .toBuffer(),
  });
  await expect(page.getByAltText("Story event cover preview")).toBeVisible();
  await page.screenshot({
    path: "test-results/story-create.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Create and edit" }).click();
  await expect(page).toHaveURL(/\/story-events\//);
  const eventUrl = page.url();
  await expect(
    page.getByRole("heading", { name: "The fall of the citadel" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  if (
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .isEnabled()
      .catch(() => false)
  ) {
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("status")).toContainText(
      "Saved to your account",
    );
  }
  await page.reload();
  await expect(page.getByAltText("Story event cover preview")).toHaveAttribute(
    "src",
    /^\/api\/images\//,
  );
  await page.getByRole("button", { name: "Remove cover" }).click();
  await page.getByRole("button", { name: "Add first section" }).click();
  const section = page.getByRole("region", { name: "Section 1", exact: true });
  await section
    .getByLabel("Section title", { exact: true })
    .fill("The warning");
  await section
    .getByLabel("Description", { exact: true })
    .fill(
      "A messenger arrives before sunrise. The city has one hour to prepare.",
    );
  await section
    .getByRole("button", { name: "Add subsection", exact: true })
    .click();
  const subsection = page.getByRole("region", {
    name: "Subsection 1.1",
    exact: true,
  });
  await subsection
    .getByLabel("Subsection title", { exact: true })
    .fill("The council meeting");
  await subsection
    .getByLabel("Description", { exact: true })
    .fill("Lyra argues for opening the old escape routes.");
  await page.getByRole("checkbox", { name: /Lyra Ashwind/ }).check();
  await page.getByRole("checkbox", { name: /Orin Vale/ }).check();
  await page
    .getByLabel("Event title", { exact: true })
    .fill("The last night of the citadel");
  if (
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .isEnabled()
      .catch(() => false)
  ) {
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("status")).toContainText(
      "Saved to your account",
    );
  }
  await page.reload();
  await expect(page.getByLabel("Event title", { exact: true })).toHaveValue(
    "The last night of the citadel",
  );
  await expect(
    page.getByPlaceholder("Explore this moment in more detail…"),
  ).toHaveValue("Lyra argues for opening the old escape routes.");
  await expect(
    page.getByRole("checkbox", { name: /Lyra Ashwind/ }),
  ).toBeChecked();
  await expect(page.getByAltText("Story event cover preview")).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/story-editor-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/story-editor-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });

  const secondTab = await context.newPage();
  await secondTab.goto(projectUrl);
  await expect(
    secondTab.getByRole("button", {
      name: "The last night of the citadel",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Event title", { exact: true }).fill("Citadel at dawn");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved to your account");
  await secondTab.reload();
  await expect(
    secondTab.getByRole("button", { name: "Citadel at dawn", exact: true }),
  ).toBeVisible();
  await secondTab.close();

  await page
    .getByRole("button", { name: "Add section", exact: true })
    .last()
    .click();
  const secondSection = page.getByRole("region", {
    name: "Section 2",
    exact: true,
  });
  await secondSection
    .getByLabel("Section title", { exact: true })
    .fill("The siege");
  await page.getByRole("button", { name: "Move section 2 up" }).click();
  await expect(
    page
      .getByRole("region", { name: "Section 1", exact: true })
      .getByLabel("Section title", { exact: true }),
  ).toHaveValue("The siege");
  await page
    .getByRole("button", { name: "Delete section 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(
    page.getByRole("region", { name: "Section 2", exact: true }),
  ).toHaveCount(0);

  // Simulate a full/blocked browser store: the UI must retain the draft and report failure.
  await page.evaluate(() => {
    Object.defineProperty(Storage.prototype, "setItem", {
      configurable: true,
      value: () => {
        throw new DOMException("Full", "QuotaExceededError");
      },
    });
  });
  await page.getByLabel("Event title", { exact: true }).fill("Unsaved title");
  await expect(page.locator(".story-save-error")).toContainText(
    "Could not save",
  );
  page.once("dialog", (dialog) => dialog.accept());
  if (
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .isEnabled()
      .catch(() => false)
  ) {
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("status")).toContainText(
      "Saved to your account",
    );
  }
  await page.reload();
  await expect(page.getByLabel("Event title", { exact: true })).toHaveValue(
    "Citadel at dawn",
  );
  await page
    .getByRole("link", { name: "Back to project", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "1 Story events", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search entries").fill("council");
  await expect(page.locator(".entity-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Actions for Citadel at dawn" })
    .click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(eventUrl);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(posts.some((url) => url.includes("/api/story-events"))).toBe(true);

  await page
    .getByRole("button", { name: "Delete subsection 1.1", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(
    page.getByPlaceholder("Explore this moment in more detail…"),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved to your account");
  await page.goto(projectUrl);
  await expect(
    page.getByRole("button", { name: "1 Story events", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Other user's story", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Other project's story", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Actions for Citadel at dawn" })
    .click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(
    page.getByRole("button", { name: "0 Story events", exact: true }),
  ).toBeVisible();
  await page.goto(eventUrl);
  await expect(
    page.getByRole("heading", { name: "This event was not found" }),
  ).toBeVisible();
  expect(posts.length).toBeGreaterThan(0);
});
