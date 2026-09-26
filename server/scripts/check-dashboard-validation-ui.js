const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async (page, { owner, client }) => {
  let writes = 0;
  const count = (request) => {
    if (
      request.url().includes("/api/crm/") &&
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method())
    )
      writes++;
  };
  page.on("request", count);
  const dialog = page.locator("#record-dialog");
  const close = () => dialog.locator("[data-action=close-dialog]").first().click();
  const tab = (name) => page.locator(`.workspace-sidebar [data-page="${name}"]`).click();
  try {
    await page.getByRole("button", { name: "Add client", exact: true }).first().click();
    await dialog.locator("[name=firstName]").fill("Anna123");
    await dialog.locator("[name=lastName]").fill("Reyes");
    await dialog.locator("[name=phone]").fill("hello");
    await dialog.locator("[type=submit]").click();
    assert.equal(await dialog.locator("[name=firstName]").getAttribute("aria-invalid"), "true");
    assert.equal(await dialog.locator("[name=phone]").getAttribute("aria-invalid"), "true");
    await dialog.locator("[name=firstName]").fill("Anna");
    await dialog.locator("[name=phone]").fill("");
    await dialog.locator("[type=submit]").click();
    assert.equal(await dialog.locator("[name=email]").getAttribute("aria-invalid"), "true");
    await dialog.locator("[name=phone]").fill("+639171234567");
    assert.equal(await dialog.locator("[aria-invalid=true]").count(), 0);
    await dialog.locator("[name=phone]").fill("letters");
    await page.screenshot({
      path: path.join(__dirname, "../../.tmp_dashboard/client-validation.png"),
      fullPage: true,
    });
    await close();

    await tab("Clients");
    await page.locator(`[data-action=edit-client][data-id="${client.id}"]`).click();
    const contacts = dialog.locator("#contact-point-form");
    await contacts.locator("[name=type]").selectOption("Email");
    await contacts.locator("[name=value]").fill("broken-address");
    await contacts.locator("[type=submit]").click();
    assert.equal(await contacts.locator("[name=value]").getAttribute("aria-invalid"), "true");
    await contacts.locator("[name=value]").fill("buyer@company.example");
    assert.equal(await contacts.locator("[name=value]").getAttribute("aria-invalid"), "false");
    await contacts.locator("[name=type]").selectOption("SMS");
    assert.equal(await contacts.locator("[name=value]").getAttribute("aria-invalid"), "true");
    await contacts.locator("[name=value]").fill("09171234567");
    assert.equal(await contacts.locator("[name=value]").getAttribute("aria-invalid"), "false");
    await close();

    await tab("Activities");
    await page.locator('[data-action="add-task"]').first().click();
    await dialog.locator("[name=title]").fill("   ");
    await dialog.locator("[name=dueAt]").fill("2020-01-01T12:00");
    await dialog.locator("[type=submit]").click();
    assert.equal(await dialog.locator("[name=title]").getAttribute("aria-invalid"), "true");
    assert.equal(await dialog.locator("[name=dueAt]").getAttribute("aria-invalid"), "true");
    await close();

    await tab("Teams");
    await page.getByRole("button", { name: "Create subteam", exact: true }).click();
    await dialog.locator("[name=name]").fill("   ");
    await dialog.locator("#team-dialog-form button").click();
    assert.equal(await dialog.locator("[name=name]").getAttribute("aria-invalid"), "true");
    await close();
    await page.getByRole("button", { name: "Invite agent", exact: true }).click();
    await dialog.locator("[name=email]").fill("agent@gmol.com");
    await dialog.locator("#team-dialog-form button").click();
    assert.equal(await dialog.locator("[name=email]").getAttribute("aria-invalid"), "true");
    await close();

    await page.getByRole("button", { name: "My profile", exact: true }).click();
    await dialog.locator("[name=currentPassword]").fill(owner.password);
    await dialog.locator("[name=newPassword]").fill("weakpass");
    await dialog.locator("[type=submit]").click();
    assert.equal(await dialog.locator("[name=newPassword]").getAttribute("aria-invalid"), "true");
    assert.equal(
      await dialog.locator("[name=confirmPassword]").getAttribute("aria-invalid"),
      "true",
    );
    await dialog.locator("[name=newPassword]").fill("CramNew9!");
    await dialog.locator("[name=confirmPassword]").fill("CramNew9!");
    assert.equal(await dialog.locator("[aria-invalid=true]").count(), 0);
    assert.equal(await dialog.locator(".password-checklist .is-met").count(), 6);
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog.locator("[name=newPassword]").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(__dirname, "../../.tmp_dashboard/password-checklist-mobile.png"),
      fullPage: true,
    });
    assert.equal(
      await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth),
      true,
    );
    await close();
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(writes, 0, "Invalid dashboard submissions must not reach the API");
    console.log(
      "PASS: client/name/phone/contact/date/team/invite/profile invalid inputs blocked before API; live password checklist and mobile layout.",
    );
  } finally {
    page.off("request", count);
  }
};
