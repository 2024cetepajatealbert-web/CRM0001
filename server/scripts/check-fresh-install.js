// Integration check against a uniquely named, disposable database only.
require("dotenv").config({ path: require("node:path").join(__dirname, "../.env") });
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const mysql = require("mysql2/promise");

async function run() {
  const name = `cram_setup_qa_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  assert.match(name, /^cram_setup_qa_\d+_[a-f0-9]{8}$/);
  assert.notEqual(name.toLowerCase(), String(process.env.DB_NAME).toLowerCase());
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  let owned = false;
  function execute(script, expectedStatus = 0) {
    const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, DB_NAME: name },
      encoding: "utf8",
      timeout: 180000,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    assert.equal(result.status, expectedStatus, `${script} exit status`);
  }
  try {
    const [exists] = await connection.execute(
      "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
      [name],
    );
    assert.equal(exists.length, 0, "Never reuse an existing database for this test");
    await connection.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);
    owned = true;
    execute("init-database.js");
    execute("migrate-dashboard.js");
    execute("migrate-workspace.js");
    execute("migrate-records.js");
    const [tables] = await connection.execute(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
      [name],
    );
    assert.equal(tables.length, 13);
    // Second initialization must refuse to modify a populated schema.
    execute("init-database.js", 1);
    execute("migrate-dashboard.js");
    execute("migrate-workspace.js");
    execute("migrate-records.js");
    execute("check-workspace.js");
    console.log(
      "PASS: clean database setup, all 13 tables, safe refusal on repeat setup, repeatable migrations and full CRM tests.",
    );
  } finally {
    if (owned) {
      // This exact random database was created above, never the user's configured database.
      await connection.query(`DROP DATABASE \`${name}\``);
      console.log("Removed only this test run’s temporary database.");
    }
    await connection.end();
  }
}

run().catch((error) => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
