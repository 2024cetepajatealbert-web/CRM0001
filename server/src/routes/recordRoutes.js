const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const auth = require('../middleware/authenticate');
const wrap = require('../utils/asyncHandler');
const { requireString, requireEmail } = require('../utils/validation');
const access = require('../services/workspaceAccess');
const store = require('../services/recordStore');
router.use(auth);

function confirm(req) {
  if (req.body.confirm !== 'DELETE') access.fail('Confirm this deletion by typing DELETE.');
}
function owner(req, res, next) {
  if (req.user.workspace_role !== 'OWNER') return res.status(403).json({ message: 'Only the workspace owner can manage agent accounts.' });
  next();
}

router.delete('/clients/:id', access.requireManager, wrap(async (req, res) => {
  confirm(req);
  await store.deleteClient(req.user, req.params.id);
  res.json({ ok: true });
}));

router.put('/tasks/:id', wrap(async (req, res) => {
  const title = requireString(req.body.title, 'task title', { max: 160 });
  const notes = requireString(req.body.notes || '', 'notes', { min: 0, max: 5000 });
  const type = req.body.type;
  if (!['Follow-up', 'Phone call', 'Site visit', 'Online meeting'].includes(type)) access.fail('Invalid task type.');
  const due = new Date(req.body.dueAt);
  if (typeof req.body.dueAt !== 'string' || !Number.isFinite(due.getTime()) || due.getFullYear() < 2000 || due.getFullYear() > 2100) access.fail('Choose a valid due date.');
  await db.transaction(async conn => {
    const scope = access.scope(req.user);
    const [tasks] = await conn.execute(`SELECT t.* FROM tasks t JOIN client c ON c.client_id=t.client_client_id WHERE t.task_id=? AND ${scope.sql} FOR UPDATE`, [store.id(req.params.id), ...scope.values]);
    if (!tasks.length) access.fail('Task not found.', 404);
    // Editing a task does not silently move it to a different client.
    await conn.execute('UPDATE tasks SET title=?,notes=?,task_type=?,due_at=? WHERE task_id=?', [title, notes, type, due, tasks[0].task_id]);
    await access.activity(req.user, tasks[0].client_client_id, `Updated task: ${title}`, conn);
  });
  res.json({ ok: true });
}));

router.delete('/tasks/:id', wrap(async (req, res) => {
  confirm(req);
  await db.transaction(async conn => {
    const scope = access.scope(req.user);
    const [tasks] = await conn.execute(`SELECT t.* FROM tasks t JOIN client c ON c.client_id=t.client_client_id WHERE t.task_id=? AND ${scope.sql} FOR UPDATE`, [store.id(req.params.id), ...scope.values]);
    if (!tasks.length) access.fail('Task not found.', 404);
    await conn.execute('DELETE FROM tasks WHERE task_id=?', [tasks[0].task_id]);
    await access.activity(req.user, tasks[0].client_client_id, `Deleted task #${tasks[0].task_id}`, conn);
  });
  res.json({ ok: true });
}));

router.put('/clients/:id/contacts/:contactId', wrap(async (req, res) => {
  const type = req.body.type;
  if (!['Messenger', 'TikTok', 'WhatsApp', 'SMS', 'Email', 'Phone'].includes(type)) access.fail('Invalid contact type.');
  let value = requireString(req.body.value, 'contact value', { max: type === 'Phone' ? 30 : 254 });
  if (type === 'Email') { value = value.toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) access.fail('Invalid email address.'); }
  await db.transaction(async conn => {
    const client = await store.client(conn, req.user, req.params.id);
    const [points] = await conn.execute('SELECT * FROM contact_point WHERE client_id=? AND contact_point_id=? FOR UPDATE', [client.client_id, store.id(req.params.contactId)]);
    if (!points.length) access.fail('Contact point not found.', 404);
    await conn.execute('UPDATE contact_point SET contact_type=?,contact_info=? WHERE client_id=? AND contact_point_id=?', [type, value, client.client_id, points[0].contact_point_id]);
    await store.syncContacts(conn, client.client_id);
    await access.activity(req.user, client.client_id, 'Updated a contact point (routing IDs remain unchanged)', conn);
  });
  res.json({ ok: true });
}));

router.put('/teams/:id', access.requireManager, wrap(async (req, res) => {
  const name = requireString(req.body.name, 'team name', { max: 50 });
  const result = await db.query('UPDATE teams SET name=? WHERE teams_id=? AND workspace_id=?', [name, store.id(req.params.id), req.user.workspace_id]);
  if (!result.affectedRows) access.fail('Team not found.', 404);
  await access.activity(req.user, null, `Renamed team: ${name}`);
  res.json({ ok: true });
}));

