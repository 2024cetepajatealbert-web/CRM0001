const assert = require("node:assert/strict");
const db = require("../src/config/database");
module.exports = async ({ page, owner, task, client, conv, team }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const dialog = page.locator("#record-dialog");
  const save = async () => {
    await page.locator("#manage-record-form [type=submit]").click();
    await dialog.waitFor({ state: "hidden" });
  };
  const confirmDelete = async () => {
    await dialog.locator("[name=confirm]").fill("DELETE");
    await save();
  };
  const tab = async (name) => {
    await page.locator(`.workspace-sidebar [data-page="${name}"]`).click();
  };

  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await dialog.locator("[name=firstName]").fill("QA Updated");
  await dialog.locator("[name=currentPassword]").fill(owner.password);
  await save();
  const [profile] = await db.query("SELECT first_name FROM user WHERE user_id=?", [owner.id]);
  assert.equal(profile.first_name, "QA Updated");

  await tab("Activities");
  await page.locator(`[data-record=edit-task][data-id="${task.id}"]`).click();
  await dialog.locator("[name=notes]").fill("Saved through the browser");
  await save();
  const [savedTask] = await db.query("SELECT notes FROM tasks WHERE task_id=?", [task.id]);
  assert.equal(savedTask.notes, "Saved through the browser");

  await tab("Teams");
  await page.getByRole("button", { name: "Subteams", exact: true }).click();
  await page.locator(`[data-record=edit-team][data-id="${team.id}"]`).click();
  await dialog.locator("[name=name]").fill("UI renamed QA team");
  await save();

  await tab("Clients");
  await page.locator(`[data-action=edit-client][data-id="${client.id}"]`).click();
  await dialog.locator("[data-record=edit-contact]").first().click();
  await dialog.locator("[name=value]").fill("09000000099");
  await save();

  await tab("Inbox");
  await page.locator(`.thread-item[data-id="${conv.id}"]`).click();
  await page.locator("[data-record=draft-new]").click();
  await dialog.locator("[name=text]").fill("Browser saved draft");
  await save();
  const bubble = page
    .locator(".chat-message")
    .filter({ has: page.locator("p", { hasText: "Browser saved draft" }) });
  await bubble.waitFor();
  await bubble.locator("[data-record=draft-edit]").click();
  await dialog.locator("[name=text]").fill("Browser edited draft");
  await save();
  const edited = page
    .locator(".chat-message")
    .filter({ has: page.locator("p", { hasText: "Browser edited draft" }) });
  await edited.locator("[data-record=draft-copy]").click();
  assert.equal(await page.locator("#reply-text").inputValue(), "Browser edited draft");
  await edited.locator("[data-record=delete-message]").click();
  await dialog.locator("[name=confirm]").fill("WRONG");
  await page.locator("#manage-record-form [type=submit]").click();
  assert.match(await dialog.locator(".form-error").textContent(), /DELETE/);
  await confirmDelete();
  await page
    .locator(".chat-message")
    .filter({ hasText: "Browser edited draft" })
    .waitFor({ state: "hidden" });
  const [draftCount] = await db.query(
    "SELECT COUNT(*) AS n FROM message WHERE conversation_conversation_id=? AND status='Draft'",
    [conv.id],
  );
  assert.equal(draftCount.n, 0);

  await page.getByRole("button", { name: "Add client", exact: true }).first().click();
  for (const name of ["source", "stage", "budget", "property", "notes"])
    assert.equal(await dialog.locator(`[name="${name}"]`).count(), 0, `${name} must be absent`);
  const close = dialog.locator(".dialog-close"),
    mark = close.locator("svg");
  const [circle, cross] = await Promise.all([close.boundingBox(), mark.boundingBox()]);
  assert.ok(
    Math.abs(circle.x + circle.width / 2 - cross.x - cross.width / 2) < 1,
    "X horizontally centered",
  );
  assert.ok(
    Math.abs(circle.y + circle.height / 2 - cross.y - cross.height / 2) < 1,
    "X vertically centered",
  );
  await page.screenshot({
    path: require("path").join(__dirname, "../../.tmp_dashboard/add-client-simple-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await dialog.evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
    "Mobile form fits",
  );
  await page.screenshot({
    path: require("path").join(__dirname, "../../.tmp_dashboard/add-client-simple-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.locator("[name=firstName]").fill("Disposable");
  await dialog.locator("[name=lastName]").fill("UI Client");
  await dialog.locator("[name=phone]").fill("09001230000");
  await page.locator("#record-form [type=submit]").click();
  await dialog.waitFor({ state: "hidden" });
  await tab("Clients");
  const row = page.locator("tr").filter({ hasText: "Disposable UI Client" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.locator("[data-record=delete-client]").click();
  await page.screenshot({
    path: require("path").join(__dirname, "../../.tmp_dashboard/delete-confirmation.png"),
    fullPage: true,
  });
  await confirmDelete();
  await page.getByText("Disposable UI Client", { exact: true }).waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 390, height: 844 });
  await tab("Teams");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  const newPassword = dialog.locator("[name=newPassword]");
  const eye = dialog.locator(".password-toggle").last();
  await eye.click();
  assert.equal(await newPassword.getAttribute("type"), "text");
  await eye.click();
  assert.equal(await newPassword.getAttribute("type"), "password");
  await page.screenshot({
    path: require("path").join(__dirname, "../../.tmp_dashboard/profile-mobile.png"),
    fullPage: true,
  });
  await dialog.locator("[data-action=close-dialog]").first().click();
  console.log(
    "PASS: browser profile/task/contact/team edits, MySQL drafts, deletion confirmation and actual client deletion; mobile controls fit.",
  );
};
