// Additive, repeatable upgrade. Never imports the leader's SQL or changes credentials.
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const db = require("../src/config/database");
async function add(table, field, definition) {
  const columns = await db.query(`SHOW COLUMNS FROM \`${table}\``);
  if (!columns.some((c) => c.Field === field))
    await db.query(`ALTER TABLE \`${table}\` ADD \`${field}\` ${definition}`);
}
async function migrate() {
  await add("message", "attachments", "JSON NULL");
  await add("conversation", "history_cursor", "TEXT NULL");
  await add("conversation", "history_loaded", "TINYINT NOT NULL DEFAULT 0");
  await add("platform_connections", "last_sync_at", "DATETIME NULL");
  await add("platform_connections", "sync_cursor", "TEXT NULL");
  await add("platform_connections", "sync_started_at", "DATETIME NULL");
  await add("platform_connections", "sync_error", "VARCHAR(255) NULL");
  await add("platform_connections", "sync_enabled", "TINYINT NOT NULL DEFAULT 0");
  await add("platform_connections", "webhook_verified_at", "DATETIME NULL");
  console.log("Messenger sync and attachments ready. Existing records preserved; no new tables.");
}
migrate()
  .catch((e) => {
    console.error(e.code || e.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
