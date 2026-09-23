const router = require("express").Router();
const crypto = require("crypto");
const db = require("../config/database");
const auth = require("../middleware/authenticate");
const wrap = require("../utils/asyncHandler");
const access = require("../services/workspaceAccess");
const { requireString, requireEmail } = require("../utils/validation");
router.use(auth);
router.post(
  "/teams",
  access.requireManager,
  wrap(async (req, res) => {
    const name = requireString(req.body.name, "team name", { max: 50 });
    const members = Array.isArray(req.body.members)
      ? [...new Set(req.body.members.map(Number))]
      : [];
    if (members.some((id) => !Number.isSafeInteger(id) || id < 1))
      access.fail("Invalid member ID.");
    const team = await db.transaction(async (c) => {
      for (const id of members) {
        const [rows] = await c.execute(
          "SELECT user_id FROM workspace_members WHERE workspace_id=? AND user_id=?",
          [req.user.workspace_id, id],
        );
        if (!rows.length) access.fail("Select members from your workspace.");
      }
      const [result] = await c.execute(
        "INSERT INTO teams (name,created_at,teams_teams_id,workspace_id) VALUES (?,NOW(),?,?)",
        [name, req.user.workspace_id, req.user.workspace_id],
      );
      for (const id of members)
        await c.execute("INSERT INTO team_members (team_id,user_id) VALUES (?,?)", [
          result.insertId,
          id,
        ]);
      await access.activity(req.user, null, `Created team: ${name}`, c);
      return result.insertId;
    });
    res.status(201).json({ id: team });
  }),
);
router.put(
  "/teams/:id/members",
  access.requireManager,
  wrap(async (req, res) => {
    const teamId = Number(req.params.id),
      userId = Number(req.body.userId);
    if (
      !Number.isSafeInteger(teamId) ||
      !Number.isSafeInteger(userId) ||
      typeof req.body.add !== "boolean"
    )
      access.fail("Invalid team membership.");
    const teams = await db.query(
      "SELECT teams_id FROM teams WHERE teams_id=? AND workspace_id=? AND teams_id<>workspace_id",
      [teamId, req.user.workspace_id],
    );
    const users = await db.query(
      "SELECT user_id FROM workspace_members WHERE workspace_id=? AND user_id=?",
      [req.user.workspace_id, userId],
    );
    if (!teams.length || !users.length) access.fail("Team or member not found.", 404);
    if (req.body.add)
      await db.query("INSERT IGNORE INTO team_members (team_id,user_id) VALUES (?,?)", [
        teamId,
        userId,
      ]);
    else await db.query("DELETE FROM team_members WHERE team_id=? AND user_id=?", [teamId, userId]);
    await access.activity(
      req.user,
      null,
      req.body.add ? "Added a member to a subteam" : "Removed a member from a subteam",
    );
    res.json({ ok: true });
  }),
);
router.post(
  "/invitations",
  access.requireManager,
  wrap(async (req, res) => {
    const email = requireEmail(req.body.email);
    const teamId = Number(req.body.teamId) || req.user.workspace_id;
    const teams = await db.query("SELECT teams_id FROM teams WHERE teams_id=? AND workspace_id=?", [
      teamId,
      req.user.workspace_id,
    ]);
    if (!teams.length) access.fail("Team not found.", 404);
    const existing = await db.query("SELECT user_id FROM user WHERE email=?", [email]);
    if (existing.length)
      access.fail(
        "This email already has an account. Use a new agent email for an invitation.",
        409,
      );
    const token = crypto.randomBytes(32).toString("hex");
    await db.query(
      "INSERT INTO team_invitations (workspace_id,team_id,email,token_hash,invited_by,expires_at) VALUES (?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 7 DAY))",
      [
        req.user.workspace_id,
        teamId,
        email,
        crypto.createHash("sha256").update(token).digest("hex"),
        req.user.user_id,
      ],
    );
    await access.activity(req.user, null, `Created invitation for ${email}`);
    res.status(201).json({
      token,
      email,
      message: "Share this invitation privately. It expires in 7 days; no email has been sent.",
    });
  }),
);
router.put(
  "/clients/:id/assignment",
  access.requireManager,
  wrap(async (req, res) => {
    const client = await access.client(req.user, Number(req.params.id));
    const userId = Number(req.body.userId);
    if (!Number.isSafeInteger(userId) || userId < 1) access.fail("Invalid agent ID.");
    const members = await db.query(
      "SELECT user_id FROM workspace_members WHERE workspace_id=? AND user_id=?",
      [req.user.workspace_id, userId],
    );
    if (!members.length) access.fail("Select an agent in this workspace.");
    await db.transaction(async (c) => {
      await c.execute("UPDATE client SET user_user_id=? WHERE client_id=?", [
        userId,
        client.client_id,
      ]);
      await c.execute("UPDATE tasks SET user_user_id=? WHERE client_client_id=? AND status<>?", [
        userId,
        client.client_id,
        "Completed",
      ]);
      await c.execute("UPDATE conversation SET user_user_id=? WHERE client_client_id=?", [
        userId,
        client.client_id,
      ]);
      await access.activity(req.user, client.client_id, `Assigned client to agent #${userId}`, c);
    });
    res.json({ ok: true });
  }),
);
router.post(
  "/clients/:id/contacts",
  wrap(async (req, res) => {
    const client = await access.client(req.user, Number(req.params.id));
    const type = requireString(req.body.type, "contact type", { max: 20 });
    if (!["Messenger", "TikTok", "WhatsApp", "SMS", "Email", "Phone"].includes(type))
      access.fail("Unsupported contact type.");
    const value =
      type === "Email"
        ? requireEmail(req.body.value)
        : requireString(req.body.value, "contact value", { max: type === "Phone" ? 30 : 255 });
    await db.transaction(async (conn) => {
      await conn.execute(
        "INSERT IGNORE INTO contact_point (client_id,contact_type,contact_info) VALUES (?,?,?)",
        [client.client_id, type, value],
      );
      if (type === "Email" || type === "Phone") {
        const field = type === "Email" ? "email" : "phone";
        await conn.execute(
          `UPDATE client_crm_details SET ${field}=? WHERE client_id=? AND (${field} IS NULL OR ${field}='')`,
          [value, client.client_id],
        );
      }
    });
    await access.activity(req.user, client.client_id, `Added ${type} contact`);
    res.status(201).json({ ok: true });
  }),
);
router.delete(
  "/clients/:id/contacts/:contactId",
  wrap(async (req, res) => {
    const client = await access.client(req.user, Number(req.params.id));
    const contactId = Number(req.params.contactId);
    if (!Number.isSafeInteger(contactId) || contactId < 1) access.fail("Invalid contact ID.");
    await db.transaction(async (conn) => {
      const [points] = await conn.execute(
        "SELECT contact_type,contact_info FROM contact_point WHERE client_id=? AND contact_point_id=? FOR UPDATE",
        [client.client_id, contactId],
      );
      if (!points.length) access.fail("Contact point not found.", 404);
      await conn.execute("DELETE FROM contact_point WHERE client_id=? AND contact_point_id=?", [
        client.client_id,
        contactId,
      ]);
      const point = points[0];
      if (point.contact_type === "Email" || point.contact_type === "Phone") {
        const field = point.contact_type === "Email" ? "email" : "phone";
        const [remaining] = await conn.execute(
          "SELECT contact_info FROM contact_point WHERE client_id=? AND contact_type=? ORDER BY contact_point_id LIMIT 1",
          [client.client_id, point.contact_type],
        );
        await conn.execute(
          `UPDATE client_crm_details SET ${field}=? WHERE client_id=? AND ${field}=?`,
          [remaining[0]?.contact_info || "", client.client_id, point.contact_info],
        );
        await conn.execute(
          "UPDATE client c JOIN client_crm_details d ON d.client_id=c.client_id SET c.contact_point=LEFT(COALESCE(NULLIF(d.phone,''),d.email,''),30) WHERE c.client_id=?",
          [client.client_id],
        );
      }
    });
    await access.activity(req.user, client.client_id, "Removed a contact point");
    res.json({ ok: true });
  }),
);
module.exports = router;
