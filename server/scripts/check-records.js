// Invoked by check-workspace.js with its isolated QA accounts, never real records.
const assert = require("node:assert/strict");
const db = require("../src/config/database");
module.exports = async function checkRecords({
  req,
  owner,
  other,
  agent,
  client,
  task,
  team,
  conv,
}) {
  const root = "/api/crm";
  const call = (path, method, body, token = owner.token, status = 200) =>
    req(root + path, { token, method, body, status });
  const [before] = await db.query(
    "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()",
  );
  // Paused qualification fields must survive edits from the simplified form.
  await db.query(
    "UPDATE client_crm_details SET source='Referral',stage='Qualified',property_interest='Preserved property',budget=5000000,notes='Preserved notes' WHERE client_id=?",
    [client.id],
  );
  const [contact] = await db.query("SELECT email,phone FROM client_crm_details WHERE client_id=?", [
    client.id,
  ]);
  await call(
    `/clients/${client.id}`,
    "PUT",
    {
      firstName: "QA",
      middleName: "",
      lastName: "Buyer",
      email: contact.email,
      phone: contact.phone,
    },
    agent.token,
  );
  const [preserved] = await db.query(
    "SELECT source,stage,property_interest,budget,notes FROM client_crm_details WHERE client_id=?",
    [client.id],
  );
  assert.equal(preserved.source, "Referral");
  assert.equal(preserved.stage, "Qualified");
  assert.equal(preserved.property_interest, "Preserved property");
  assert.equal(Number(preserved.budget), 5000000);
  assert.equal(preserved.notes, "Preserved notes");

  await call(`/clients/${client.id}`, "DELETE", { confirm: "DELETE" }, agent.token, 403);
  await call(`/clients/${client.id}`, "DELETE", { confirm: "DELETE" }, other.token, 404);
  await call(`/clients/${client.id}`, "DELETE", {}, owner.token, 400);
  await call(
    `/tasks/${task.id}`,
    "PUT",
    {
      title: "Updated viewing",
      notes: "Meet at lobby",
      type: "Site visit",
      dueAt: new Date(Date.now() + 7200000).toISOString(),
    },
    agent.token,
  );
  const [savedTask] = await db.query("SELECT title,notes FROM tasks WHERE task_id=?", [task.id]);
  assert.equal(savedTask.title, "Updated viewing");
  assert.equal(savedTask.notes, "Meet at lobby");
  await call(`/tasks/${task.id}`, "DELETE", { confirm: "DELETE" }, other.token, 404);
  await call(
    `/tasks/${task.id}`,
    "PUT",
    { title: "Bad date", type: "Site visit", dueAt: "invalid" },
    agent.token,
    400,
  );

  let shared = await call("/collaboration");
  const phone = shared.contacts.find((p) => p.clientId === client.id && p.type === "Phone");
  await call(
    `/clients/${client.id}/contacts/${phone.id}`,
    "PUT",
    { type: "Email", value: "updated-contact@example.invalid" },
    agent.token,
  );
  let workspace = await call("/workspace");
  assert.equal(
    workspace.clients.find((c) => c.id === client.id).email,
    "updated-contact@example.invalid",
  );
  assert.equal(workspace.clients.find((c) => c.id === client.id).phone, "");
  await call(
    `/clients/${client.id}/contacts/${phone.id}`,
    "PUT",
    { type: "Phone", value: "09171234567" },
    other.token,
    404,
  );

  await call(`/teams/${team.id}`, "PUT", { name: "Renamed QA team" });
  const [savedTeam] = await db.query("SELECT name FROM teams WHERE teams_id=?", [team.id]);
  assert.equal(savedTeam.name, "Renamed QA team");
  await call(`/teams/${team.id}`, "PUT", { name: "Not allowed" }, agent.token, 403);
  await call(`/teams/${team.id}`, "DELETE", { confirm: "DELETE" }, other.token, 404);
  await call(
    `/teams/${workspace.user.workspaceId}`,
    "DELETE",
    { confirm: "DELETE" },
    owner.token,
    409,
  );

  const member = { firstName: "QA", middleName: "Updated", lastName: "Agent", role: "MANAGER" };
  await call(`/users/${agent.id}`, "PUT", member, agent.token, 403);
  await call(`/users/${agent.id}`, "PUT", member, other.token, 404);
  await call(`/users/${owner.id}`, "PUT", member, owner.token, 409);
  await call(`/users/${agent.id}`, "PUT", member);
  workspace = await call("/workspace", "GET", undefined, agent.token);
  assert.equal(workspace.user.workspaceRole, "MANAGER");
  await call(`/users/${agent.id}`, "PUT", { ...member, role: "AGENT" });

  const draft = await call(
    `/conversations/${conv.id}/drafts`,
    "POST",
    { text: "Unsent QA draft" },
    agent.token,
    201,
  );
  await call(
    `/conversations/${conv.id}/messages/${draft.id}`,
    "PUT",
    { text: "Updated unsent draft" },
    agent.token,
  );
  const [savedDraft] = await db.query(
    "SELECT message_content,status,sent_at FROM message WHERE message_id=?",
    [draft.id],
  );
  assert.equal(savedDraft.message_content, "Updated unsent draft");
  assert.equal(savedDraft.status, "Draft");
  assert.equal(savedDraft.sent_at, null);
  await call(
    `/conversations/${conv.id}/messages/${draft.id}`,
    "PUT",
    { text: "Other workspace" },
    other.token,
    404,
  );
  const thread = await call(`/conversations/${conv.id}/messages`);
  const sent = thread.messages.find((m) => m.sender === "Agent" && m.status === "Sent");
  await call(
    `/conversations/${conv.id}/messages/${sent.id}`,
    "PUT",
    { text: "Rewrite sent history" },
    owner.token,
    409,
  );
  await call(
    `/conversations/${conv.id}/messages/${sent.id}`,
    "DELETE",
    { confirm: "DELETE" },
    agent.token,
    403,
  );
  await call(`/conversations/${conv.id}/messages/${sent.id}`, "DELETE", { confirm: "DELETE" });
  assert.equal(
    (await db.query("SELECT message_id FROM message WHERE message_id=?", [sent.id])).length,
    0,
  );
  await call(
    `/conversations/${conv.id}/messages/${draft.id}`,
    "DELETE",
    { confirm: "DELETE" },
    agent.token,
  );
  assert.equal(
    (await db.query("SELECT message_id FROM message WHERE message_id=?", [draft.id])).length,
    0,
  );

  const linked = await call(
    "/tasks",
    "POST",
    {
      clientId: conv.clientId,
      conversationId: conv.id,
      title: "Keep after conversation deletion",
      type: "Follow-up",
      dueAt: new Date().toISOString(),
    },
    owner.token,
    201,
  );
  const [linkedRow] = await db.query(
    "SELECT conversation_conversation_id FROM tasks WHERE task_id=?",
    [linked.id],
  );
  assert.equal(linkedRow.conversation_conversation_id, conv.id);
  await call(`/conversations/${conv.id}`, "DELETE", { confirm: "DELETE" }, agent.token, 403);
  await call(`/conversations/${conv.id}`, "DELETE", { confirm: "DELETE" }, other.token, 404);
  await call(`/conversations/${conv.id}`, "DELETE", { confirm: "DELETE" });
  assert.equal(
    (await db.query("SELECT conversation_id FROM conversation WHERE conversation_id=?", [conv.id]))
      .length,
    0,
  );
  const [keptTask] = await db.query(
    "SELECT conversation_conversation_id FROM tasks WHERE task_id=?",
    [linked.id],
  );
  assert.equal(keptTask.conversation_conversation_id, null);
  assert.equal(
    (await db.query("SELECT client_id FROM client WHERE client_id=?", [conv.clientId])).length,
    1,
  );

  // Exercise the entire client cascade using a simulated inquiry, not real Facebook.
  const [connection] = await db.query("SELECT * FROM platform_connections WHERE created_by=?", [
    owner.id,
  ]);
  await require("../src/services/messengerService").receive(connection, {
    sender: { id: "987654321" },
    recipient: { id: connection.page_id },
    timestamp: Date.now(),
    message: { mid: "qa-cascade-inbound", text: "Disposable inquiry for cascade verification" },
  });
  const [cascade] = await db.query(
    "SELECT conversation_id,client_client_id FROM conversation WHERE connection_id=? AND client_psid=?",
    [connection.id, "987654321"],
  );
  await call(
    "/tasks",
    "POST",
    {
      clientId: cascade.client_client_id,
      conversationId: cascade.conversation_id,
      title: "Cascade QA task",
      type: "Follow-up",
      dueAt: new Date().toISOString(),
    },
    owner.token,
    201,
  );
  const blockedDraft = await call(
    `/conversations/${cascade.conversation_id}/drafts`,
    "POST",
    { text: "Simulated in-flight reply" },
    owner.token,
    201,
  );
  await db.query("UPDATE message SET status='Sending' WHERE message_id=?", [blockedDraft.id]);
  await call(
    `/clients/${cascade.client_client_id}`,
    "DELETE",
    { confirm: "DELETE" },
    owner.token,
    409,
  );
  await call(
    `/conversations/${cascade.conversation_id}`,
    "DELETE",
    { confirm: "DELETE" },
    owner.token,
    409,
  );
  await db.query("UPDATE message SET status='Draft' WHERE message_id=?", [blockedDraft.id]);
  await call(`/clients/${cascade.client_client_id}`, "DELETE", { confirm: "DELETE" });
  for (const [table, column, id] of [
    ["client", "client_id", cascade.client_client_id],
    ["contact_point", "client_id", cascade.client_client_id],
    ["client_crm_details", "client_id", cascade.client_client_id],
    ["tasks", "client_client_id", cascade.client_client_id],
    ["conversation", "client_client_id", cascade.client_client_id],
    ["message", "conversation_conversation_id", cascade.conversation_id],
  ]) {
    assert.equal(
      (await db.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column}=?`, [id]))[0].n,
      0,
      `Dependent ${table} rows should be deleted`,
    );
  }

  await call(`/teams/${team.id}`, "DELETE", { confirm: "DELETE" });
  const [agentRow] = await db.query("SELECT teams_teams_id FROM user WHERE user_id=?", [agent.id]);
  assert.equal(agentRow.teams_teams_id, workspace.user.workspaceId);
  await call(`/users/${agent.id}`, "DELETE", { confirm: "DELETE" });
  await call("/workspace", "GET", undefined, agent.token, 401);
  assert.equal((await db.query("SELECT user_id FROM user WHERE user_id=?", [agent.id])).length, 0);
  const [assigned] = await db.query("SELECT user_user_id FROM client WHERE client_id=?", [
    client.id,
  ]);
  assert.equal(assigned.user_user_id, owner.id);
  await call(`/users/${owner.id}`, "DELETE", { confirm: "DELETE" }, owner.token, 409);

  await call(`/tasks/${task.id}`, "DELETE", { confirm: "DELETE" });
  await call(`/clients/${client.id}`, "DELETE", { confirm: "DELETE" });
  for (const [table, column] of [
    ["client", "client_id"],
    ["contact_point", "client_id"],
    ["tasks", "client_client_id"],
  ]) {
    assert.equal(
      (await db.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column}=?`, [client.id]))[0].n,
      0,
    );
  }
  // Test profile credentials and session revocation on the other isolated account.
  const profile = {
    firstName: "Changed",
    middleName: "",
    lastName: "QA",
    email: other.email,
    currentPassword: "wrong",
  };
  await call("/profile", "PUT", profile, other.token, 400);
  await call(
    "/profile",
    "PUT",
    { ...profile, email: owner.email, currentPassword: other.password },
    other.token,
    409,
  );
  const password = "Aa9!" + require("crypto").randomBytes(16).toString("hex");
  // Account email policy is enforced on login and profile edits, not customer contacts.
  await req("/api/auth/login", {
    method: "POST",
    status: 400,
    body: { email: "person@gmol.com", password },
  });
  await call(
    "/profile",
    "PUT",
    { ...profile, email: "person@gmol.com", currentPassword: other.password },
    other.token,
    400,
  );
  await call(
    "/profile",
    "PUT",
    { ...profile, currentPassword: other.password, newPassword: password },
    other.token,
  );
  await call("/workspace", "GET", undefined, other.token, 401);
  const login = await req("/api/auth/login", {
    method: "POST",
    body: { email: profile.email, password },
  });
  assert.equal(login.user.firstName, "Changed");
  const [after] = await db.query(
    "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()",
  );
  assert.equal(after.n, before.n);
  console.log(
    "PASS: original-table persistence, task/contact/team/member edits, drafts, protected sent history, scoped deletes, dependent record cleanup, account reassignment, profile changes and session revocation. No new tables.",
  );
};
