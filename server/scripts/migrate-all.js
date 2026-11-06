const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const adminPath = path.join(__dirname, "../.env.admin");
require("dotenv").config({
  path: fs.existsSync(adminPath) ? adminPath : path.join(__dirname, "../.env"),
});
for (const file of [
  "migrate-dashboard.js",
  "migrate-workspace.js",
  "migrate-records.js",
  "migrate-messenger.js",
]) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: "inherit",
    env: process.env,
    windowsHide: true,
  });
  if (result.status !== 0) {
    process.exitCode = 1;
    break;
  }
}
