require("dotenv").config({ path: require("node:path").join(__dirname, "../.env") });
const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");

async function initialize() {
  const name = process.env.DB_NAME;
  if (!name || !/^[a-zA-Z0-9_]{1,64}$/.test(name)) {
    throw new Error(
      "DB_NAME must contain only letters, numbers or underscores (maximum 64 characters).",
    );
  }
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  try {
    const [tables] = await connection.execute(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
      [name],
    );
    if (tables.length)
      throw new Error(
        "Database is not empty. Nothing changed. Use npm run migrate for an existing CRAM database, not setup:db.",
      );
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4`);
    await connection.changeUser({ database: name });
    const sql = fs.readFileSync(path.join(__dirname, "../sql/001_base.sql"), "utf8");
    for (const statement of sql
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean)) {
      await connection.query(statement);
    }
    console.log(
      "Created the seven empty core tables. No sample users or personal records were imported.",
    );
  } finally {
    await connection.end();
  }
}

initialize().catch((error) => {
  // MySQL errors may contain connection details; do not print the full object.
  console.error(error.code || error.message);
  process.exitCode = 1;
});
