const db = require("../config/database");
const messenger = require("./messengerService");
const PublicError = require("../utils/publicError");

// Only opaque cursors are reused. Never follow Graph's paging.next URL with a token.
function nextCursor(result) {
  const cursor = result?.paging?.next && result?.paging?.cursors?.after;
  return typeof cursor === "string" && cursor.length <= 4096 ? cursor : null;
}
function graphId(value) {
  if (!/^[a-zA-Z0-9_:.=-]{1,255}$/.test(String(value || "")))
    throw new PublicError("Facebook returned an invalid conversation ID.", 502);
  return encodeURIComponent(value);
}
async function importMessages(connection, externalId, participant, after = null) {
  const query = new URLSearchParams({
    fields: "id,message,from,to,created_time,attachments",
    limit: "50",
  });
  if (after) query.set("after", after);
  const result = await messenger.graph(
    `${graphId(externalId)}/messages?${query}`,
    messenger.decrypt(connection.credentials).pageToken,
  );
  if (!Array.isArray(result.data))
    throw new PublicError("Facebook did not return a message list.", 502);
  let conversationId = null,
    inserted = 0;
  for (const m of [...result.data].reverse()) {
    const incoming = String(m.from?.id) === String(participant.id);
    const outgoing = String(m.from?.id) === String(connection.page_id);
    if (!incoming && !outgoing) continue;
    const at = new Date(m.created_time).getTime();
    if (!Number.isFinite(at) || at <= 0) continue;
    const saved = await messenger.receive(
      connection,
      {
        sender: { id: incoming ? participant.id : connection.page_id },
        recipient: { id: incoming ? connection.page_id : participant.id },
        timestamp: at,
        message: {
          mid: m.id,
          text: m.message,
          is_echo: outgoing,
          attachments: m.attachments?.data || [],
        },
      },
      {
        source: "sync",
        externalId,
        clientName: participant.name,
        notify:
          Boolean(connection.last_sync_at) && at > new Date(connection.last_sync_at).getTime(),
      },
    );
    if (saved) {
      conversationId = saved.id;
      inserted += saved.inserted ? 1 : 0;
    }
  }
  const cursor = nextCursor(result);
  if (conversationId) {
    // A refresh of recent messages must not reset an already-advanced history cursor.
    await db.query(
      `UPDATE conversation SET history_cursor=?,history_loaded=1
       WHERE conversation_id=?${after ? " AND history_cursor=?" : " AND history_loaded=0"}`,
      after ? [cursor, conversationId, after] : [cursor, conversationId],
    );
  }
  return { inserted, conversationId, hasMore: Boolean(cursor), cursor };
}

async function syncPage(connection) {
  // Database lease also prevents duplicate syncs from multiple open tabs/processes.
  const lease = await db.query(
    `UPDATE platform_connections SET sync_started_at=NOW() WHERE id=?
     AND (sync_started_at IS NULL OR sync_started_at<DATE_SUB(NOW(),INTERVAL 5 MINUTE))`,
    [connection.id],
  );
  if (!lease.affectedRows) return { busy: true, inserted: 0 };
  try {
    const query = new URLSearchParams({
      platform: "messenger",
      fields: "id,participants,updated_time",
      limit: "10",
    });
    if (connection.sync_cursor) query.set("after", connection.sync_cursor);
    const list = await messenger.graph(
      `${graphId(connection.page_id)}/conversations?${query}`,
      messenger.decrypt(connection.credentials).pageToken,
    );
    if (!Array.isArray(list.data))
      throw new PublicError("Facebook did not return a conversation list.", 502);
    let inserted = 0;
    for (const thread of list.data) {
      const participant = thread.participants?.data?.find(
        (p) => String(p.id) !== String(connection.page_id),
      );
      if (!participant || !/^\d+$/.test(String(participant.id))) continue;
      inserted += (await importMessages(connection, thread.id, participant)).inserted;
    }
    const cursor = nextCursor(list);
    await db.query(
      "UPDATE platform_connections SET last_sync_at=NOW(),sync_cursor=?,sync_error=NULL,sync_started_at=NULL WHERE id=?",
      [cursor, connection.id],
    );
    return { inserted, hasMore: Boolean(cursor), conversations: list.data.length };
  } catch (error) {
    // messenger.graph provides redacted public errors; never store provider bodies/tokens.
    const message =
      error instanceof PublicError
        ? error.message
        : "Sync failed. Check the server and database connection.";
    await db.query("UPDATE platform_connections SET sync_started_at=NULL,sync_error=? WHERE id=?", [
      message.slice(0, 255),
      connection.id,
    ]);
    throw new PublicError(message, 502);
  }
}

async function loadHistory(connection, conversation) {
  if (!conversation.conversation_id_ext) return { inserted: 0, hasMore: false };
  if (conversation.history_loaded && !conversation.history_cursor)
    return { inserted: 0, hasMore: false };
  const result = await importMessages(
    connection,
    conversation.conversation_id_ext,
    { id: conversation.client_psid },
    conversation.history_cursor,
  );
  // Advance even an empty/deleted-message page; don't overwrite a concurrent newer cursor.
  await db.query(
    "UPDATE conversation SET history_cursor=?,history_loaded=1 WHERE conversation_id=? AND history_cursor <=> ?",
    [result.cursor, conversation.conversation_id, conversation.history_cursor],
  );
  return result;
}
module.exports = { syncPage, loadHistory, nextCursor, importMessages };
