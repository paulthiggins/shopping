import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type AddressInfo } from "node:net";
import { Store } from "../server/store";
import { makeServer } from "../server/index";
test("service worker asks before updating and retains queued work", async ({
  page,
}) => {
  const store = new Store(":memory:"),
    server = makeServer(store, { staticRoot: resolve("dist") });
  let version = 1;
  const handler = server.listeners("request")[0];
  server.removeAllListeners("request");
  server.on("request", (req, res) => {
    if (req.url === "/sw.js") {
      void readFile("dist/sw.js", "utf8").then((code) => {
        res.writeHead(200, {
          "Content-Type": "application/javascript",
          "Cache-Control": "no-cache",
        });
        res.end(code + `\n// test version ${version}\n`);
      });
    } else handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await page.goto(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    );
    await page
      .getByRole("button", { name: "Create a shopping list", exact: true })
      .click();
    await expect(
      page.getByRole("group", { name: "Choose a shop" }),
    ).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(page.getByRole("combobox")).toBeVisible();
    await page.context().route("**/api/commands", (route) => route.abort());
    await page.getByRole("combobox").fill("Queued apples");
    await page.getByRole("button", { name: "Add item", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Increase Queued apples", exact: true }),
    ).toBeVisible();
    version = 2;
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.ready).update();
    });
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Update app", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Update app", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Increase Queued apples", exact: true }),
    ).toBeVisible();
    await page.context().unroute("**/api/commands");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(
      page.getByRole("status", { name: "Sync status", exact: true }),
    ).toHaveText("All changes saved");
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Increase Queued apples", exact: true }),
    ).toBeVisible();
  } finally {
    await page.goto("about:blank");
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});
