const db = require("../config/database");
const access = require("./workspaceAccess");

function id(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) access.fail("Invalid record ID.");
  return number;
}

async function client(conn, user, value) {
  const scope = access.scope(user);
  const [rows] = await conn.execute(
    `SELECT c.* FROM client c WHERE c.client_id=? AND ${scope.sql} FOR UPDATE`,
    [id(value), ...scope.values],
  );
  if (!rows.length) access.fail("Client not found.", 404);
  return rows[0];
}

async function conversation(conn, user, value) {
  const scope = access.scope(user);
  const [rows] = await conn.execute(
    `SELECT v.* FROM conversation v JOIN client c ON c.client_id=v.client_client_id
    WHERE v.conversation_id=? AND ${scope.sql} FOR UPDATE`,
    [id(value), ...scope.values],
  );
  if (!rows.length) access.fail("Conversation not found.", 404);
  return rows[0];
}

// Use the same Page-first lock ordering as incoming Messenger events.
async function lockPages(conn, user) {
  await conn.execute(
    "SELECT id FROM platform_connections WHERE workspace_id=? ORDER BY id FOR UPDATE",
    [user.workspace_id],
  );
}

async function ensureNotSending(conn, clientId) {
  const [rows] = await conn.execute(
    `SELECT m.message_id FROM message m JOIN conversation v ON v.conversation_id=m.conversation_conversation_id
    WHERE v.client_client_id=? AND m.status='Sending' LIMIT 1`,
    [clientId],
  );
  if (rows.length)
    access.fail("A reply is still being sent. Wait for its result before deleting records.", 409);
}

async function refreshConversation(conn, conversationId) {
  const [last] = await conn.execute(
    "SELECT created_at,sender_type FROM message WHERE conversation_conversation_id=? AND status='Sent' ORDER BY created_at DESC,message_id DESC LIMIT 1",
    [conversationId],
  );
  const [incoming] = await conn.execute(
    "SELECT MAX(created_at) AS at FROM message WHERE conversation_conversation_id=? AND status='Sent' AND sender_type='Client'",
    [conversationId],
  );
  await conn.execute(
    "UPDATE conversation SET last_message_at=?,last_message_sender_type=?,last_incoming_at=?,unread_count=0 WHERE conversation_id=?",
    [last[0]?.created_at || null, last[0]?.sender_type || null, incoming[0].at, conversationId],
  );
}

// Keep the legacy primary-contact display and qualification mirror consistent.
async function syncContacts(conn, clientId) {
  const [points] = await conn.execute(
    "SELECT contact_type,contact_info FROM contact_point WHERE client_id=? AND contact_type IN ('Email','Phone') ORDER BY contact_point_id",
    [clientId],
  );
  const [details] = await conn.execute(
    "SELECT email,phone FROM client_crm_details WHERE client_id=?",
    [clientId],
  );
  const values = ["Email", "Phone"].map((type, i) => {
    const existing = details[0]?.[i ? "phone" : "email"];
    return (
      points.find((p) => p.contact_type === type && p.contact_info === existing)?.contact_info ||
      points.find((p) => p.contact_type === type)?.contact_info ||
      ""
    );
  });
  await conn.execute(
    `INSERT INTO client_crm_details (client_id,email,phone) VALUES (?,?,?)
    ON DUPLICATE KEY UPDATE email=VALUES(email),phone=VALUES(phone)`,
    [clientId, ...values],
  );
  await conn.execute("UPDATE client SET contact_point=? WHERE client_id=?", [
    (values[1] || values[0]).slice(0, 30),
    clientId,
  ]);
}

async function deleteClient(user, value) {
  return db.transaction(async (conn) => {
    await lockPages(conn, user);
    const row = await client(conn, user, value);
    await ensureNotSending(conn, row.client_id);
    await conn.execute(
      "DELETE m FROM message m JOIN conversation v ON v.conversation_id=m.conversation_conversation_id WHERE v.client_client_id=?",
      [row.client_id],
    );
    await conn.execute("DELETE FROM tasks WHERE client_client_id=?", [row.client_id]);
    await conn.execute("DELETE FROM conversation WHERE client_client_id=?", [row.client_id]);
    await conn.execute("DELETE FROM contact_point WHERE client_id=?", [row.client_id]);
    await conn.execute("DELETE FROM client_crm_details WHERE client_id=?", [row.client_id]);
    await conn.execute("UPDATE activity_log SET client_id=NULL WHERE client_id=?", [row.client_id]);
    await conn.execute("DELETE FROM client WHERE client_id=?", [row.client_id]);
    await access.activity(
      user,
      null,
      `Deleted client #${row.client_id} and its local dependent records`,
      conn,
    );
  });
}

module.exports = {
  id,
  client,
  conversation,
  lockPages,
  ensureNotSending,
  refreshConversation,
  syncContacts,
  deleteClient,
};
