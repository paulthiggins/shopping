import { expect, test, type Page } from "@playwright/test";
async function menuAction(page: Page, name: string | RegExp) {
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Menu", exact: true })
    .getByRole("button", { name, exact: typeof name === "string" })
    .click();
}
async function create(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a shopping list", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Choose a shop" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Sync status", exact: true }),
  ).toHaveText("All changes saved");
}
async function add(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Add an item" }).fill(name);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Increase ${name}`, exact: true }),
  ).toBeVisible();
}
async function saved(page: Page) {
  await expect(
    page.getByRole("status", { name: "Sync status", exact: true }),
  ).toHaveText("All changes saved");
}
test("shop buttons, item edits, quantity, ordering, history and no purchased controls", async ({
  page,
}) => {
  await create(page);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Dunnes|Other/ })).toHaveCount(
    0,
  );
  await add(page, "Bananas");
  await add(page, "Milk");
  await saved(page);
  await page
    .getByRole("button", { name: "Increase Bananas", exact: true })
    .click();
  await expect(
    page.getByLabel("Quantity for Bananas", { exact: true }),
  ).toHaveText("2");
  await saved(page);
  await page.getByRole("button", { name: "More actions for Milk" }).click();
  await page.getByRole("button", { name: "Move up", exact: true }).click();
  await expect(page.locator(".item-name").first()).toHaveText("Milk");
  await saved(page);
  await page.getByRole("button", { name: "More actions for Milk" }).click();
  await page.getByRole("button", { name: "Edit name", exact: true }).click();
  await page.getByLabel("Item name", { exact: true }).fill("Oat milk");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".item-name").first()).toHaveText("Oat milk");
  await saved(page);
  await page
    .getByRole("button", { name: "Delete Bananas", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Increase Bananas", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("combobox").fill("ban");
  await expect(
    page.getByRole("option").filter({ hasText: "Bananas" }),
  ).toBeVisible();
  await page.getByRole("combobox").fill("");
  await page.getByRole("button", { name: "More actions for Oat milk" }).click();
  await page
    .getByRole("button", { name: "Remove & forget", exact: true })
    .click();
  await page.getByRole("combobox").fill("oat");
  await expect(
    page.getByRole("option").filter({ hasText: "Oat milk" }),
  ).toHaveCount(0);
  await saved(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Aldi 0", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Increase Oat milk", exact: true }),
  ).toHaveCount(0);
});
test("shared clients see updates and offline edits survive reload and merge", async ({
  page,
  browser,
}) => {
  await create(page);
  await add(page, "Bread");
  await saved(page);
  const url = page.url();
  const other = await browser.newContext();
  const b = await other.newPage();
  await b.goto(url);
  await expect(
    b.getByRole("button", { name: "Increase Bread", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Increase Bread", exact: true })
    .click();
  await b.getByRole("button", { name: "Increase Bread", exact: true }).click();
  await expect(
    page.getByLabel("Quantity for Bread", { exact: true }),
  ).toHaveText("3");
  await expect(b.getByLabel("Quantity for Bread", { exact: true })).toHaveText(
    "3",
  );
  await saved(page);
  await saved(b);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Increase Bread", exact: true }),
  ).toBeVisible();
  await page.context().setOffline(true);
  await add(page, "Apples");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Increase Apples", exact: true }),
  ).toBeVisible();
  await add(b, "Carrots");
  await saved(b);
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByRole("button", { name: "Increase Carrots", exact: true }),
  ).toBeVisible();
  await expect(
    b.getByRole("button", { name: "Increase Apples", exact: true }),
  ).toBeVisible();
  await saved(page);
  await other.close();
});
test("manage shops including last-shop deletion and keyboard dialogs", async ({
  page,
}) => {
  await create(page);
  await menuAction(page, "Manage shops");
  await page.getByLabel("New shop name").fill("Market");
  await page.getByRole("button", { name: "Add shop", exact: true }).click();
  await page.getByRole("button", { name: "Market 0", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Market 0", exact: true }),
  ).toBeVisible();
  await saved(page);
  await menuAction(page, "Manage shops");
  await page.getByRole("button", { name: "Edit Market", exact: true }).click();
  await page.getByLabel("Shop name", { exact: true }).fill("Local market");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("button", { name: "Local market 0", exact: true }),
  ).toBeVisible();
  await saved(page);
  await menuAction(page, "Manage shops");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const name of ["Aldi", "Lidl", "Tesco", "Local market"]) {
    await menuAction(page, "Manage shops");
    await page
      .getByRole("button", { name: `Delete ${name}`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Delete shop", exact: true })
      .click();
    await saved(page);
  }
  await expect(
    page.getByRole("button", { name: "Add your first shop" }),
  ).toBeVisible();
});
test("legacy preview preserves custom shops and checked rows; export creates no credential", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Bring your old list along" }).click();
  const legacy = {
    version: 1,
    exportedAt: "2026-10-28T00:00:00Z",
    lists: {
      Aldi: {
        items: [{ id: "one", name: "Peppers", quantity: 3, purchased: true }],
      },
      "Corner shop": { items: [] },
    },
    itemHistory: {
      peppers: { lastUsed: 1, forgotten: false, originalName: "Peppers" },
    },
  };
  await page.getByLabel("Shopping list backup", { exact: true }).setInputFiles({
    name: "synthetic.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(
    page.getByText("2 shops · 1 items · 1 remembered items"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create list from backup" }).click();
  await expect(
    page.getByLabel("Quantity for Peppers", { exact: true }),
  ).toHaveText("3");
  await expect(
    page.getByRole("button", { name: "Corner shop 0", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await menuAction(page, "Back up");
  const path = await (await download).path();
  const { readFile } = await import("node:fs/promises");
  const data = JSON.parse(await readFile(path!, "utf8"));
  expect(data).not.toHaveProperty("token");
  expect(data.lists.Aldi.items[0].quantity).toBe(3);
});
test("offline conflict preserves unsent work and does not resurrect a removed row", async ({
  page,
  browser,
}) => {
  await create(page);
  await add(page, "Tomatoes");
  await saved(page);
  const c = await browser.newContext(),
    b = await c.newPage();
  await b.goto(page.url());
  await expect(
    b.getByRole("button", { name: "Increase Tomatoes", exact: true }),
  ).toBeVisible();
  await page.context().setOffline(true);
  await page
    .getByRole("button", { name: "Increase Tomatoes", exact: true })
    .click();
  await expect(
    page.getByLabel("Quantity for Tomatoes", { exact: true }),
  ).toHaveText("2");
  await expect(
    page.getByRole("status", { name: "Sync status", exact: true }),
  ).toHaveText("Offline · 1 pending");
  await b.getByRole("button", { name: "Delete Tomatoes", exact: true }).click();
  await expect(
    b.getByRole("button", { name: "Increase Tomatoes", exact: true }),
  ).toHaveCount(0);
  await saved(b);
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByRole("status", { name: "Sync status", exact: true }),
  ).toHaveText("Needs attention");
  await expect(
    page.getByRole("button", { name: "Increase Tomatoes", exact: true }),
  ).toHaveCount(0);
  await menuAction(page, /^Sync status/);
  await expect(
    page.getByText(
      "This item was removed. Your change has been kept for review.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Item: Tomatoes · quantity 1 · Aldi", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Recover item in Aldi", exact: true })
    .click();
  await expect(
    page.getByLabel("Quantity for Tomatoes", { exact: true }),
  ).toHaveText("2");
  await page.keyboard.press("Escape");
  await saved(page);
  await c.close();
});
test("swipe reveals edit and forget, layout stays in viewport and sharing explains access", async ({
  page,
}, info) => {
  await create(page);
  await add(page, "A long shopping item name that should wrap beautifully");
  await saved(page);
  const card = page.locator(".item-card");
  await card.dispatchEvent("pointerdown", { clientX: 100, clientY: 100 });
  await card.dispatchEvent("pointerup", { clientX: 180, clientY: 100 });
  await expect(page.locator(".revealed.edit")).toBeVisible();
  await page.locator(".revealed.edit").click();
  await expect(page.getByLabel("Item name", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await card.dispatchEvent("pointerdown", { clientX: 200, clientY: 100 });
  await card.dispatchEvent("pointerup", { clientX: 110, clientY: 100 });
  await expect(page.locator(".revealed.forget")).toBeVisible();
  // Close the revealed panel before taking a representative screen.
  await card.dispatchEvent("pointerdown", { clientX: 200, clientY: 100 });
  await card.dispatchEvent("pointerup", { clientX: 200, clientY: 100 });
  await expect(card).toHaveCSS("transform", "none");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-shopping.png`,
    fullPage: true,
  });
  await menuAction(page, "Share list");
  await expect(
    page.getByText(
      "Anyone with this link can see and edit every shop and remembered item. No sign-in needed.",
    ),
  ).toBeVisible();
});

test("dragging the visible handle changes order without changing quantities", async ({
  page,
}) => {
  await create(page);
  await add(page, "First item");
  await add(page, "Second item");
  await saved(page);
  const handle = page.getByRole("button", {
      name: "Drag First item to reorder",
    }),
    from = await handle.boundingBox(),
    target = await page.locator(".row-wrap").nth(1).boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from!.x + from!.width / 2,
    target!.y + target!.height - 8,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(page.locator(".item-name").first()).toHaveText("Second item");
  await saved(page);
  await page.reload();
  await expect(page.locator(".item-name").first()).toHaveText("Second item");
  await expect(
    page.getByLabel("Quantity for First item", { exact: true }),
  ).toHaveText("1");
});

test("installed-app root remembers its last collection and malformed links are explained", async ({
  page,
}) => {
  await page.goto("/#incomplete");
  await expect(page.getByRole("alert")).toContainText("incomplete or invalid");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a shopping list", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Choose a shop" }),
  ).toBeVisible();
  await add(page, "Remember this list");
  await saved(page);
  const url = page.url();
  await page.goto("/");
  await expect(
    page.getByRole("button", {
      name: "Increase Remember this list",
      exact: true,
    }),
  ).toBeVisible();
  expect(page.url()).toBe(url);
});

test("only the item list scrolls while shop buttons and entry stay fixed", async ({
  page,
}, info) => {
  await page.goto("/");
  const backup = {
    version: 1,
    exportedAt: "2026-10-28T00:00:00Z",
    lists: {
      Aldi: {
        items: Array.from({ length: 60 }, (_, i) => ({
          id: `row-${i}`,
          name: `Weekly item ${String(i + 1).padStart(2, "0")}`,
          quantity: 1,
          purchased: false,
        })),
      },
      Lidl: {
        items: [
          {
            id: "other",
            name: "Other shop item",
            quantity: 1,
            purchased: false,
          },
        ],
      },
      Tesco: { items: [] },
    },
    itemHistory: {
      "weekly item 01": {
        lastUsed: 1,
        forgotten: false,
        originalName: "Weekly item 01",
      },
    },
  };
  await page.getByRole("button", { name: "Bring your old list along" }).click();
  await page.getByLabel("Shopping list backup", { exact: true }).setInputFiles({
    name: "synthetic-long-list.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page
    .getByRole("button", { name: "Create list from backup", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Increase Weekly item 01", exact: true }),
  ).toBeInViewport();
  const header = page.locator(".shopping-header"),
    entry = page.getByRole("combobox", { name: "Add an item" }),
    list = page.getByRole("region", { name: "Aldi items", exact: true });
  const headerBefore = await header.boundingBox(),
    entryBefore = await entry.boundingBox(),
    bounds = await list.boundingBox();
  await expect(
    page.getByRole("button", { name: "Manage shops", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Share list", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".sidebar,footer,.page-heading,.gentle-note"),
  ).toHaveCount(0);
  await page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  );
  await page.mouse.wheel(0, 1000);
  await expect
    .poll(() => list.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(500);
  expect((await header.boundingBox())!.y).toBeCloseTo(headerBefore!.y, 1);
  expect((await entry.boundingBox())!.y).toBeCloseTo(entryBefore!.y, 1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(
    page.getByRole("button", { name: "Increase Weekly item 60", exact: true }),
  ).toBeInViewport();
  await page
    .getByRole("button", {
      name: "More actions for Weekly item 60",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit name", exact: true }),
  ).toBeInViewport();
  await page
    .getByRole("button", {
      name: "More actions for Weekly item 60",
      exact: true,
    })
    .click();
  await entry.fill("weekly");
  await expect(
    page.getByRole("option").filter({ hasText: "Weekly item 01" }),
  ).toBeInViewport();
  expect((await entry.boundingBox())!.y).toBeCloseTo(entryBefore!.y, 1);
  await entry.fill("");
  await page.getByRole("button", { name: "Lidl 1", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Increase Other shop item", exact: true }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "Aldi 60", exact: true }).click();
  await expect
    .poll(() =>
      page
        .getByRole("region", { name: "Aldi items", exact: true })
        .evaluate((el) => el.scrollTop),
    )
    .toBe(0);
  const handle = page.getByRole("button", {
      name: "Drag Weekly item 01 to reorder",
      exact: true,
    }),
    from = await handle.boundingBox(),
    end = await list.boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2, end!.y + end!.height - 4, {
    steps: 15,
  });
  await expect
    .poll(() => list.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await page.mouse.up();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await saved(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-simplified-screen.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Share list", exact: true }),
  ).toBeFocused();
  for (const name of [
    "Manage shops",
    "Remembered items",
    "Back up",
    "Open a list",
    "Import backup",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Theme", exact: true })
    .selectOption("dark");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open menu", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: `test-results/${info.project.name}-simplified-dark.png`,
    fullPage: true,
  });
});
