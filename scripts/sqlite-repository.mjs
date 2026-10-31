import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const mainDocumentId = "app-db";
const rollbackProbeId = "rollback-probe";
const migrations = [
  {
    id: "001_app_document_store",
    sql: `
      CREATE TABLE IF NOT EXISTS app_documents (
        id TEXT PRIMARY KEY,
        body TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS repository_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `
  }
];

export class SqliteRepository {
  constructor({ dbPath, backupPath, relativeDbPath = dbPath, relativeBackupPath = backupPath }) {
    this.dbPath = dbPath;
    this.backupPath = backupPath;
    this.relativeDbPath = relativeDbPath;
    this.relativeBackupPath = relativeBackupPath;
    mkdirSync(dirname(this.dbPath), { recursive: true });
    mkdirSync(dirname(this.backupPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.applyMigrations();
  }

  defaultMetadata(overrides = {}) {
    return {
      engine: "sqlite-repository-v1",
      adapter: "node:sqlite",
      dbPath: this.relativeDbPath,
      atomicWrites: true,
      transactionalWrites: true,
      backupPath: this.relativeBackupPath,
      migrationsApplied: this.appliedMigrations(),
      rollbackSupported: true,
      externalReady: true,
      lastReadAt: null,
      lastWriteAt: null,
      lastBackupAt: null,
      writeCount: 0,
      lastReason: null,
      lastRecoveryReason: null,
      status: "ok",
      ...overrides
    };
  }

  applyMigrations() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    for (const migration of migrations) {
      const row = this.db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(migration.id);
      if (row) continue;
      this.db.exec("BEGIN IMMEDIATE;");
      try {
        this.db.exec(migration.sql);
        this.db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(migration.id, new Date().toISOString());
        this.db.exec("COMMIT;");
      } catch (error) {
        this.db.exec("ROLLBACK;");
        throw error;
      }
    }
  }

  appliedMigrations() {
    try {
      return this.db
        .prepare("SELECT id FROM schema_migrations ORDER BY id")
        .all()
        .map((row) => row.id);
    } catch {
      return [];
    }
  }

  load(createSeedDb) {
    this.applyMigrations();
    const readAt = new Date().toISOString();
    const row = this.db.prepare("SELECT body FROM app_documents WHERE id = ?").get(mainDocumentId);
    if (!row) {
      const seeded = createSeedDb();
      this.save(seeded, { reason: "seed-missing-sqlite-db" });
      return { db: seeded, recovered: false };
    }

    try {
      const db = JSON.parse(row.body);
      db.dbMeta ||= {};
      db.dbMeta.repository = {
        ...this.defaultMetadata(db.dbMeta.repository || {}),
        lastReadAt: readAt
      };
      return { db, recovered: false };
    } catch (error) {
      const seeded = createSeedDb();
      seeded.dbMeta ||= {};
      seeded.dbMeta.repository = this.defaultMetadata({
        lastReadAt: readAt,
        lastRecoveryReason: "malformed-sqlite-document",
        status: "recovered"
      });
      return { db: seeded, recovered: true, error };
    }
  }

  save(db, { reason = "api-save" } = {}) {
    this.applyMigrations();
    const now = new Date().toISOString();
    const previous = db.dbMeta?.repository || {};
    db.dbMeta ||= {};
    db.dbMeta.repository = {
      ...this.defaultMetadata(previous),
      migrationsApplied: this.appliedMigrations(),
      lastWriteAt: now,
      lastReason: reason,
      writeCount: Number(previous.writeCount || 0) + 1,
      status: previous.status === "recovered" ? "recovered" : "ok"
    };

    this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.db.prepare(`
        INSERT INTO app_documents (id, body, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at
      `).run(mainDocumentId, JSON.stringify(db), now);
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }

    this.writeBackup(now);
    db.dbMeta.repository.lastBackupAt = now;
    return db;
  }

  transaction(db, mutator, { reason = "transaction" } = {}) {
    const updated = mutator(db) || db;
    return this.save(updated, { reason });
  }

  rollbackProbe() {
    this.applyMigrations();
    const marker = `rollback-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.db.prepare("INSERT OR REPLACE INTO app_documents (id, body, updated_at) VALUES (?, ?, ?)").run(
        rollbackProbeId,
        JSON.stringify({ marker }),
        new Date().toISOString()
      );
      this.db.exec("ROLLBACK;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
    const row = this.db.prepare("SELECT body FROM app_documents WHERE id = ?").get(rollbackProbeId);
    return {
      supported: true,
      rolledBack: !row,
      markerAbsent: !row,
      marker,
      checkedAt: new Date().toISOString()
    };
  }

  writeBackup(now = new Date().toISOString()) {
    if (!existsSync(this.dbPath)) return false;
    copyFileSync(this.dbPath, this.backupPath);
    this.db.prepare(`
      INSERT INTO repository_meta (key, value)
      VALUES ('last_backup_at', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(now);
    return true;
  }

  status(db) {
    const repository = {
      ...this.defaultMetadata(db.dbMeta?.repository || {}),
      dbPath: this.relativeDbPath,
      backupPath: this.relativeBackupPath,
      migrationsApplied: this.appliedMigrations()
    };
    const backup = { path: this.relativeBackupPath, exists: false, sizeBytes: 0 };
    if (existsSync(this.backupPath)) {
      const stats = statSync(this.backupPath);
      backup.exists = true;
      backup.sizeBytes = stats.size;
    }
    return { repository, backup };
  }
}
