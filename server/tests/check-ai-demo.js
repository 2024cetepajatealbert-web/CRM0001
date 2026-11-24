const assert = require("node:assert/strict");
const path = require("node:path");

module.exports = async ({ req, owner, page }) => {
  const api = "/api/crm/ai-demo";
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const post = (id, status = 200, body) =>
    req(`${api}/${id}/summary`, { token: owner.token, method: "POST", status, body });
  const calls = [];
  let mode = "success";
  let samples;
  global.fetch = async (url, options) => {
    const host = new URL(url).hostname;
    if (host === "127.0.0.1") return originalFetch(url, options);
    assert.equal(
      url,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
    );
    assert.equal(options.headers["x-goog-api-key"], "offline-demo-test");
    const body = JSON.parse(options.body);
    assert.match(body.systemInstruction.parts[0].text, /Mr\.C/);
    const messages = JSON.parse(body.contents[0].parts[0].text);
    const sample = samples.find(
      (item) => JSON.stringify(item.messages) === JSON.stringify(messages),
    );
    assert.ok(sample, "Only the exact server-owned sample may be transmitted");
    calls.push(sample.id);
    if (mode === "quota") return new Response("private provider diagnostic", { status: 429 });
    const brief =
      sample.id === "condo-viewing"
        ? {
            summary: "The buyer wants to review a floor plan before deciding on a condo viewing.",
            facts: ["Two bedrooms in Iloilo City", "Budget up to ₱4 million"],
            followUp: "I’d send the floor plan and ask whether Saturday morning works.",
            timingQuote: "Saturday morning",
          }
        : {
            summary: "The buyer is comparing townhouses and asked about payment terms.",
            facts: ["Parking space required", "Budget still undecided"],
            followUp: "I’d send a sample down payment and monthly payment breakdown.",
            timingQuote: "Friday at nine",
          };
    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: mode === "malformed" ? "{}" : JSON.stringify(brief) }] },
        },
      ],
    });
  };
  try {
    delete process.env.GEMINI_API_KEY;
    await req(api, { status: 401 });
    const catalog = await req(api, { token: owner.token });
    samples = catalog.samples;
    assert.equal(catalog.configured, false);
    const [first, second] = samples;
    for (const sample of samples) {
      assert.ok(sample.preparedBrief.summary);
      assert.ok(sample.preparedBrief.followUp);
    }
    await post(first.id, 503);
    await post("45678", 404);
    await post(first.id, 400, { conversationId: 45678, transcript: "An outside chat" });
    assert.equal(calls.length, 0);
    process.env.GEMINI_API_KEY = "offline-demo-test";
    mode = "quota";
    const limited = await post(first.id, 429);
    assert.match(limited.message, /quota/i);
    assert.doesNotMatch(limited.message, /private provider diagnostic/);
    mode = "malformed";
    await post(first.id, 502);
    mode = "success";
    const [brief, shared] = await Promise.all([post(first.id), post(first.id)]);
    assert.deepEqual(brief, shared);
    assert.equal(brief.timingQuote, "Saturday morning");
    assert.equal(calls.length, 3, "Concurrent requests share a single generation");
    const secondBrief = await post(second.id);
    assert.equal(secondBrief.timingQuote, "", "Discard timing absent from the buyer's messages");
    if (page) {
      const tab = (name) => page.locator(`.workspace-sidebar nav [data-page="${name}"]`).click();
      const launch = page.getByRole("button", { name: "Open Mr.C", exact: true });
      const dialog = page.getByRole("dialog", { name: "Mr.C", exact: true });
      const picker = dialog.getByLabel("Sample conversation", { exact: true });
      const source = dialog.locator("#ai-demo-source");
      const previousSize = page.viewportSize();
      await page.setViewportSize({ width: 1280, height: 820 });
      await tab("Overview");
      assert.equal(await launch.count(), 0);
      await tab("Inbox");
      delete process.env.GEMINI_API_KEY;
      await launch.click();
      await dialog.getByText(first.preparedBrief.followUp, { exact: true }).waitFor();
      assert.equal(await source.textContent(), "Prepared example");
      assert.doesNotMatch(await dialog.innerText(), /Gemini|API key|\.env|restart the server/i);
      await picker.selectOption(second.id);
      await dialog.getByText(second.preparedBrief.summary, { exact: true }).waitFor();
      assert.equal(await dialog.locator("#ai-demo-timing").isVisible(), false);
      assert.equal(calls.length, 4, "Prepared examples work without contacting Gemini");
      await picker.selectOption(first.id);
      await dialog.getByRole("button", { name: "Close Mr.C" }).click();
      await dialog.waitFor({ state: "hidden" });
      process.env.GEMINI_API_KEY = "offline-demo-test";
      await page.route(
        "**/api/crm/ai-demo/" + first.id + "/summary",
        (route) =>
          route.fulfill({
            status: 503,
            json: { message: "Private API key configuration details" },
          }),
        { times: 1 },
      );
      await launch.click();
      await dialog.getByText(first.preparedBrief.followUp, { exact: true }).waitFor();
      assert.equal(await source.textContent(), "Prepared example");
      assert.doesNotMatch(await dialog.innerText(), /API key/i);
      await dialog.getByRole("button", { name: "Try again" }).click();
      await dialog.getByText(brief.summary, { exact: true }).waitFor();
      assert.equal(await source.textContent(), "AI-generated brief");
      await dialog.locator(".ai-demo-portrait").evaluate((img) => img.decode());
      await page.locator("#toast.show").waitFor({ state: "hidden" });
      await page.screenshot({
        path: path.join(__dirname, "../../tmp/screenshots/mr-c-desktop.png"),
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await dialog.getByText("Read sample chat").click();
      await dialog.getByText(first.messages[0].text, { exact: false }).last().waitFor();
      await picker.selectOption(second.id);
      await dialog.getByText(secondBrief.summary, { exact: true }).waitFor();
      assert.equal(await dialog.locator("#ai-demo-timing").isVisible(), false);
      const rect = await dialog.boundingBox();
      const viewport = page.viewportSize();
      assert.ok(
        rect.x >= 0 &&
          rect.y >= 0 &&
          rect.x + rect.width <= viewport.width + 1 &&
          rect.y + rect.height <= viewport.height + 1,
      );
      await page.screenshot({
        path: path.join(__dirname, "../../tmp/screenshots/mr-c-mobile.png"),
      });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.ok(await launch.evaluate((button) => document.activeElement === button));
      await page.setViewportSize(previousSize);
    }
    assert.equal(calls.length, 4, "Repeat views reuse the two fictional briefs");
    console.log(
      "PASS: authenticated fictional AI samples, prepared Mr.C briefs, quota retry, output validation, shared generation and accessible Inbox overlay when browser testing is enabled.",
    );
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
};
