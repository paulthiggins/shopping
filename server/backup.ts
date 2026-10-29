import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
const destination = process.argv[2];
if (!destination || !destination.endsWith(".sqlite"))
  throw Error(
    "Supply an absolute .sqlite destination that does not already exist.",
  );
const path = resolve(destination);
mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(process.env.DB_PATH ?? "data/shopping.sqlite");
try {
  db.prepare("VACUUM main INTO ?").run(path);
  chmodSync(path, 0o600);
  console.log("Consistent database backup created.");
} finally {
  db.close();
}
