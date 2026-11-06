// Test accounts and mocked email only. Called at the end of the isolated suite.
module.exports = async ({ req, owner, page }) => {
  const assert = require("node:assert/strict");
  const crypto = require("node:crypto");
  const db = require("../src/config/database");
  const mail = require("../src/services/mailService");
  const original = { configured: mail.configured, send: mail.send, link: mail.link };
  let delivered = [];
  const post = (path, body, status = 200) =>
    req("/api/auth/" + path, { method: "POST", body, status });
  try {
    mail.configured = () => false;
    mail.send = async (message) => {
      delivered.push(message);
    };
    mail.link = (fragment) => "https://cram.example.invalid/#" + fragment;
    const [account] = await db.query("SELECT workspace_id FROM user WHERE user_id=?", [owner.id]);
    const invitation = async () =>
      req("/api/crm/invitations", {
        method: "POST",
        token: owner.token,
        status: 201,
        body: {
          email: "qa-invite-" + crypto.randomBytes(6).toString("hex") + "@gmail.com",
          teamId: account.workspace_id,
          sendEmail: true,
        },
      });
    assert.equal((await invitation()).emailSent, false);
    assert.equal(delivered.length, 0);
    await post("forgot-password", { email: owner.email }, 503);
    mail.configured = () => true;
    assert.equal((await invitation()).emailSent, true);
    assert.equal(delivered.length, 1);
    assert.match(delivered[0].text, /#invite=/);
    delivered = [];
    const absent = await post("forgot-password", { email: "missing-recovery-fixture@gmail.com" });
    const existing = await post("forgot-password", { email: owner.email });
    assert.deepEqual(existing, absent, "Do not reveal registered emails");
    assert.equal(delivered.length, 1);
    const token = delivered[0].text.match(/reset=([a-f0-9]{64})/)[1];
    const [stored] = await db.query(
      "SELECT reset_token_hash,reset_expires_at FROM user WHERE user_id=?",
      [owner.id],
    );
    assert.equal(stored.reset_token_hash, crypto.createHash("sha256").update(token).digest("hex"));
    const password = "Qa9!" + crypto.randomBytes(12).toString("hex");
    await post("reset-password", { token, newPassword: "weak", confirmPassword: "weak" }, 400);
    await db.query(
      "UPDATE user SET reset_expires_at=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE user_id=?",
      [owner.id],
    );
    await post("reset-password", { token, newPassword: password, confirmPassword: password }, 400);
    await db.query(
      "UPDATE user SET reset_expires_at=DATE_ADD(NOW(),INTERVAL 30 MINUTE) WHERE user_id=?",
      [owner.id],
    );
    if (page) {
      await page.goto(`http://127.0.0.1:${process.env.PORT}/#reset=${token}`);
      await page.locator("#recovery-form [name=newPassword]").fill(password);
      await page.locator("#recovery-form [name=confirmPassword]").fill(password);
      const response = page.waitForResponse((r) => r.url().endsWith("/api/auth/reset-password"));
      await page.locator("#recovery-form [type=submit]").click();
      assert.equal((await response).status(), 200);
      await page
        .getByText(
          "Password updated. Please log in again. Previous sessions have been signed out.",
          { exact: true },
        )
        .waitFor();
      assert.equal(new URL(page.url()).hash, "");
      assert.equal(await page.evaluate(() => sessionStorage.getItem("cram.token")), null);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
    } else
      await post("reset-password", { token, newPassword: password, confirmPassword: password });
    await post("reset-password", { token, newPassword: password, confirmPassword: password }, 400);
    await req("/api/crm/workspace", { token: owner.token, status: 401 });
    await post("login", { email: owner.email, password });
    const [after] = await db.query(
      "SELECT reset_token_hash,reset_expires_at FROM user WHERE user_id=?",
      [owner.id],
    );
    assert.equal(after.reset_token_hash, null);
    assert.equal(after.reset_expires_at, null);
    console.log(
      "PASS: optional invitation delivery, recovery configuration, generic responses, hashed/expiring single-use reset links, strong passwords and session revocation; no real email sent.",
    );
  } finally {
    Object.assign(mail, original);
  }
};
