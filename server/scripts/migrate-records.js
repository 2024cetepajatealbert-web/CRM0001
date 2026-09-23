require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const db = require("../src/config/database");
async function migrate() {
  const columns = await db.query("SHOW COLUMNS FROM user");
  if (!columns.some((c) => c.Field === "auth_version"))
    await db.query("ALTER TABLE user ADD auth_version INT NOT NULL DEFAULT 0");
  console.log("Record management ready. No new tables. Existing rows preserved.");
}
migrate()
  .catch((error) => {
    console.error(error.code || error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
