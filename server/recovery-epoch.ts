// Run against a restored database BEFORE serving it to clients. Never run as a routine update.
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
if (process.argv[2] !== "--confirm-restored-database")
  throw Error(
    "Use --confirm-restored-database only after restoring a backup with the app stopped.",
  );
const db = new DatabaseSync(process.env.DB_PATH ?? "data/shopping.sqlite");
db.exec("BEGIN IMMEDIATE");
try {
  for (const row of db.prepare("SELECT id,document FROM collections").all()) {
    const state = JSON.parse(String(row.document));
    state.epoch = randomUUID();
    db.prepare("UPDATE collections SET document=? WHERE id=?").run(
      JSON.stringify(state),
      String(row.id),
    );
  }
  db.exec("DELETE FROM receipts; COMMIT");
  console.log("Recovery epochs renewed. Old queued edits will require review.");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
} finally {
  db.close();
}
