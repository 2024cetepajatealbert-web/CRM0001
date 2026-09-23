const db = require("../config/database");
const fail = (message, status = 400) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
const manager = (user) => ["OWNER", "MANAGER"].includes(user.workspace_role);
const scope = (user, alias = "c") => ({
  sql: `${alias}.workspace_id=?${manager(user) ? "" : ` AND ${alias}.user_user_id=?`}`,
  values: manager(user) ? [user.workspace_id] : [user.workspace_id, user.user_id],
});
async function client(user, id) {
  if (!Number.isSafeInteger(id) || id < 1) fail("Invalid client ID.");
  const s = scope(user);
  const rows = await db.query(`SELECT c.* FROM client c WHERE c.client_id=? AND ${s.sql}`, [
    id,
    ...s.values,
  ]);
  if (!rows.length) fail("Client not found.", 404);
  return rows[0];
}
async function requireManager(req, res, next) {
  if (!manager(req.user))
    return res.status(403).json({ message: "Only workspace owners and managers can do this." });
  next();
}
async function activity(user, clientId, description, connection = null) {
  const sql =
    "INSERT INTO activity_log (workspace_id,client_id,actor_id,description) VALUES (?,?,?,?)";
  const args = [user.workspace_id, clientId, user.user_id, description];
  if (connection) await connection.execute(sql, args);
  else await db.query(sql, args);
}
module.exports = { fail, manager, scope, client, requireManager, activity };
