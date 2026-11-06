// Called only by the isolated workspace suite; all Facebook transport is mocked.
module.exports = async ({ req, owner, other, agent, mockPage, client, browserPage }) => {
  const assert = require("node:assert/strict");
  const crypto = require("node:crypto");
  const db = require("../src/config/database");
  const messenger = require("../src/services/messengerService");
  const original = messenger.graph;
  const [page] = await db.query("SELECT * FROM platform_connections WHERE page_id=?", [mockPage]);
  const call = (path, method = "GET", body, token = owner.token, status = 200) =>
    req("/api/crm" + path, { token, method, body, status });
  const now = Date.now();
  const psid = "6677889900";
  let listCalls = 0;
  const msg = (id, ago, outgoing = false) => ({
    id,
    message: id,
    created_time: new Date(now - ago).toISOString(),
    from: { id: outgoing ? mockPage : psid },
  });
  messenger.graph = async (path, token, body) => {
    assert.equal(token, "qa-page-token");
    if (path.includes("/conversations?")) {
      listCalls++;
      return {
        data: [
          {
            id: "thread_qa",
            participants: { data: [{ id: mockPage }, { id: psid, name: "Sample Buyer" }] },
          },
        ],
      };
    }
    if (path.startsWith("thread_qa/messages?")) {
      if (path.includes("after=older")) return { data: [msg("history-old", 9 * 86400000)] };
      return {
        data: [
          {
            ...msg("sync-new", 60000),
            attachments: {
              data: [
                { image_data: { url: "https://scontent.fbcdn.net/test.jpg" }, name: "Property" },
              ],
            },
          },
          msg("sync-outgoing", 120000, true),
        ],
        paging: {
          next: "https://do-not-follow.example.invalid/?access_token=secret",
          cursors: { after: "older" },
        },
      };
    }
    if (body) {
      // Simulate a webhook echo arriving before the send API resolves.
      await messenger.receive(page, {
        sender: { id: mockPage },
        recipient: { id: psid },
        timestamp: Date.now(),
        message: { mid: "echo-race", text: body.message.text, is_echo: true },
      });
      return { message_id: "echo-race" };
    }
    throw new Error("Unexpected mock path");
  };
  try {
    await call(`/connections/${page.id}/sync`, "POST", {}, other.token, 404);
    await call(`/connections/${page.id}/sync`, "POST", {}, agent.token, 403);
    await call(`/connections/${page.id}/webhook-details`, "POST", {}, agent.token, 403);
    const first = await call(`/connections/${page.id}/sync`, "POST", {});
    assert.equal(first.inserted, 2);
    assert.equal((await call(`/connections/${page.id}/sync`, "POST", {})).inserted, 0);
    let all = await call("/collaboration");
    const conv = all.conversations.find((v) => v.clientName === "Sample Buyer");
    assert.ok(conv);
    assert.ok(!JSON.stringify(all).includes("qa-page-token"));
    let thread = await call(`/conversations/${conv.id}/messages`);
    assert.equal(thread.messages.length, 2);
    assert.equal(thread.hasRemoteHistory, true);
    assert.equal(thread.canReply, true);
    assert.equal(thread.messages.at(-1).attachments[0].type, "image");
    await call(`/conversations/${conv.id}/history`, "POST", {}, other.token, 404);
    await call(`/conversations/${conv.id}/history`, "POST", {});
    thread = await call(`/conversations/${conv.id}/messages`);
    assert.deepEqual(
      thread.messages.map((m) => m.text),
      ["history-old", "sync-outgoing", "sync-new"],
    );
    assert.equal(thread.hasRemoteHistory, false);
    const earlier = await call(
      `/conversations/${conv.id}/messages?before=${thread.messages[1].id}`,
    );
    assert.deepEqual(
      earlier.messages.map((m) => m.text),
      ["history-old"],
    );
    const reply = await call(
      `/conversations/${conv.id}/messages`,
      "POST",
      { text: "Mock reply", requestId: crypto.randomUUID() },
      owner.token,
      201,
    );
    const [stored] = await db.query(
      "SELECT message_id,request_id FROM message WHERE provider_message_id=? AND conversation_conversation_id=?",
      ["echo-race", conv.id],
    );
    assert.equal(reply.id, stored.message_id);
    assert.ok(stored.request_id);
    await call(
      `/conversations/${conv.id}/client`,
      "PUT",
      { clientId: client.id },
      agent.token,
      403,
    );
    await call(`/conversations/${conv.id}/client`, "PUT", { clientId: client.id });
    all = await call("/collaboration");
    assert.equal(all.conversations.find((v) => v.id === conv.id).clientId, client.id);
    await call(`/connections/${page.id}/sync`, "PATCH", { enabled: true });
    assert.ok(listCalls >= 2);
    assert.equal(messenger.attachments([{ payload: { url: "javascript:alert(1)" } }])[0].url, null);
    assert.equal(
      messenger.attachments([{ payload: { url: "https://localhost/secret" } }])[0].url,
      null,
    );
    // Older imports must not reset the history cursor back to page one.
    await call(`/connections/${page.id}/sync`, "POST", {});
    thread = await call(`/conversations/${conv.id}/messages`);
    assert.equal(thread.hasRemoteHistory, false);
    // An empty remote history page must clear its cursor rather than loop forever.
    await db.query(
      "UPDATE conversation SET history_cursor='empty',history_loaded=1 WHERE conversation_id=?",
      [conv.id],
    );
    const [emptyPageConv] = await db.query("SELECT * FROM conversation WHERE conversation_id=?", [
      conv.id,
    ]);
    const currentGraph = messenger.graph;
    messenger.graph = async () => ({ data: [] });
    await require("../src/services/messengerSync").loadHistory(page, emptyPageConv);
    messenger.graph = currentGraph;
    assert.equal((await call(`/conversations/${conv.id}/messages`)).hasRemoteHistory, false);
    if (browserPage) {
      await browserPage.reload();
      await browserPage.locator('.workspace-sidebar [data-page="Connect"]').click();
      const syncButton = browserPage.locator(`[data-collab="sync-page"][data-id="${page.id}"]`);
      const response = browserPage.waitForResponse(
        (r) => r.url().endsWith(`/connections/${page.id}/sync`) && r.request().method() === "POST",
      );
      await syncButton.click();
      assert.equal((await response).status(), 200);
      await browserPage.locator(`[data-collab="webhook-details"][data-id="${page.id}"]`).click();
      await browserPage.locator(`#webhook-details-${page.id} input[type="password"]`).waitFor();
      assert.equal(
        await browserPage.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      console.log("PASS: Connect sync and private webhook-details controls in the browser.");
    }
    console.log(
      "PASS: Messenger import, deduplication, safe attachments, chronological pagination, history cursors, client matching, cross-workspace protection, and echo/send race.",
    );
  } finally {
    messenger.graph = original;
  }
};
