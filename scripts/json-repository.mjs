import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class JsonRepository {
  constructor({ dbPath, backupPath, relativeBackupPath = backupPath }) {
    this.dbPath = dbPath;
    this.backupPath = backupPath;
    this.relativeBackupPath = relativeBackupPath;
  }

  defaultMetadata(overrides = {}) {
    return {
      engine: "json-repository-v1",
      adapter: "json-file",
      atomicWrites: true,
      transactionalWrites: false,
      backupPath: this.relativeBackupPath,
      migrationsApplied: [],
      rollbackSupported: false,
      externalReady: false,
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

  load(createSeedDb) {
    const readAt = new Date().toISOString();
    if (!existsSync(this.dbPath)) {
      const seeded = createSeedDb();
      this.save(seeded, { reason: "seed-missing-db" });
      return { db: seeded, recovered: false };
    }

    try {
      const db = JSON.parse(readFileSync(this.dbPath, "utf8"));
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
        lastRecoveryReason: "malformed-json",
        status: "recovered"
      });
      return { db: seeded, recovered: true, error };
    }
  }

  save(db, { reason = "api-save" } = {}) {
    const now = new Date().toISOString();
    const previous = db.dbMeta?.repository || {};
    db.dbMeta ||= {};
    db.dbMeta.repository = {
      ...this.defaultMetadata(previous),
      lastWriteAt: now,
      lastReason: reason,
      writeCount: Number(previous.writeCount || 0) + 1,
      status: previous.status === "recovered" ? "recovered" : "ok"
    };

    mkdirSync(dirname(this.dbPath), { recursive: true });
    let backedUp = false;
    if (existsSync(this.dbPath)) {
      try {
        JSON.parse(readFileSync(this.dbPath, "utf8"));
        mkdirSync(dirname(this.backupPath), { recursive: true });
        copyFileSync(this.dbPath, this.backupPath);
        backedUp = true;
      } catch {
        backedUp = false;
      }
    }

    if (backedUp) {
      db.dbMeta.repository.lastBackupAt = now;
    }

    const tempPath = `${this.dbPath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tempPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
    renameSync(tempPath, this.dbPath);
    return db;
  }

  transaction(db, mutator, { reason = "transaction" } = {}) {
    const updated = mutator(db) || db;
    return this.save(updated, { reason });
  }

  rollbackProbe() {
    return {
      supported: false,
      rolledBack: false,
      markerAbsent: true,
      checkedAt: new Date().toISOString()
    };
  }

  status(db) {
    const repository = {
      ...this.defaultMetadata(db.dbMeta?.repository || {}),
      backupPath: this.relativeBackupPath
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
