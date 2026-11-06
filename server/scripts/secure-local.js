// Explicit local hardening command. Keeps database name and encryption key unchanged.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const { spawnSync } = require("node:child_process");
const envPath = path.join(__dirname, "../.env");
const adminPath = path.join(__dirname, "../.env.admin");
async function run() {
  let text = fs.readFileSync(envPath, "utf8");
  const env = dotenv.parse(text);
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(env.DB_NAME)) throw Error("Invalid database name.");
  const backupDir = path.resolve(__dirname, "../../private-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(backupDir, `before-messenger-${stamp}.sql`);
  const config = path.join(backupDir, `mysql-${crypto.randomBytes(8).toString("hex")}.cnf`);
  const quote = (v) =>
    '"' +
    String(v || "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n") +
    '"';
  const admin = fs.existsSync(adminPath) ? dotenv.parse(fs.readFileSync(adminPath)) : env;
  fs.writeFileSync(
    config,
    `[client]\nhost=${quote(admin.DB_HOST)}\nport=${Number(admin.DB_PORT || 3306)}\nuser=${quote(admin.DB_USER)}\npassword=${quote(admin.DB_PASSWORD)}\n`,
    { mode: 0o600, flag: "wx" },
  );
  try {
    const dump = spawnSync(
      process.env.MYSQLDUMP_PATH ||
        "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe",
      [
        `--defaults-extra-file=${config}`,
        "--single-transaction",
        "--no-tablespaces",
        "--set-gtid-purged=OFF",
        `--result-file=${backup}`,
        env.DB_NAME,
      ],
      { encoding: "utf8", windowsHide: true, timeout: 120000 },
    );
    if (dump.status !== 0)
      throw Error(
        "Backup failed. No credentials changed. Check your local MySQL dump installation.",
      );
  } finally {
    fs.unlinkSync(config);
  }
  const set = (key, value) => {
    const entry = `${key}=${JSON.stringify(value)}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    text = re.test(text) ? text.replace(re, () => entry) : text + "\n" + entry + "\n";
  };
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || env.JWT_SECRET.includes("replace_with")) {
    set("JWT_SECRET", crypto.randomBytes(48).toString("hex"));
    console.log(
      "Replaced the example JWT secret. Existing sessions must sign in again after restart.",
    );
  }
  if (process.argv.includes("--database-user") && env.DB_USER === "root") {
    if (fs.existsSync(adminPath))
      throw Error("Private admin configuration already exists; inspect it before switching users.");
    const conn = await mysql.createConnection({
      host: env.DB_HOST,
      port: Number(env.DB_PORT || 3306),
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    });
    const user = "cram_app_" + crypto.randomBytes(4).toString("hex");
    const password = crypto.randomBytes(36).toString("base64url");
    try {
      await conn.query("CREATE USER ?@'localhost' IDENTIFIED BY ?", [user, password]);
      await conn.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON \`${env.DB_NAME}\`.* TO ?@'localhost'`,
        [user],
      );
      const verify = await mysql.createConnection({
        host: env.DB_HOST,
        port: Number(env.DB_PORT || 3306),
        database: env.DB_NAME,
        user,
        password,
      });
      await verify.execute("SELECT COUNT(*) AS count FROM user");
      await verify.end();
      fs.writeFileSync(adminPath, text, { flag: "wx", mode: 0o600 });
      set("DB_USER", user);
      set("DB_PASSWORD", password);
      console.log(
        "Created restricted local CRAM database account. Root retained privately for migrations; no existing account changed.",
      );
    } finally {
      await conn.end();
    }
  }
  fs.writeFileSync(envPath, text, { mode: 0o600 });
  console.log("Private backup saved: " + backup);
  console.log("Database name and Page encryption key preserved. Restart CRAM to apply settings.");
}
run().catch((e) => {
  console.error(e.code || e.message);
  process.exitCode = 1;
});
