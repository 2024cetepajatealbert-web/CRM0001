// Isolated integration server with a mocked Meta transport. Never sends real messages.
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const assert = require("node:assert/strict");
const crypto = require("crypto");
const db = require("../src/config/database");
const messenger = require("../src/services/messengerService");
const stamp = Date.now();
const mockPage = String(stamp);
const mockSecret = "qa-only-app-secret";
let externalSends = 0;
messenger.graph = async (path, token, body) => {
  if (path.startsWith("me?")) return { id: mockPage, name: "QA Page", category: "Real estate" };
  if (path.endsWith("/messages")) {
    externalSends++;
    return { message_id: "qa-outbound-" + externalSends };
  }
  throw Error("Unexpected mock Graph path");
};
process.env.PORT = process.env.CRAM_TEST_PORT || "4088";
const server = require("../src/server");
const base = "http://127.0.0.1:" + process.env.PORT;
const accounts = [];
let browser;
async function req(path, { token, method = "GET", body, status = 200, headers = {} } = {}) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await r.text();
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    result = raw;
  }
  assert.equal(r.status, status, `${method} ${path}: ${raw}`);
  return result;
}
async function signup(label, invitationToken) {
  // No email transport is used; these policy-compatible addresses are disposable DB fixtures only.
  const email = `cram-workspace-qa-${stamp}-${label}@gmail.com`,
    password = "Aa9!" + crypto.randomBytes(15).toString("hex");
  const r = await req("/api/auth/signup", {
    method: "POST",
    status: 201,
    body: { firstName: "QA", middleName: "   ", lastName: label, email, password, invitationToken },
  });
  const a = { id: r.user.id, email, password, token: r.token };
  accounts.push(a);
  return a;
}
async function check() {
  await new Promise((resolve) =>
    server.listening ? resolve() : server.once("listening", resolve),
  );
  await req("/api/crm/workspace", { status: 401 });
  await req("/api/crm/collaboration", { token: "invalid", status: 401 });
  const owner = await signup("owner"),
    other = await signup("other");
  for (const overrides of [
    { email: "policy@example.invalid" },
    { password: "a".repeat(73) },
    { password: "é".repeat(37) },
    { firstName: "Invalid123" },
  ]) {
    await req("/api/auth/signup", {
      method: "POST",
      status: 400,
      body: {
        firstName: "QA",
        lastName: "Rejected",
        email: `cram-qa-${stamp}@gmail.com`,
        password: "Valid-password9!",
        ...overrides,
      },
    });
  }
  const team = await req("/api/crm/teams", {
    token: owner.token,
    method: "POST",
    status: 201,
    body: { name: "QA Subteam", members: [owner.id] },
  });
  const invite = await req("/api/crm/invitations", {
    token: owner.token,
    method: "POST",
    status: 201,
    body: { email: `cram-workspace-qa-${stamp}-agent@gmail.com`, teamId: team.id },
  });
  const agent = await signup("agent", invite.token);
  await req("/api/crm/teams", {
    token: agent.token,
    method: "POST",
    status: 403,
    body: { name: "Unauthorized" },
  });
  const client = await req("/api/crm/clients", {
    token: owner.token,
    method: "POST",
    status: 201,
    body: {
      firstName: "QA",
      lastName: "Buyer",
      phone: "09000000000",
      email: "",
      source: "Referral",
      stage: "New lead",
    },
  });
  const task = await req("/api/crm/tasks", {
    token: owner.token,
    method: "POST",
    status: 201,
    body: {
      clientId: client.id,
      title: "View QA home",
      type: "Site visit",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    },
  });
  await req(`/api/crm/clients/${client.id}/contacts`, {
    token: owner.token,
    method: "POST",
    status: 201,
    body: { type: "Email", value: "buyer@company.example" },
  });
  const contactSnapshot = await req("/api/crm/collaboration", { token: owner.token });
  const companyEmail = contactSnapshot.contacts.find(
    (contact) => contact.clientId === client.id && contact.value === "buyer@company.example",
  );
  assert.ok(companyEmail, "Customer emails outside signup domains are stored");
  await req(`/api/crm/clients/${client.id}/contacts/${companyEmail.id}`, {
    token: owner.token,
    method: "DELETE",
  });
  await req(`/api/crm/clients/${client.id}/assignment`, {
    token: owner.token,
    method: "PUT",
    body: { userId: agent.id },
  });
  let ws = await req("/api/crm/workspace", { token: agent.token });
  assert.equal(ws.clients.length, 1);
  assert.equal(ws.tasks[0].assignedTo, agent.id);
  const isolation = await req("/api/crm/workspace", { token: other.token });
  assert.equal(isolation.clients.length, 0);
  await req(`/api/crm/clients/${client.id}/assignment`, {
    token: other.token,
    method: "PUT",
    status: 404,
    body: { userId: other.id },
  });
  await req(`/api/crm/clients/${client.id}/contacts`, {
    token: agent.token,
    method: "POST",
    status: 201,
    body: { type: "WhatsApp", value: "09000000001" },
  });
  await req(`/api/crm/clients/${client.id}/contacts`, {
    token: agent.token,
    method: "POST",
    status: 201,
    body: { type: "WhatsApp", value: "09000000002" },
  });
  let collab = await req("/api/crm/collaboration", { token: owner.token });
  assert.equal(collab.contacts.filter((x) => x.type === "WhatsApp").length, 2);
  const phone = collab.contacts.find((x) => x.type === "Phone");
  await req(`/api/crm/clients/${client.id}/contacts/${phone.id}`, {
    token: agent.token,
    method: "DELETE",
  });
  ws = await req("/api/crm/workspace", { token: agent.token });
  assert.equal(ws.clients[0].phone, "");
  await req(`/api/crm/clients/${client.id}/contacts`, {
    token: agent.token,
    method: "POST",
    status: 201,
    body: { type: "Phone", value: "09000000003" },
  });
  ws = await req("/api/crm/workspace", { token: agent.token });
  assert.equal(ws.clients[0].phone, "09000000003");
  await req(`/api/crm/teams/${team.id}/members`, {
    token: owner.token,
    method: "PUT",
    body: { userId: agent.id, add: false },
  });
  await req(`/api/crm/teams/${team.id}/members`, {
    token: owner.token,
    method: "PUT",
    body: { userId: agent.id, add: true },
  });
  const connected = await req("/api/crm/connections/facebook", {
    token: owner.token,
    method: "POST",
    status: 201,
    body: { pageToken: "qa-page-token", appSecret: mockSecret },
  });
  assert.match(connected.callbackPath, /webhook/);
  const challenge = await req(
    connected.callbackPath +
      `?hub.mode=subscribe&hub.verify_token=${connected.verifyToken}&hub.challenge=qa-test`,
  );
  assert.equal(challenge, "qa-test");
  await req(
    connected.callbackPath + "?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=qa-test",
    { status: 403 },
  );
  await req(
    connected.callbackPath +
      "?hub.mode=subscribe&hub.verify_token=" +
      encodeURIComponent("é".repeat(48)) +
      "&hub.challenge=qa-test",
    { status: 403 },
  );
  const payload = {
    object: "page",
    entry: [
      {
        id: mockPage,
        messaging: [
          {
            sender: { id: "123456789" },
            recipient: { id: mockPage },
            timestamp: Date.now() - 60000,
            message: {
              mid: "qa-inbound-1",
              text: "I would like to buy a home. Can we arrange a site viewing?",
            },
          },
        ],
      },
    ],
  };
  await req(connected.callbackPath, { method: "POST", body: payload, status: 403 });
  const signature =
    "sha256=" +
    crypto.createHmac("sha256", mockSecret).update(JSON.stringify(payload)).digest("hex");
  const deliver = () =>
    req(connected.callbackPath, {
      method: "POST",
      body: payload,
      headers: { "x-hub-signature-256": signature },
    });
  await Promise.all([deliver(), deliver()]);
  collab = await req("/api/crm/collaboration", { token: owner.token });
  assert.equal(collab.conversations.length, 1);
  const conv = collab.conversations[0];
  assert.equal(conv.unread, 1);
  const [encrypted] = await db.query(
    "SELECT credentials FROM platform_connections WHERE page_id=?",
    [mockPage],
  );
  assert.ok(!encrypted.credentials.includes("qa-page-token"));
  let thread = await req(`/api/crm/conversations/${conv.id}/messages`, { token: owner.token });
  assert.equal(thread.messages.length, 1);
  assert.equal(thread.canReply, true);
  await req(`/api/crm/conversations/${conv.id}/messages`, { token: other.token, status: 404 });
  await req(`/api/crm/conversations/${conv.id}/messages`, { token: agent.token, status: 404 });
  const requestId = crypto.randomUUID();
  await req(`/api/crm/conversations/${conv.id}/messages`, {
    token: owner.token,
    method: "POST",
    status: 201,
    body: { text: "Of course. What location and budget do you have in mind?", requestId },
  });
  await req(`/api/crm/conversations/${conv.id}/messages`, {
    token: owner.token,
    method: "POST",
    body: { text: "Of course. What location and budget do you have in mind?", requestId },
  });
  assert.equal(externalSends, 1);
  collab = await req("/api/crm/collaboration", { token: owner.token });
  assert.ok(Number(collab.performance[0].responseSeconds) >= 50);
  await req(`/api/crm/clients/${conv.clientId}/assignment`, {
    token: owner.token,
    method: "PUT",
    body: { userId: agent.id },
  });
  await req(`/api/crm/conversations/${conv.id}/messages`, { token: agent.token });
  await req(`/api/crm/conversations/${conv.id}/read`, {
    token: agent.token,
    method: "POST",
    body: {},
  });
  await req(`/api/crm/conversations/${conv.id}`, {
    token: agent.token,
    method: "PATCH",
    body: { status: "Closed" },
  });
  const [count] = await db.query(
    "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
    ["email_verification_tokens"],
  );
  assert.equal(count.n, 0);
  console.log(
    "PASS: invitations, team membership, lead/task assignment, multi-contact clients, workspace isolation, webhook signatures, concurrent duplicate delivery, encrypted credentials, reply idempotency, response metrics and removal of unused verification table.",
  );
  if (process.env.PLAYWRIGHT_MODULE) {
    browser = await require(process.env.PLAYWRIGHT_MODULE).chromium.launch({
      headless: true,
      channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await require("./check-form-ui")(page, base);
    await page.goto(base);
    await page.locator(".header-auth .open-login").click();
    await page.locator("#login-email").fill(owner.email);
    await page.locator("#login-password").fill(owner.password);
    const loginResponse = page.waitForResponse((r) => r.url().endsWith("/api/auth/login"));
    await page.locator("#login-form [type=submit]").click();
    assert.equal((await loginResponse).status(), 200, "Browser login should succeed");
    await page.locator("#login-welcome-step .open-dashboard").click();
    await page.locator(".workspace-header h1").waitFor();
    await require("./check-dashboard-validation-ui")(page, { owner, client });
    for (const name of ["Clients", "Inbox", "Activities", "Teams", "Analytics", "Connect"]) {
      await page.locator(`.workspace-sidebar nav [data-page="${name}"]`).click();
      await page.locator("#workspace-content").waitFor();
    }
    await page.locator('.workspace-sidebar nav [data-page="Clients"]').click();
    await page.getByRole("button", { name: "Uncontacted", exact: true }).click();
    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.locator(".client-identity").filter({ hasText: "QA Buyer" }).click();
    await page.getByText("No Messenger conversation yet", { exact: true }).waitFor();
    await page.locator("[data-collab=thread]").first().click();
    await page
      .locator("#message-list")
      .getByText("I would like to buy a home. Can we arrange a site viewing?", { exact: true })
      .waitFor();
    await page.locator("#reply-text").fill("We can show you the property tomorrow.");
    await page.locator("#reply-form button").click();
    await page
      .locator("#message-list")
      .getByText("We can show you the property tomorrow.", { exact: true })
      .waitFor();
    await page.screenshot({
      path: require("path").join(__dirname, "../../.tmp_dashboard/inbox-desktop.png"),
      fullPage: true,
    });
    await page.locator('.workspace-sidebar nav [data-page="Activities"]').click();
    await page.locator(".calendar-event").filter({ hasText: "View QA home" }).click();
    await page.getByText("No Messenger conversation yet", { exact: true }).waitFor();
    await page.locator('.workspace-sidebar nav [data-page="Teams"]').click();
    await page.getByRole("button", { name: "Create subteam", exact: true }).click();
    await page.locator("#team-dialog-form [name=name]").fill("Browser QA team");
    await page.locator("#team-dialog-form button").click();
    await page.locator("#record-dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Invite agent", exact: true }).click();
    await page
      .locator("#team-dialog-form [name=email]")
      .fill(`cram-workspace-qa-${stamp}-unused@gmail.com`);
    await page.locator("#team-dialog-form button").click();
    await page.locator("#invitation-result input").waitFor();
    await page.locator("#record-dialog [data-action=close-dialog]").click();
    await page.setViewportSize({ width: 390, height: 844 });
    for (const name of ["Inbox", "Activities", "Teams", "Analytics", "Connect"]) {
      await page.locator(`.workspace-sidebar nav [data-page="${name}"]`).click();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        `Mobile overflow on ${name}`,
      );
    }
    await page.locator('.workspace-sidebar nav [data-page="Inbox"]').click();
    const mobileThread = page.locator("[data-collab=thread]").first();
    assert.equal(
      await mobileThread.locator("strong").isVisible(),
      true,
      "Mobile conversation name must be visible",
    );
    await mobileThread.click();
    await page
      .locator("#message-list")
      .getByText("We can show you the property tomorrow.", { exact: true })
      .waitFor();
    await page.screenshot({
      path: require("path").join(__dirname, "../../.tmp_dashboard/inbox-mobile.png"),
      fullPage: true,
    });
    await require("./check-records-ui")({ page, owner, task, client, conv, team });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: browser navigation, client-to-Inbox, reply, calendar-to-Inbox, team creation, invitations, and responsive layouts; no JavaScript errors.",
    );
  }
  await require("./check-records")({ req, owner, other, agent, client, task, team, conv });
}
check()
  .catch((error) => {
    console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    const ids = accounts.map((a) => a.id);
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(",");
      const roots = await db.query(
        `SELECT DISTINCT workspace_id FROM user WHERE user_id IN (${placeholders})`,
        ids,
      );
      for (const row of roots)
        await db.transaction(async (conn) => {
          const wid = row.workspace_id;
          // Only isolated workspaces created by this script's newly registered accounts.
          await conn.execute(
            "DELETE m FROM message m JOIN conversation v ON v.conversation_id=m.conversation_conversation_id JOIN client c ON c.client_id=v.client_client_id WHERE c.workspace_id=?",
            [wid],
          );
          await conn.execute(
            "DELETE t FROM tasks t JOIN client c ON c.client_id=t.client_client_id WHERE c.workspace_id=?",
            [wid],
          );
          await conn.execute(
            "DELETE v FROM conversation v JOIN client c ON c.client_id=v.client_client_id WHERE c.workspace_id=?",
            [wid],
          );
          await conn.execute("DELETE FROM platform_connections WHERE workspace_id=?", [wid]);
          await conn.execute("DELETE FROM activity_log WHERE workspace_id=?", [wid]);
          await conn.execute(
            "DELETE p FROM contact_point p JOIN client c ON c.client_id=p.client_id WHERE c.workspace_id=?",
            [wid],
          );
          await conn.execute(
            "DELETE d FROM client_crm_details d JOIN client c ON c.client_id=d.client_id WHERE c.workspace_id=?",
            [wid],
          );
          await conn.execute("DELETE FROM client WHERE workspace_id=?", [wid]);
          await conn.execute("DELETE FROM team_invitations WHERE workspace_id=?", [wid]);
          await conn.execute(
            "DELETE tm FROM team_members tm JOIN teams t ON t.teams_id=tm.team_id WHERE t.workspace_id=?",
            [wid],
          );
          await conn.execute("DELETE FROM workspace_members WHERE workspace_id=?", [wid]);
          await conn.execute("DELETE FROM user WHERE workspace_id=?", [wid]);
          await conn.execute("DELETE FROM teams WHERE workspace_id=? AND teams_id<>?", [wid, wid]);
          await conn.execute("DELETE FROM teams WHERE teams_id=?", [wid]);
        });
    }
    await new Promise((resolve) => server.close(resolve));
    await db.close();
    console.log("Temporary QA workspaces removed; no real messages sent.");
  });
