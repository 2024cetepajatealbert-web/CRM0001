const express = require("express");
const db = require("../config/database");
const authenticate = require("../middleware/authenticate");
const access = require("../services/workspaceAccess");
const asyncHandler = require("../utils/asyncHandler");
const router = express.Router();
const stages = ["New lead", "Contacted", "Qualified", "Site visit", "Negotiation", "Won", "Lost"];
const sources = [
  "Facebook",
  "Messenger",
  "Website",
  "Digital marketing",
  "Event",
  "Walk-in",
  "Referral",
  "Other",
];
const types = ["Follow-up", "Phone call", "Site visit", "Online meeting"];
const fail = (message, status = 400) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
function text(value, name, max, required = false) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim()))
    fail(`Enter a valid ${name} (up to ${max} characters).`);
  return value.trim();
}
function choice(value, options, name) {
  if (!options.includes(value)) fail(`Invalid ${name}.`);
  return value;
}
function id(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) fail("Invalid record ID.");
  return n;
}
async function ownedClient(clientId, user) {
  return access.client(user, id(clientId));
}
router.use(authenticate);
router.get(
  "/workspace",
  asyncHandler(async (req, res) => {
    const uid = req.user.user_id;
    const scope = access.scope(req.user);
    const [clients, tasks] = await Promise.all([
      db.query(
        `SELECT c.client_id AS id, c.client_first_name AS firstName, c.client_middle_name AS middleName,
      c.client_last_name AS lastName, c.client_display_name AS name, c.created_at AS createdAt,
      c.user_user_id AS assignedTo, c.contacted_at AS contactedAt,
      (SELECT CONCAT(first_name,' ',last_name) FROM user WHERE user_id=c.user_user_id) AS assignedName,
      (SELECT MAX(last_message_at) FROM conversation WHERE client_client_id=c.client_id) AS lastActivity,
      COALESCE(d.email, (SELECT cp.contact_info FROM contact_point cp WHERE cp.client_id=c.client_id AND cp.contact_type='Email' LIMIT 1), '') AS email,
      COALESCE(d.phone, (SELECT cp.contact_info FROM contact_point cp WHERE cp.client_id=c.client_id AND cp.contact_type='Phone' LIMIT 1), '') AS phone,
      c.contact_point AS legacyContact, COALESCE(d.source,'Other') AS source, COALESCE(d.stage,'New lead') AS stage,
      COALESCE(d.property_interest,'') AS property, d.budget, COALESCE(d.notes,'') AS notes
      FROM client c LEFT JOIN client_crm_details d ON d.client_id=c.client_id
      WHERE ${scope.sql} ORDER BY c.created_at DESC, c.client_id DESC`,
        scope.values,
      ),
      db.query(
        `SELECT t.task_id AS id, t.user_user_id AS assignedTo, t.client_client_id AS clientId, c.client_display_name AS clientName,
      t.title, t.notes, t.task_type AS type, t.status, t.due_at AS dueAt, t.completed_at AS completedAt
      FROM tasks t JOIN client c ON c.client_id=t.client_client_id
      WHERE ${scope.sql} ORDER BY t.due_at, t.task_id`,
        scope.values,
      ),
    ]);
    const u = req.user;
    res.json({
      user: {
        id: u.user_id,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        role: u.role,
        workspaceRole: u.workspace_role,
        workspaceId: u.workspace_id,
      },
      clients,
      tasks,
      stages,
      sources,
      types,
    });
  }),
);
async function saveClient(req, res) {
  const uid = req.user.user_id;
  const clientId = req.params.id ? id(req.params.id) : null;
  if (clientId) await ownedClient(clientId, req.user);
  const scope = access.scope(req.user);
  const b = req.body;
  const first = text(b.firstName, "first name", 30, true);
  const middle = text(b.middleName, "middle name", 30);
  const last = text(b.lastName, "last name", 30, true);
  const name = `${first} ${last}`.slice(0, 60);
  const email = text(b.email, "email", 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Enter a valid email.");
  const phone = text(b.phone, "phone number", 30);
  if (!email && !phone && !clientId) fail("Add an email address or phone number.");
  const source = choice(b.source ?? "Other", sources, "lead source");
  const stage = choice(b.stage ?? "New lead", stages, "stage");
  const property = text(b.property, "property interest", 160);
  const notes = text(b.notes, "notes", 5000);
  const budget = b.budget === "" || b.budget == null ? null : Number(b.budget);
  if (budget !== null && (!Number.isFinite(budget) || budget < 0 || budget > 999999999999.99))
    fail("Enter a valid budget.");
  const savedId = await db.transaction(async (c) => {
    let saved = clientId;
    if (saved) {
      const [previous] = await c.execute(
        "SELECT email,phone FROM client_crm_details WHERE client_id=? FOR UPDATE",
        [saved],
      );
      for (const [type, field, value] of [
        ["Email", "email", email],
        ["Phone", "phone", phone],
      ]) {
        if (previous[0]?.[field] && previous[0][field] !== value)
          await c.execute(
            "DELETE FROM contact_point WHERE client_id=? AND contact_type=? AND contact_info=?",
            [saved, type, previous[0][field]],
          );
      }
      await c.execute(
        `UPDATE client c SET client_first_name=?, client_middle_name=?, client_last_name=?, client_display_name=?, contact_point=? WHERE client_id=? AND ${scope.sql}`,
        [first, middle, last, name, (phone || email).slice(0, 30), saved, ...scope.values],
      );
    } else {
      const [result] = await c.execute(
        "INSERT INTO client (client_first_name,client_middle_name,client_last_name,client_display_name,contact_point,created_at,user_user_id,workspace_id,created_by) VALUES (?,?,?,?,?,NOW(),?,?,?)",
        [first, middle, last, name, (phone || email).slice(0, 30), uid, req.user.workspace_id, uid],
      );
      saved = result.insertId;
    }
    await c.execute(
      `INSERT INTO client_crm_details (client_id,email,phone,source,stage,property_interest,budget,notes) VALUES (?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE email=VALUES(email),phone=VALUES(phone),source=IF(?,VALUES(source),source),stage=IF(?,VALUES(stage),stage),property_interest=IF(?,VALUES(property_interest),property_interest),budget=IF(?,VALUES(budget),budget),notes=IF(?,VALUES(notes),notes)`,
      [
        saved,
        email,
        phone,
        source,
        stage,
        property,
        budget,
        notes,
        b.source !== undefined,
        b.stage !== undefined,
        b.property !== undefined,
        b.budget !== undefined,
        b.notes !== undefined,
      ],
    );
    for (const [type, value] of [
      ["Email", email],
      ["Phone", phone],
    ]) {
      if (value)
        await c.execute(
          "INSERT IGNORE INTO contact_point (client_id,contact_type,contact_info) VALUES (?,?,?)",
          [saved, type, value],
        );
    }
    await access.activity(
      req.user,
      saved,
      clientId ? "Updated client details" : "Added a client",
      c,
    );
    return saved;
  });
  res.status(clientId ? 200 : 201).json({ id: savedId });
}
router.post("/clients", asyncHandler(saveClient));
router.put("/clients/:id", asyncHandler(saveClient));
router.post(
  "/tasks",
  asyncHandler(async (req, res) => {
    const b = req.body;
    const client = await ownedClient(b.clientId, req.user);
    const title = text(b.title, "task title", 160, true);
    const type = choice(b.type, types, "task type");
    const notes = text(b.notes, "task notes", 5000);
    const due = new Date(b.dueAt);
    if (
      typeof b.dueAt !== "string" ||
      !Number.isFinite(due.getTime()) ||
      due.getFullYear() < 2000 ||
      due.getFullYear() > 2100
    )
      fail("Choose a valid due date and time.");
    let conversationId = null;
    if (b.conversationId) {
      conversationId = id(b.conversationId);
      const rows = await db.query(
        "SELECT conversation_id FROM conversation WHERE conversation_id=? AND client_client_id=?",
        [conversationId, client.client_id],
      );
      if (!rows.length) fail("Choose a conversation belonging to this client.");
    }
    const result = await db.query(
      `INSERT INTO tasks (title,notes,task_type,due_at,created_at,completed_at,status,user_user_id,client_client_id,conversation_conversation_id)
    VALUES (?,?,?,?,NOW(),NULL,'Pending',?,?,?)`,
      [title, notes, type, due, client.user_user_id, id(b.clientId), conversationId],
    );
    await access.activity(req.user, id(b.clientId), `Scheduled ${type}: ${title}`.slice(0, 255));
    res.status(201).json({ id: result.insertId });
  }),
);
router.patch(
  "/tasks/:id",
  asyncHandler(async (req, res) => {
    const status = choice(req.body.status, ["Pending", "Completed"], "task status");
    const scope = access.scope(req.user);
    const result = await db.query(
      `UPDATE tasks t JOIN client c ON c.client_id=t.client_client_id
    SET t.status=?,t.completed_at=? WHERE t.task_id=? AND ${scope.sql}`,
      [status, status === "Completed" ? new Date() : null, id(req.params.id), ...scope.values],
    );
    if (!result.affectedRows) fail("Task not found.", 404);
    const [task] = await db.query("SELECT client_client_id,task_type FROM tasks WHERE task_id=?", [
      id(req.params.id),
    ]);
    await access.activity(req.user, task.client_client_id, `${status}: ${task.task_type}`);
    if (status === "Completed" && ["Follow-up", "Phone call"].includes(task.task_type))
      await db.query(
        "UPDATE client SET contacted_at=COALESCE(contacted_at,NOW()) WHERE client_id=?",
        [task.client_client_id],
      );
    res.json({ ok: true });
  }),
);
module.exports = router;
