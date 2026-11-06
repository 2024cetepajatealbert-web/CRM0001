const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const db = require("../config/database");
const auth = require("../middleware/authenticate");
const wrap = require("../utils/asyncHandler");
const access = require("../services/workspaceAccess");
const records = require("../services/recordStore");
const messenger = require("../services/messengerService");
const sync = require("../services/messengerSync");
router.use(auth);
const limiter = rateLimit({
  windowMs: 60000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Please wait a moment before syncing Facebook again." },
});

async function connection(user, id) {
  const [row] = await db.query("SELECT * FROM platform_connections WHERE id=? AND workspace_id=?", [
    records.id(id),
    user.workspace_id,
  ]);
  if (!row) access.fail("Page not found.", 404);
  return row;
}
async function thread(user, id) {
  const scope = access.scope(user);
  const [row] = await db.query(
    `SELECT v.* FROM conversation v JOIN client c ON c.client_id=v.client_client_id WHERE v.conversation_id=? AND ${scope.sql}`,
    [records.id(id), ...scope.values],
  );
  if (!row) access.fail("Conversation not found.", 404);
  return row;
}
router.post(
  "/connections/:id/sync",
  access.requireManager,
  limiter,
  wrap(async (req, res) => {
    const page = await connection(req.user, req.params.id);
    if (!page.credentials) access.fail("Reconnect this Page first.", 409);
    res.json(await sync.syncPage(page));
  }),
);
router.patch(
  "/connections/:id/sync",
  access.requireManager,
  wrap(async (req, res) => {
    const page = await connection(req.user, req.params.id);
    if (typeof req.body.enabled !== "boolean")
      access.fail("Choose whether automatic sync is enabled.");
    await db.query("UPDATE platform_connections SET sync_enabled=? WHERE id=?", [
      req.body.enabled,
      page.id,
    ]);
    res.json({ ok: true });
  }),
);
router.post(
  "/messenger/sync",
  access.requireManager,
  limiter,
  wrap(async (req, res) => {
    const pages = await db.query(
      "SELECT * FROM platform_connections WHERE workspace_id=? AND sync_enabled=1 AND credentials<>'' ORDER BY COALESCE(last_sync_at,'1970-01-01') LIMIT 1",
      [req.user.workspace_id],
    );
    if (!pages.length) return res.json({ skipped: true });
    const page = pages[0];
    if (page.last_sync_at && Date.now() - new Date(page.last_sync_at).getTime() < 30000)
      return res.json({ skipped: true });
    res.json(await sync.syncPage(page));
  }),
);
router.post(
  "/conversations/:id/history",
  limiter,
  wrap(async (req, res) => {
    const conv = await thread(req.user, req.params.id);
    const page = await connection(req.user, conv.connection_id);
    res.json(await sync.loadHistory(page, conv));
  }),
);
router.post(
  "/conversations/:id/sync",
  limiter,
  wrap(async (req, res) => {
    const conv = await thread(req.user, req.params.id);
    if (!conv.connection_id || !conv.conversation_id_ext) return res.json({ skipped: true });
    const page = await connection(req.user, conv.connection_id);
    if (!page.sync_enabled) return res.json({ skipped: true });
    res.json(await sync.importMessages(page, conv.conversation_id_ext, { id: conv.client_psid }));
  }),
);
router.post(
  "/connections/:id/webhook-details",
  access.requireManager,
  wrap(async (req, res) => {
    const page = await connection(req.user, req.params.id);
    if (!page.credentials) access.fail("Reconnect this Page first.", 409);
    const callbackPath = `/api/messenger/webhook/${page.webhook_key}`;
    const origin = String(process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
    res.set("Cache-Control", "no-store").json({
      callbackPath,
      callbackUrl: /^https:\/\//.test(origin) ? origin + callbackPath : null,
      verifyToken: messenger.decrypt(page.credentials).verifyToken,
    });
  }),
);
// Re-link only this conversation. Never delete/merge client records implicitly.
router.put(
  "/conversations/:id/client",
  access.requireManager,
  wrap(async (req, res) => {
    const clientId = records.id(req.body.clientId);
    await db.transaction(async (conn) => {
      await records.lockPages(conn, req.user);
      const conv = await records.conversation(conn, req.user, req.params.id);
      const target = await records.client(conn, req.user, clientId);
      await records.ensureNotSending(conn, conv.client_client_id);
      await conn.execute(
        "UPDATE conversation SET client_client_id=?,user_user_id=? WHERE conversation_id=?",
        [clientId, target.user_user_id, conv.conversation_id],
      );
      await conn.execute(
        "UPDATE tasks SET client_client_id=?,user_user_id=? WHERE conversation_conversation_id=?",
        [clientId, target.user_user_id, conv.conversation_id],
      );
      if (conv.client_psid)
        await conn.execute(
          "INSERT IGNORE INTO contact_point (client_id,contact_type,contact_info) VALUES (?,'Messenger',?)",
          [clientId, conv.client_psid],
        );
      await access.activity(
        req.user,
        clientId,
        `Linked Messenger conversation #${conv.conversation_id} to this client`,
        conn,
      );
    });
    res.json({ ok: true });
  }),
);
module.exports = router;
