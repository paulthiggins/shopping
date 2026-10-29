import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { type AddressInfo } from "node:net";
import { type ServerResponse } from "node:http";
import { Store } from "../server/store";
import { makeServer } from "../server/index";

async function fixture() {
  const store = new Store(":memory:"),
    server = makeServer(store, { staticRoot: resolve("dist") }),
    streams = new Set<ServerResponse>();
  const control = { blockEvents: false, blockCommands: false };
  const handler = server.listeners("request")[0];
  server.removeAllListeners("request");
  server.on("request", (req, res) => {
    if (req.url === "/api/events") {
      if (control.blockEvents) {
        res.writeHead(503).end("Events temporarily unavailable");
        return;
      }
      streams.add(res);
      res.on("close", () => streams.delete(res));
    }
    if (req.url === "/api/commands" && control.blockCommands) {
      res
        .writeHead(503, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: "Temporary save failure" }));
      return;
    }
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    control,
    disconnect() {
      for (const stream of streams) stream.end();
    },
    async stop() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      store.close();
    },
  };
}
async function create(page: Page, base: string) {
  await page.goto(base);
  await page
    .getByRole("button", { name: "Create a shopping list", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Choose a shop" }),
  ).toBeVisible();
  await saved(page);
}
async function saved(page: Page) {
  await expect(
    page.getByRole("status", { name: "Sync status", exact: true }),
  ).toHaveText("All changes saved");
}
async function add(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Add an item" }).fill(name);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
}
function countReads(page: Page) {
  let reads = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/state")) reads++;
  });
  return () => reads;
}
async function noIdleReads(page: Page) {
  // Allow connection/reconnect reconciliation to finish before checking the idle period.
  await page.waitForTimeout(200);
  const unexpected = page
    .waitForRequest((r) => r.url().endsWith("/api/state"), { timeout: 600 })
    .then(
      () => true,
      () => false,
    );
  await page.clock.fastForward(7000);
  expect(
    await unexpected,
    "healthy idle stream must not trigger a snapshot poll",
  ).toBe(false);
}
test("healthy SSE stays idle; failed SSE alone enables polling; reconnect stops it", async ({
  page,
  browser,
}) => {
  const f = await fixture(),
    other = await browser.newContext(),
    b = await other.newPage();
  await page.clock.install();
  let connections = 0;
  page.on("response", (r) => {
    if (r.url().endsWith("/api/events") && r.ok()) connections++;
  });
  const reads = countReads(page);
  try {
    await create(page, f.base);
    await expect.poll(() => connections).toBe(1);
    await noIdleReads(page);
    await b.goto(page.url());
    await expect(b.getByRole("group", { name: "Choose a shop" })).toBeVisible();
    await saved(b);
    f.control.blockEvents = true;
    f.disconnect();
    await page.waitForTimeout(100);
    await add(b, "Fallback apples");
    await saved(b);
    const before = reads();
    await page.clock.fastForward(6000);
    await expect(
      page.getByRole("button", {
        name: "Increase Fallback apples",
        exact: true,
      }),
    ).toBeVisible();
    expect(reads()).toBeGreaterThan(before);
    f.control.blockEvents = false;
    const connected = connections;
    await page.clock.fastForward(11000);
    await expect.poll(() => connections).toBeGreaterThan(connected);
    await saved(page);
    await noIdleReads(page);
    await add(b, "Live pears");
    await saved(b);
    await expect(
      page.getByRole("button", { name: "Increase Live pears", exact: true }),
    ).toBeVisible();
  } finally {
    await page.goto("about:blank");
    await other.close();
    await f.stop();
  }
});
test("failed saves retry even with a healthy event stream and no list polling", async ({
  page,
}) => {
  const f = await fixture();
  await page.clock.install();
  try {
    await create(page, f.base);
    await noIdleReads(page);
    f.control.blockCommands = true;
    let failures = 0;
    page.on("response", (r) => {
      if (r.url().endsWith("/api/commands") && r.status() === 503) failures++;
    });
    await add(page, "Retry bananas");
    await expect.poll(() => failures).toBe(1);
    await expect(
      page.getByRole("status", { name: "Sync status", exact: true }),
    ).toHaveText("Offline · 1 pending");
    f.control.blockCommands = false;
    await page.clock.fastForward(2000);
    await saved(page);
    await expect(
      page.getByLabel("Quantity for Retry bananas", { exact: true }),
    ).toHaveText("1");
    await noIdleReads(page);
    await page.reload();
    await expect(
      page.getByLabel("Quantity for Retry bananas", { exact: true }),
    ).toHaveText("1");
  } finally {
    await page.goto("about:blank");
    await f.stop();
  }
});
test("fallback pauses while hidden and page reveal reconciles immediately", async ({
  page,
}) => {
  const f = await fixture();
  f.control.blockEvents = true;
  await page.clock.install();
  const reads = countReads(page);
  try {
    await create(page, f.base);
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const before = reads();
    await page.clock.fastForward(11000);
    await page.waitForTimeout(100);
    expect(reads()).toBe(before);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => reads()).toBeGreaterThan(before);
  } finally {
    await page.goto("about:blank");
    await f.stop();
  }
});

test("another tab sends committed pending work without focus events or polling", async ({
  page,
  context,
}) => {
  const f = await fixture(),
    b = await context.newPage();
  try {
    await create(page, f.base);
    await b.goto(page.url());
    await saved(b);
    // Only this sender fails. The other visible tab must react to the durable
    // queue change, even though the server has no new revision to announce yet.
    await b.route("**/api/commands", (route) => route.abort());
    await add(b, "Cross-tab apples");
    await expect(
      page.getByRole("button", {
        name: "Increase Cross-tab apples",
        exact: true,
      }),
    ).toBeVisible();
    await saved(page);
    const quantity = await page.evaluate(async () => {
      const response = await fetch("/api/state", {
        headers: { Authorization: `Bearer ${location.hash.slice(1)}` },
      });
      return (await response.json()).state.items[0].quantity;
    });
    expect(quantity).toBe(1);
  } finally {
    await page.goto("about:blank");
    await b.close();
    await f.stop();
  }
});