router.delete('/teams/:id', access.requireManager, wrap(async (req, res) => {
  confirm(req);
  const id = store.id(req.params.id);
  if (id === req.user.workspace_id) access.fail('The root workspace cannot be deleted here.', 409);
  await db.transaction(async conn => {
    const [teams] = await conn.execute('SELECT * FROM teams WHERE teams_id=? AND workspace_id=? FOR UPDATE', [id, req.user.workspace_id]);
    if (!teams.length) access.fail('Team not found.', 404);
    const [children] = await conn.execute('SELECT teams_id FROM teams WHERE teams_teams_id=?', [id]);
    if (children.length) access.fail('Move or delete nested subteams first.', 409);
    await conn.execute('INSERT IGNORE INTO team_members (team_id,user_id) SELECT ?,user_id FROM team_members WHERE team_id=?', [req.user.workspace_id, id]);
    await conn.execute('UPDATE user SET teams_teams_id=? WHERE teams_teams_id=? AND workspace_id=?', [req.user.workspace_id, id, req.user.workspace_id]);
    await conn.execute('UPDATE team_invitations SET team_id=? WHERE team_id=? AND workspace_id=?', [req.user.workspace_id, id, req.user.workspace_id]);
    await conn.execute('DELETE FROM team_members WHERE team_id=?', [id]);
    await conn.execute('DELETE FROM teams WHERE teams_id=?', [id]);
    await access.activity(req.user, null, `Deleted subteam #${id}; members retained in workspace`, conn);
  });
  res.json({ ok: true });
}));

router.get('/profile', wrap(async (req, res) => {
  const [profile] = await db.query('SELECT user_id AS id,first_name AS firstName,middle_name AS middleName,last_name AS lastName,email FROM user WHERE user_id=?', [req.user.user_id]);
  res.json(profile);
}));

router.put('/profile', wrap(async (req, res) => {
  const first = requireString(req.body.firstName, 'first name', { max: 80 });
  const middle = requireString(req.body.middleName || '', 'middle name', { min: 0, max: 80 });
  const last = requireString(req.body.lastName, 'last name', { max: 80 });
  const email = requireEmail(req.body.email);
  const current = requireString(req.body.currentPassword, 'current password', { max: 128 });
  const next = req.body.newPassword ? requireString(req.body.newPassword, 'new password', { min: 8, max: 72 }) : null;
  if (next && Buffer.byteLength(next) > 72) access.fail('Password must be at most 72 UTF-8 bytes.');
  await db.transaction(async conn => {
    const [rows] = await conn.execute('SELECT password_hash FROM user WHERE user_id=? FOR UPDATE', [req.user.user_id]);
    if (!rows.length || !await bcrypt.compare(current, rows[0].password_hash)) access.fail('Current password is incorrect.', 400);
    await conn.execute('UPDATE user SET first_name=?,middle_name=?,last_name=?,email=? WHERE user_id=?', [first, middle, last, email, req.user.user_id]);
    if (next) await conn.execute('UPDATE user SET password_hash=?,auth_version=auth_version+1 WHERE user_id=?', [await bcrypt.hash(next, 12), req.user.user_id]);
    await access.activity(req.user, null, 'Updated own account profile', conn);
  });
  res.json({ ok: true, reauthenticate: Boolean(next) });
}));

router.put('/users/:id', owner, wrap(async (req, res) => {
  const id = store.id(req.params.id);
  const first = requireString(req.body.firstName, 'first name', { max: 80 });
  const middle = requireString(req.body.middleName || '', 'middle name', { min: 0, max: 80 });
  const last = requireString(req.body.lastName, 'last name', { max: 80 });
  if (!['AGENT', 'MANAGER'].includes(req.body.role)) access.fail('Choose agent or manager.');
  await db.transaction(async conn => {
    const [members] = await conn.execute('SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=? FOR UPDATE', [req.user.workspace_id, id]);
    if (!members.length) access.fail('Member not found.', 404);
    if (members[0].role === 'OWNER' || id === req.user.user_id) access.fail('Use My profile for your account. Owner roles are protected.', 409);
    await conn.execute('UPDATE user SET first_name=?,middle_name=?,last_name=?,role=? WHERE user_id=? AND workspace_id=?', [first, middle, last, req.body.role === 'MANAGER' ? 'TL' : 'TM', id, req.user.workspace_id]);
    await conn.execute('UPDATE workspace_members SET role=? WHERE workspace_id=? AND user_id=?', [req.body.role, req.user.workspace_id, id]);
    await access.activity(req.user, null, `Updated workspace member #${id}`, conn);
  });
  res.json({ ok: true });
}));

