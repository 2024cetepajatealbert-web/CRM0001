const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const target = path.join(__dirname, "../.env");
if (fs.existsSync(target)) {
  console.log("Existing .env kept unchanged. Edit it locally if your MySQL settings changed.");
} else {
  const template = fs.readFileSync(path.join(__dirname, "../.env.example"), "utf8");
  const content = template
    .replace("replace_with_a_long_random_secret", crypto.randomBytes(32).toString("hex"))
    .replace("replace_with_64_hex_characters", crypto.randomBytes(32).toString("hex"));
  fs.writeFileSync(target, content, { flag: "wx", mode: 0o600 });
  console.log(
    "Created private .env with random signing/encryption keys. Now set DB_USER and DB_PASSWORD for this computer.",
  );
}
