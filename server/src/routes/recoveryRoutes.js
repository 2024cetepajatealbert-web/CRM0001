const router = require("express").Router();
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const db = require("../config/database");
const mail = require("../services/mailService");
const wrap = require("../utils/asyncHandler");
const { requireEmail, requireNewPassword } = require("../utils/validation");
const access = require("../services/workspaceAccess");
router.use(
  rateLimit({
    windowMs: 15 * 60000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many recovery attempts. Please try again later." },
  }),
);
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
router.post(
  "/forgot-password",
  wrap(async (req, res) => {
    const email = requireEmail(req.body.email);
    if (!mail.configured())
      return res.status(503).json({
        message:
          "Password recovery email is not configured yet. Ask your CRAM administrator for help.",
      });
    const [user] = await db.query("SELECT user_id FROM user WHERE email=?", [email]);
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      await db.query(
        "UPDATE user SET reset_token_hash=?,reset_expires_at=DATE_ADD(NOW(),INTERVAL 30 MINUTE) WHERE user_id=?",
        [hash(token), user.user_id],
      );
      try {
        await mail.send({
          to: email,
          subject: "Reset your CRAM password",
          text: `Use this private link within 30 minutes to reset your CRAM password:\n${mail.link("reset=" + token)}\n\nIf you did not request this, ignore this email.`,
        });
      } catch {
        await db.query(
          "UPDATE user SET reset_token_hash=NULL,reset_expires_at=NULL WHERE user_id=? AND reset_token_hash=?",
          [user.user_id, hash(token)],
        );
        console.error("Password recovery email delivery failed; no credentials logged.");
      }
    }
    res.json({
      message:
        "If an account matches, a reset link will be emailed. If it does not arrive, contact your administrator or try again later.",
    });
  }),
);
router.post(
  "/reset-password",
  wrap(async (req, res) => {
    const token = String(req.body.token || "");
    if (!/^[a-f0-9]{64}$/.test(token)) access.fail("This reset link is invalid or expired.");
    const password = requireNewPassword(req.body.newPassword);
    if (password !== req.body.confirmPassword) access.fail("Your passwords do not match.");
    const passwordHash = await bcrypt.hash(password, 12);
    await db.transaction(async (conn) => {
      const [users] = await conn.execute(
        "SELECT user_id FROM user WHERE reset_token_hash=? AND reset_expires_at>NOW() FOR UPDATE",
        [hash(token)],
      );
      if (!users.length) access.fail("This reset link is invalid or expired.");
      await conn.execute(
        "UPDATE user SET password_hash=?,auth_version=auth_version+1,reset_token_hash=NULL,reset_expires_at=NULL WHERE user_id=?",
        [passwordHash, users[0].user_id],
      );
    });
    res.json({
      message: "Password updated. Please log in again. Previous sessions have been signed out.",
    });
  }),
);
module.exports = router;