router.delete('/users/:id', owner, wrap(async (req, res) => {
  confirm(req);
  const id = store.id(req.params.id);
  if (id === req.user.user_id) access.fail('You cannot delete your own owner account here.', 409);
  await db.transaction(async conn => {
    await store.lockPages(conn, req.user);
    const [rows] = await conn.execute('SELECT u.email,w.role FROM user u JOIN workspace_members w ON w.user_id=u.user_id AND w.workspace_id=u.workspace_id WHERE u.user_id=? AND u.workspace_id=? FOR UPDATE', [id, req.user.workspace_id]);
    if (!rows.length) access.fail('Member not found.', 404);
    if (rows[0].role === 'OWNER') access.fail('Owner accounts are protected.', 409);
    const [sending] = await conn.execute("SELECT message_id FROM message WHERE sender_user_id=? AND status='Sending' LIMIT 1", [id]);
    if (sending.length) access.fail('This agent is sending a reply. Wait for it to finish.', 409);
    // Preserve business records; the deleting owner becomes responsible for them.
    for (const table of ['client', 'conversation', 'tasks']) await conn.execute(`UPDATE ${table} SET user_user_id=? WHERE user_user_id=?`, [req.user.user_id, id]);
    await conn.execute('UPDATE client SET created_by=NULL WHERE created_by=?', [id]);
    await conn.execute('UPDATE message SET sender_user_id=NULL WHERE sender_user_id=?', [id]);
    await conn.execute('UPDATE activity_log SET actor_id=NULL WHERE actor_id=?', [id]);
    await conn.execute('UPDATE platform_connections SET created_by=? WHERE created_by=?', [req.user.user_id, id]);
    await conn.execute('UPDATE team_invitations SET invited_by=? WHERE invited_by=?', [req.user.user_id, id]);
    await conn.execute('DELETE FROM team_invitations WHERE workspace_id=? AND email=?', [req.user.workspace_id, rows[0].email]);
    await conn.execute('DELETE FROM team_members WHERE user_id=?', [id]);
    await conn.execute('DELETE FROM workspace_members WHERE user_id=?', [id]);
    await conn.execute('DELETE FROM user WHERE user_id=? AND workspace_id=?', [id, req.user.workspace_id]);
    await access.activity(req.user, null, `Deleted agent account #${id}; clients and tasks reassigned to owner`, conn);
  });
  res.json({ ok: true });
}));

router.delete('/conversations/:id', access.requireManager, wrap(async (req, res) => {
  confirm(req);
  await db.transaction(async conn => {
    await store.lockPages(conn, req.user);
    const conv = await store.conversation(conn, req.user, req.params.id);
    await store.ensureNotSending(conn, conv.client_client_id);
    await conn.execute('UPDATE tasks SET conversation_conversation_id=NULL WHERE conversation_conversation_id=?', [conv.conversation_id]);
    await conn.execute('DELETE FROM message WHERE conversation_conversation_id=?', [conv.conversation_id]);
    await conn.execute('DELETE FROM conversation WHERE conversation_id=?', [conv.conversation_id]);
    await access.activity(req.user, conv.client_client_id, `Deleted local conversation #${conv.conversation_id}; Facebook unchanged`, conn);
  });
  res.json({ ok: true });
}));

router.post('/conversations/:id/drafts', wrap(async (req, res) => {
  const text = requireString(req.body.text, 'draft', { max: 2000 });
  const id = await db.transaction(async conn => {
    const conv = await store.conversation(conn, req.user, req.params.id);
    const [result] = await conn.execute("INSERT INTO message (sender_type,receiver_type,message_content,status,created_at,conversation_conversation_id,sender_user_id) VALUES ('Agent','Client',?,'Draft',NOW(),?,?)", [text, conv.conversation_id, req.user.user_id]);
    return result.insertId;
  });
  res.status(201).json({ id });
}));

router.put('/conversations/:id/messages/:messageId', wrap(async (req, res) => {
  const text = requireString(req.body.text, 'draft', { max: 2000 });
  await db.transaction(async conn => {
    const conv = await store.conversation(conn, req.user, req.params.id);
    const [rows] = await conn.execute('SELECT * FROM message WHERE message_id=? AND conversation_conversation_id=? FOR UPDATE', [store.id(req.params.messageId), conv.conversation_id]);
    if (!rows.length) access.fail('Message not found.', 404);
    if (rows[0].status !== 'Draft') access.fail('Only saved drafts can be edited. Sent and received messages are immutable.', 409);
    if (rows[0].sender_user_id !== req.user.user_id && !access.manager(req.user)) access.fail('Only the draft author or a manager can edit it.', 403);
    await conn.execute('UPDATE message SET message_content=? WHERE message_id=?', [text, rows[0].message_id]);
  });
  res.json({ ok: true });
}));

router.delete('/conversations/:id/messages/:messageId', wrap(async (req, res) => {
  confirm(req);
  await db.transaction(async conn => {
    await store.lockPages(conn, req.user);
    const conv = await store.conversation(conn, req.user, req.params.id);
    const [rows] = await conn.execute('SELECT * FROM message WHERE message_id=? AND conversation_conversation_id=? FOR UPDATE', [store.id(req.params.messageId), conv.conversation_id]);
    if (!rows.length) access.fail('Message not found.', 404);
    const row = rows[0];
    if (row.status === 'Sending') access.fail('Wait until delivery finishes before deleting this record.', 409);
    if (!access.manager(req.user) && !(row.status === 'Draft' && row.sender_user_id === req.user.user_id)) access.fail('Only a manager can delete message history.', 403);
    await conn.execute('DELETE FROM message WHERE message_id=?', [row.message_id]);
    if (row.status !== 'Draft') await store.refreshConversation(conn, conv.conversation_id);
    await access.activity(req.user, conv.client_client_id, `Deleted local ${row.status === 'Draft' ? 'draft' : 'message'} #${row.message_id}`, conn);
  });
  res.json({ ok: true });
}));

module.exports = router;
