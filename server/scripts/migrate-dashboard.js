require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");
const db = require("../src/config/database");

async function migrate() {
  await db.query(fs.readFileSync(path.join(__dirname, "../sql/002_dashboard.sql"), "utf8"));
  const columns = await db.query("SHOW COLUMNS FROM tasks");
  if (columns.find((c) => c.Field === "completed_at").Null === "NO") {
    await db.query("ALTER TABLE tasks MODIFY completed_at DATETIME NULL");
  }
  if (columns.find((c) => c.Field === "conversation_conversation_id").Null === "NO") {
    await db.query("ALTER TABLE tasks MODIFY conversation_conversation_id INT NULL");
  }
  if (!columns.some((c) => c.Field === "title"))
    await db.query("ALTER TABLE tasks ADD title VARCHAR(160) NOT NULL DEFAULT ''");
  if (!columns.some((c) => c.Field === "notes"))
    await db.query("ALTER TABLE tasks ADD notes TEXT NULL");
  console.log("Dashboard schema ready. Existing records preserved.");
}
migrate()
  .catch((error) => {
    console.error("Migration failed:", error.code || error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
