const router = require("express").Router();
const crypto = require("crypto");
const db = require("../config/database");
const auth = require("../middleware/authenticate");
const wrap = require("../utils/asyncHandler");
const access = require("../services/workspaceAccess");
const { requireString } = require("../utils/validation");
const messenger = require("../services/messengerService");
router.use(auth);
async function conversation(user, id) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) access.fail("Invalid conversation ID.");
  const s = access.scope(user);
  const [row] = await db.query(
    `SELECT v.*,p.credentials,p.page_id AS connected_page_id,p.status AS connection_status FROM conversation v JOIN client c ON c.client_id=v.client_client_id LEFT JOIN platform_connections p ON p.id=v.connection_id AND p.workspace_id=c.workspace_id WHERE v.conversation_id=? AND ${s.sql}`,
    [Number(id), ...s.values],
  );
  if (!row) access.fail("Conversation not found.", 404);
  return row;
}
router.get(
  "/collaboration",
  wrap(async (req, res) => {
    const u = req.user,
      s = access.scope(u);
    const [
      conversations,
      contacts,
      members,
      teams,
      activities,
      connections,
      volume,
      performance,
      invitations,
    ] = await Promise.all([
      db.query(
        `SELECT v.conversation_id AS id,v.client_client_id AS clientId,c.client_display_name AS clientName,v.platform,v.status,v.last_message_at AS lastMessageAt,v.last_incoming_at AS lastIncomingAt,v.last_message_sender_type AS lastSender,v.unread_count AS unread,v.connection_id AS connectionId FROM conversation v JOIN client c ON c.client_id=v.client_client_id WHERE ${s.sql} ORDER BY v.last_message_at DESC`,
        s.values,
      ),
      db.query(
        `SELECT p.contact_point_id AS id,p.client_id AS clientId,p.contact_type AS type,p.contact_info AS value FROM contact_point p JOIN client c ON c.client_id=p.client_id WHERE ${s.sql}`,
        s.values,
      ),
      db.query(
        `SELECT u.user_id AS id,u.first_name AS firstName,u.middle_name AS middleName,u.last_name AS lastName,CONCAT(u.first_name,' ',u.last_name) AS name,u.email,w.role FROM workspace_members w JOIN user u ON u.user_id=w.user_id WHERE w.workspace_id=?${access.manager(u) ? "" : " AND u.user_id=?"}`,
        access.manager(u) ? [u.workspace_id] : [u.workspace_id, u.user_id],
      ),
      db.query(
        "SELECT t.teams_id AS id,t.name,t.teams_teams_id AS parentId,tm.user_id AS memberId FROM teams t LEFT JOIN team_members tm ON tm.team_id=t.teams_id WHERE t.workspace_id=?",
        [u.workspace_id],
      ),
      db.query(
        `SELECT a.id,a.client_id AS clientId,a.description,a.created_at AS createdAt,CONCAT(u.first_name,' ',u.last_name) AS actor FROM activity_log a LEFT JOIN user u ON u.user_id=a.actor_id LEFT JOIN client c ON c.client_id=a.client_id WHERE a.workspace_id=? AND ${access.manager(u) ? "1=1" : "(c.user_user_id=? OR (a.client_id IS NULL AND a.actor_id=?))"} ORDER BY a.id DESC LIMIT 200`,
        access.manager(u) ? [u.workspace_id] : [u.workspace_id, u.user_id, u.user_id],
      ),
      access.manager(u)
        ? db.query(
            "SELECT id,platform,page_id AS pageId,page_name AS pageName,status,webhook_key AS webhookKey,last_event_at AS lastEventAt FROM platform_connections WHERE workspace_id=?",
            [u.workspace_id],
          )
        : [],
      db.query(
        `SELECT DATE_FORMAT(m.created_at,'%Y-%m-%d') AS day,v.platform,COUNT(*) AS count FROM message m JOIN conversation v ON v.conversation_id=m.conversation_conversation_id JOIN client c ON c.client_id=v.client_client_id WHERE ${s.sql} AND m.status='Sent' AND m.created_at>=DATE_SUB(NOW(),INTERVAL 30 DAY) GROUP BY day,v.platform ORDER BY day`,
        s.values,
      ),
      db.query(
        `SELECT m.sender_user_id AS agentId,COUNT(DISTINCT m.conversation_conversation_id) AS handled,AVG(m.response_seconds) AS responseSeconds,COUNT(m.response_seconds) AS responseSamples FROM message m JOIN conversation v ON v.conversation_id=m.conversation_conversation_id JOIN client c ON c.client_id=v.client_client_id WHERE ${s.sql} AND m.sender_user_id IS NOT NULL AND m.status='Sent' GROUP BY m.sender_user_id`,
        s.values,
      ),
      access.manager(u)
        ? db.query(
            "SELECT email,expires_at AS expiresAt,accepted_at AS acceptedAt FROM team_invitations WHERE workspace_id=? ORDER BY id DESC LIMIT 50",
            [u.workspace_id],
          )
        : [],
    ]);
    res.json({
      conversations,
      contacts,
      members,
      teams,
      activities,
      connections,
      volume,
      performance,
      invitations,
      canManage: access.manager(u),
    });
  }),
);
router.get(
  "/conversations/:id/messages",
  wrap(async (req, res) => {
    const conv = await conversation(req.user, req.params.id);
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
    const messages = await db.query(
      "SELECT message_id AS id,sender_type AS sender,message_content AS text,sender_user_id AS senderId,status,created_at AS createdAt,error_message AS error FROM message WHERE conversation_conversation_id=? AND message_id<? ORDER BY message_id DESC LIMIT 100",
      [conv.conversation_id, before],
    );
    res.json({
      messages: messages.reverse(),
      hasMore: messages.length === 100,
      canReply:
        conv.platform === "Messenger" &&
        Boolean(conv.credentials) &&
        conv.last_incoming_at &&
        Date.now() - new Date(conv.last_incoming_at).getTime() < 86400000,
    });
  }),
);
router.post(
  "/conversations/:id/read",
  wrap(async (req, res) => {
    const conv = await conversation(req.user, req.params.id);
    await db.query("UPDATE conversation SET unread_count=0 WHERE conversation_id=?", [
      conv.conversation_id,
    ]);
    res.json({ ok: true });
  }),
);
router.patch(
  "/conversations/:id",
  wrap(async (req, res) => {
    const conv = await conversation(req.user, req.params.id);
    if (!["Open", "Closed"].includes(req.body.status)) access.fail("Invalid conversation status.");
    await db.query("UPDATE conversation SET status=? WHERE conversation_id=?", [
      req.body.status,
      conv.conversation_id,
    ]);
    res.json({ ok: true });
  }),
);
router.post(
  "/conversations/:id/messages",
  wrap(async (req, res) => {
    const conv = await conversation(req.user, req.params.id);
    const text = requireString(req.body.text, "message", { max: 2000 });
    const requestId = requireString(req.body.requestId, "request ID", { max: 36 });
    if (!/^[a-f0-9-]{36}$/i.test(requestId)) access.fail("Invalid request ID.");
    const [existing] = await db.query(
      "SELECT message_id,status FROM message WHERE conversation_conversation_id=? AND request_id=?",
      [conv.conversation_id, requestId],
    );
    if (existing) return res.json({ id: existing.message_id, status: existing.status });
    if (conv.platform !== "Messenger" || !conv.credentials)
      access.fail("Connect this Facebook Page before replying.", 409);
    if (!conv.last_incoming_at || Date.now() - new Date(conv.last_incoming_at).getTime() > 86400000)
      access.fail(
        "The standard Messenger reply window has closed. Wait for a new message from this client.",
        409,
      );
    const [previous] = await db.query(
      "SELECT created_at,sender_type FROM message WHERE conversation_conversation_id=? AND status='Sent' ORDER BY created_at DESC,message_id DESC LIMIT 1",
      [conv.conversation_id],
    );
    const responseSeconds =
      previous?.sender_type === "Client"
        ? Math.max(0, Math.round((Date.now() - new Date(previous.created_at).getTime()) / 1000))
        : null;
    let saved;
    try {
      saved = await db.query(
        "INSERT INTO message (sender_type,receiver_type,message_content,status,created_at,conversation_conversation_id,sender_user_id,request_id) VALUES ('Agent','Client',?,'Sending',NOW(),?,?,?)",
        [text, conv.conversation_id, req.user.user_id, requestId],
      );
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY")
        return res
          .status(409)
          .json({ message: "This send is already being processed. Refresh the conversation." });
      throw e;
    }
    let result;
    try {
      result = await messenger.graph(
        `${conv.connected_page_id}/messages`,
        messenger.decrypt(conv.credentials).pageToken,
        { recipient: { id: conv.client_psid }, messaging_type: "RESPONSE", message: { text } },
      );
    } catch (e) {
      await db.query("UPDATE message SET status=?,error_message=? WHERE message_id=?", [
        e.providerRejected ? "Failed" : "Unknown",
        e.message.slice(0, 255),
        saved.insertId,
      ]);
      throw e;
    }
    if (!result.message_id) {
      await db.query(
        "UPDATE message SET status='Unknown',error_message='Meta did not return a message ID. Check your Page inbox.' WHERE message_id=?",
        [saved.insertId],
      );
      access.fail("Delivery could not be confirmed. Check your Page inbox.", 502);
    }
    await db.transaction(async (c) => {
      // Serialize with webhook echoes before merging the provider's message ID.
      await c.execute("SELECT id FROM platform_connections WHERE id=? FOR UPDATE", [
        conv.connection_id,
      ]);
      const [echo] = await c.execute(
        "SELECT message_id FROM message WHERE conversation_conversation_id=? AND provider_message_id=?",
        [conv.conversation_id, result.message_id],
      );
      if (echo.length) {
        await c.execute("DELETE FROM message WHERE message_id=? AND status=?", [
          saved.insertId,
          "Sending",
        ]);
        await c.execute(
          "UPDATE message SET sender_user_id=?,request_id=?,response_seconds=? WHERE message_id=?",
          [req.user.user_id, requestId, responseSeconds, echo[0].message_id],
        );
      } else
        await c.execute(
          "UPDATE message SET status='Sent',sent_at=NOW(),provider_message_id=?,response_seconds=? WHERE message_id=?",
          [result.message_id, responseSeconds, saved.insertId],
        );
      await c.execute(
        "UPDATE conversation SET last_message_at=NOW(),last_message_sender_type='Agent' WHERE conversation_id=?",
        [conv.conversation_id],
      );
      await c.execute(
        "UPDATE client SET contacted_at=COALESCE(contacted_at,NOW()) WHERE client_id=?",
        [conv.client_client_id],
      );
      await access.activity(req.user, conv.client_client_id, "Replied on Messenger", c);
    });
    res.status(201).json({ id: saved.insertId, status: "Sent" });
  }),
);
router.post(
  "/connections/facebook",
  access.requireManager,
  wrap(async (req, res) => {
    const pageToken = requireString(req.body.pageToken, "Page access token", { max: 5000 });
    const appSecret = requireString(req.body.appSecret, "Meta app secret", { max: 255 });
    const page = await messenger.graph("me?fields=id,name,category", pageToken);
    if (!page.id || !page.name || !page.category) access.fail("Use a Facebook Page access token.");
    const [exists] = await db.query(
      "SELECT id,workspace_id FROM platform_connections WHERE page_id=?",
      [page.id],
    );
    if (exists && exists.workspace_id !== req.user.workspace_id)
      access.fail("This Page is already connected to another workspace.", 409);
    const verifyToken = crypto.randomBytes(24).toString("hex");
    const webhookKey = crypto.randomBytes(24).toString("hex");
    const credentials = messenger.encrypt({ pageToken, appSecret, verifyToken });
    if (exists)
      await db.query(
        "UPDATE platform_connections SET page_name=?,credentials=?,webhook_key=?,status='Awaiting webhook' WHERE id=? AND workspace_id=?",
        [page.name, credentials, webhookKey, exists.id, req.user.workspace_id],
      );
    else
      try {
        await db.query(
          "INSERT INTO platform_connections (workspace_id,page_id,page_name,credentials,webhook_key,created_by) VALUES (?,?,?,?,?,?)",
          [req.user.workspace_id, page.id, page.name, credentials, webhookKey, req.user.user_id],
        );
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY")
          access.fail("This Page was just connected. Refresh and try again.", 409);
        throw error;
      }
    res.status(201).json({
      pageName: page.name,
      verifyToken,
      callbackPath: `/api/messenger/webhook/${webhookKey}`,
      message:
        "Page credentials saved. Configure the HTTPS callback and subscribe your Page in Meta.",
    });
  }),
);
module.exports = router;
