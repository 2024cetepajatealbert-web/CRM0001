const crypto = require("crypto");
const db = require("../config/database");
const PublicError = require("../utils/publicError");
function key() {
  const value = process.env.CONNECTION_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw new PublicError(
      "Connection encryption is not configured on the server. Ask your administrator to check CONNECTION_ENCRYPTION_KEY and restart CRAM.",
      503,
    );
  return Buffer.from(value, "hex");
}
function encrypt(value) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}
function decrypt(value) {
  const [iv, tag, body] = value.split(".").map((v) => Buffer.from(v, "base64"));
  const cipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(body), cipher.final()]).toString());
}
async function graph(path, token, body) {
  const version = process.env.META_GRAPH_VERSION || "v24.0";
  if (!/^v\d+\.0$/.test(version))
    throw new PublicError(
      "Invalid Meta API version. Ask your administrator to check META_GRAPH_VERSION.",
      503,
    );
  let response, result;
  try {
    response = await fetch(`https://graph.facebook.com/${version}/${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    result = await response.json();
  } catch {
    throw new PublicError(
      body
        ? "Meta did not confirm delivery. Check the Facebook Page inbox before sending again."
        : "CRAM could not validate the Page with Meta. Check the server internet connection and try again.",
    );
  }
  if (!result || typeof result !== "object")
    throw new PublicError(
      body
        ? "Meta returned an unexpected response. Check the Page inbox before sending again."
        : "Meta returned an unexpected response while validating the Page. Try again shortly.",
    );
  if (!response.ok || result.error) {
    // Never expose Meta's raw message: it may contain request details or secrets.
    const code = Number(result.error?.code) || response.status;
    const subcode = Number(result.error?.error_subcode);
    const reference = `Meta code ${code}${Number.isSafeInteger(subcode) && subcode > 0 ? `, subcode ${subcode}` : ""}`;
    let guidance = "Check the Page token and permissions in Meta Messenger API Settings.";
    if (code === 190)
      guidance =
        "Meta rejected the access token. Generate a new Page access token for your Page in Messenger API Settings, then paste it into CRAM.";
    else if (code === 10 || (code >= 200 && code <= 299))
      guidance =
        "Meta rejected this operation. Check the app permissions, your Page access, and the app testing roles.";
    else if (code === 100)
      guidance =
        "Meta could not validate this request. For connection setup, use the Page access token generated beside your Page, not a personal or app token.";
    else if ([4, 17, 32, 613].includes(code))
      guidance = "Meta is limiting requests. Wait before trying again.";
    if (body) guidance += " For replies, also check the Messenger reply window.";
    const error = new PublicError(`${guidance} (${reference})`);
    error.providerRejected = true;
    throw error;
  }
  return result;
}
async function receive(connection, event) {
  const message = event.message;
  if (!message?.mid) return;
  const echo = Boolean(message.is_echo),
    psid = echo ? event.recipient?.id : event.sender?.id;
  if (!psid || !/^\d+$/.test(psid)) return;
  const content = String(
    message.text || "[Attachment received — view it in your Facebook Page Inbox]",
  ).slice(0, 5000);
  const timestamp = Number(event.timestamp);
  const at =
    Number.isFinite(timestamp) && timestamp > 0
      ? new Date(Math.min(timestamp, Date.now()))
      : new Date();
  await db.transaction(async (c) => {
    // Serializes contact creation and webhook retries for this Page.
    await c.execute("SELECT id FROM platform_connections WHERE id=? FOR UPDATE", [connection.id]);
    let [convs] = await c.execute(
      "SELECT * FROM conversation WHERE connection_id=? AND client_psid=?",
      [connection.id, psid],
    );
    let conv = convs[0];
    if (!conv) {
      const [client] = await c.execute(
        `INSERT INTO client (client_first_name,client_middle_name,client_last_name,client_display_name,created_at,contact_point,user_user_id,workspace_id,created_by) VALUES ('Messenger','','Contact',?,NOW(),'Messenger',?,?,?)`,
        [
          `Messenger contact ${psid.slice(-4)}`,
          connection.created_by,
          connection.workspace_id,
          connection.created_by,
        ],
      );
      await c.execute("INSERT INTO client_crm_details (client_id,source) VALUES (?,'Messenger')", [
        client.insertId,
      ]);
      await c.execute(
        "INSERT INTO contact_point (client_id,contact_type,contact_info) VALUES (?,'Messenger',?)",
        [client.insertId, psid],
      );
      const [created] = await c.execute(
        `INSERT INTO conversation (platform,connection_id,page_id,conversation_created_at,client_psid,user_user_id,client_client_id) VALUES ('Messenger',?,?,NOW(),?,?,?)`,
        [connection.id, connection.page_id, psid, connection.created_by, client.insertId],
      );
      conv = { conversation_id: created.insertId, client_client_id: client.insertId };
    }
    const [insert] = await c.execute(
      `INSERT IGNORE INTO message (sender_type,receiver_type,message_content,status,created_at,sent_at,conversation_conversation_id,provider_message_id) VALUES (?,?,?,'Sent',?,?,?,?)`,
      [
        echo ? "Agent" : "Client",
        echo ? "Client" : "Agent",
        content,
        at,
        at,
        conv.conversation_id,
        message.mid,
      ],
    );
    if (!insert.affectedRows) return;
    await c.execute(
      `UPDATE conversation SET last_message_sender_type=IF(last_message_at IS NULL OR last_message_at<=?, ?,last_message_sender_type),last_message_at=GREATEST(COALESCE(last_message_at,?),?), last_incoming_at=IF(?,last_incoming_at,GREATEST(COALESCE(last_incoming_at,?),?)),unread_count=unread_count+?,status='Open' WHERE conversation_id=?`,
      [at, echo ? "Agent" : "Client", at, at, echo, at, at, echo ? 0 : 1, conv.conversation_id],
    );
    if (echo)
      await c.execute("UPDATE client SET contacted_at=COALESCE(contacted_at,?) WHERE client_id=?", [
        at,
        conv.client_client_id,
      ]);
    await c.execute(
      "UPDATE platform_connections SET status='Connected',last_event_at=NOW() WHERE id=?",
      [connection.id],
    );
  });
}
module.exports = { encrypt, decrypt, graph, receive };
