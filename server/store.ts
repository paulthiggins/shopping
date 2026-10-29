import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  apply,
  blank,
  importData,
  identifier,
  Conflict,
  type State,
  type Command,
  type Result,
} from "../shared/model.ts";
import { generateToken, validToken } from "../shared/tokens.ts";
export class TokenTaken extends Conflict {}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      INSERT OR IGNORE INTO meta VALUES ('schema','1');
      CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (collection_id TEXT NOT NULL, op_id TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(collection_id,op_id),FOREIGN KEY(collection_id) REFERENCES collections(id));
      CREATE TABLE IF NOT EXISTS creations (request_hash TEXT PRIMARY KEY, payload_hash TEXT NOT NULL);`);
    if (
      this.db.prepare("SELECT value FROM meta WHERE key='schema'").get()
        ?.value !== "1"
    )
      throw Error("Unsupported database version.");
  }
  find(token: string): { id: string; state: State } | null {
    if (!validToken(token)) return null;
    const row = this.db
      .prepare("SELECT id,document FROM collections WHERE token_hash=?")
      .get(digest(token));
    return row
      ? { id: String(row.id), state: JSON.parse(String(row.document)) }
      : null;
  }
  create(token: string, requestId: string, backup?: unknown): State {
    if (!validToken(token)) throw new Conflict("Invalid list credential.");
    identifier(requestId);
    const requestHash = digest(requestId),
      payloadHash = digest(JSON.stringify({ token, backup: backup ?? null }));
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const old = this.db
        .prepare("SELECT payload_hash FROM creations WHERE request_hash=?")
        .get(requestHash);
      if (old) {
        if (old.payload_hash !== payloadHash)
          throw new Conflict(
            "Creation identifier reused for a different list.",
          );
        const existing = this.find(token);
        if (!existing) throw Error("Missing collection.");
        this.db.exec("COMMIT");
        return existing.state;
      }
      if (this.find(token))
        throw new TokenTaken("List code already in use. Please try another.");
      const epoch = randomUUID();
      const state =
        backup === undefined
          ? blank(epoch, [randomUUID(), randomUUID(), randomUUID()])
          : importData(backup, epoch, randomUUID);
      this.db
        .prepare("INSERT INTO collections VALUES (?,?,?)")
        .run(randomUUID(), digest(token), JSON.stringify(state));
      this.db
        .prepare("INSERT INTO creations VALUES (?,?)")
        .run(requestHash, payloadHash);
      this.db.exec("COMMIT");
      return state;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  execute(
    token: string,
    command: Command,
  ): { state: State; result: Result; changed: boolean } {
    identifier(command.id);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.find(token);
      if (!current) throw new Conflict("List not found.");
      const fingerprint = digest(JSON.stringify(command)),
        receipt = this.db
          .prepare(
            "SELECT fingerprint,result FROM receipts WHERE collection_id=? AND op_id=?",
          )
          .get(current.id, command.id);
      if (receipt) {
        if (receipt.fingerprint !== fingerprint)
          throw new Conflict(
            "Operation identifier reused with different contents.",
          );
        this.db.exec("COMMIT");
        return {
          state: current.state,
          result: JSON.parse(String(receipt.result)),
          changed: false,
        };
      }
      let state = current.state,
        result: Result;
      try {
        if (command.epoch !== state.epoch)
          throw new Conflict(
            "Server history changed. Export your unsent work and review it before retrying.",
          );
        if (!command.action || typeof command.action !== "object")
          throw new Conflict("Invalid change.");
        const next = apply(state, command.action);
        state = next.state;
        result = {
          ok: true,
          revision: state.revision,
          canonicalId: next.canonicalId,
        };
        this.db
          .prepare("UPDATE collections SET document=? WHERE id=?")
          .run(JSON.stringify(state), current.id);
      } catch (e) {
        if (!(e instanceof Conflict)) throw e;
        result = { ok: false, revision: state.revision, message: e.message };
      }
      this.db
        .prepare("INSERT INTO receipts VALUES (?,?,?,?)")
        .run(current.id, command.id, fingerprint, JSON.stringify(result));
      this.db.exec("COMMIT");
      return { state, result, changed: result.ok };
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
export const newToken = generateToken;
