export const DATABASE_CERTIFICATION_STATUS = "readiness-only";

export function databaseCertificationReadiness(dbStatus = {}, evidence = {}) {
  const repository = dbStatus.repository || {};
  const backup = dbStatus.backup || {};
  const currentEngine = repository.engine || dbStatus.engine || "unknown";
  const sqliteEvidence = evidence.sqlite || {};
  const reportEvidence = evidence.report || {};
  const secretEvidence = evidence.secretSafety || {};
  const localControls = [
    control("repository-boundary", ["json-repository-v1", "sqlite-repository-v1"].includes(currentEngine), `engine=${currentEngine}`),
    control("atomic-write-or-transactional-boundary", repository.atomicWrites === true || repository.transactionalWrites === true, `atomic=${Boolean(repository.atomicWrites)}, transactional=${Boolean(repository.transactionalWrites)}`),
    control("sql-adapter-available", sqliteEvidence.adapter === "node:sqlite" || currentEngine === "sqlite-repository-v1", `sqliteAdapter=${sqliteEvidence.adapter || repository.adapter || "unknown"}`),
    control("migration-evidence", (repository.migrationsApplied || []).includes("001_app_document_store") || (sqliteEvidence.migrationsApplied || []).includes("001_app_document_store"), `migrations=${[...(repository.migrationsApplied || []), ...(sqliteEvidence.migrationsApplied || [])].join(",") || "none"}`),
    control("transaction-evidence", repository.transactionalWrites === true || sqliteEvidence.transactionalWrites === true || evidence.transactionProbe === true, `transactional=${Boolean(repository.transactionalWrites || sqliteEvidence.transactionalWrites || evidence.transactionProbe)}`),
    control("rollback-evidence", repository.rollbackSupported === true || sqliteEvidence.rollbackSupported === true || evidence.rollbackProbe === true, `rollback=${Boolean(repository.rollbackSupported || sqliteEvidence.rollbackSupported || evidence.rollbackProbe)}`),
    control("backup-evidence", backup.exists === true || sqliteEvidence.backupExists === true || reportEvidence.repositoryBackupExists === true, `backup=${Boolean(backup.exists || sqliteEvidence.backupExists || reportEvidence.repositoryBackupExists)}`),
    control("restart-persistence-evidence", sqliteEvidence.restartPersistence === true, `restartPersistence=${Boolean(sqliteEvidence.restartPersistence)}`),
    control("report-export-fields", reportEvidence.repositoryEngine === currentEngine || Boolean(reportEvidence.repositoryAdapter), `reportEngine=${reportEvidence.repositoryEngine || "unknown"}`),
    control("secret-non-exposure", secretEvidence.databaseUrlPresent !== true && secretEvidence.keyShapedSecretMatches === 0, `databaseUrlPresent=${Boolean(secretEvidence.databaseUrlPresent)}, keyShapedSecretMatches=${Number(secretEvidence.keyShapedSecretMatches || 0)}`)
  ];
  const locallyReady = localControls.every((item) => item.status === "proved-local");
  return {
    certified: false,
    status: DATABASE_CERTIFICATION_STATUS,
    currentEngine,
    locallyReady,
    evidenceCounts: {
      localControlCount: localControls.length,
      provedLocalControlCount: localControls.filter((item) => item.status === "proved-local").length,
      migrationsApplied: [...new Set([...(repository.migrationsApplied || []), ...(sqliteEvidence.migrationsApplied || [])])].length,
      writeCount: Number(repository.writeCount || 0),
      backupExists: Boolean(backup.exists || sqliteEvidence.backupExists || reportEvidence.repositoryBackupExists)
    },
    localControls,
    missingCertificationControls: [
      "managed-postgres-or-supabase-provisioned",
      "secret-manager-backed-database-url",
      "tls-ssl-enforced-connection",
      "connection-pool-and-timeout-limits",
      "managed-database-migration-rollback-drill",
      "managed-database-backup-restore-drill",
      "pitr-retention-and-restore-policy",
      "row-level-access-policy-review",
      "load-and-concurrency-test",
      "monitoring-alerting-and-slow-query-audit",
      "incident-rollback-runbook"
    ],
    nextCertificationStep: "Run an approved T3 managed database certification phase with a managed database, secret manager, TLS, migration rollback, backup/restore, PITR, access policy, load test, monitoring, and rollback runbook evidence.",
    notes: [
      "This readiness bundle is local evidence only.",
      "It intentionally does not certify a managed external database.",
      "No database URL, password, service-role key, or cloud connection is required by this readiness check."
    ]
  };
}

function control(id, passed, evidence) {
  return {
    id,
    status: passed ? "proved-local" : "missing-local-evidence",
    evidence
  };
}
