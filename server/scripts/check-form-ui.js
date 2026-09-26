const assert = require("node:assert/strict");
const path = require("node:path");
module.exports = async (page, base) => {
  await page.goto(base);
  await page.locator(".header-auth .open-signup").click();
  const signup = page.locator("#signup-form");
  let submitted = 0;
  await page.route("**/api/auth/signup", async (route) => {
    submitted++;
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ message: "An account already uses this email. Please log in." }),
    });
  });
  assert.equal(
    await signup.locator("[aria-invalid=true]").count(),
    0,
    "Untouched inputs should not be red",
  );
  await signup.locator("[type=submit]").click();
  assert.equal(await signup.locator("[aria-invalid=true]").count(), 5);
  assert.equal(await page.locator("#signup-middle-name").getAttribute("aria-invalid"), "false");
  assert.equal(submitted, 0, "Invalid forms must not reach the API");
  await page.locator("#signup-first-name").fill("   ");
  assert.equal(await page.locator("#signup-first-name").getAttribute("aria-invalid"), "true");
  await page.locator("#signup-first-name").fill("Anna123");
  assert.equal(await page.locator("#signup-first-name").getAttribute("aria-invalid"), "true");
  await page.locator("#signup-first-name").fill("María José");
  await page.locator("#signup-last-name").fill("De la Cruz");
  await page.locator("#signup-middle-name").fill("   ");
  assert.equal(await page.locator("#signup-middle-name").getAttribute("aria-invalid"), "false");
  await page.locator("#signup-email").fill("not-an-email");
  assert.match(await page.locator("#signup-email-error").textContent(), /valid email/);
  await page.locator("#signup-password").fill("1234567");
  assert.match(await page.locator("#signup-password-error").textContent(), /add 1 more/);
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector("#signup-password")).borderTopColor ===
      "rgb(182, 53, 53)",
  );
  await page.locator("#signup-password").fill("12345678");
  assert.equal(await page.locator("#signup-password").getAttribute("aria-invalid"), "true");
  await page.locator("#signup-password").fill("CramTest9!");
  assert.equal(await page.locator("#signup-password").getAttribute("aria-invalid"), "false");
  assert.equal(await signup.locator(".password-checklist .is-met").count(), 6);
  for (const password of ["a".repeat(73), "é".repeat(37)]) {
    await page.locator("#signup-password").fill(password);
    assert.match(await page.locator("#signup-password-error").textContent(), /72 password bytes/);
  }
  await page.locator("#signup-password").fill("CramTest9!");
  await page.locator("#signup-confirm-password").fill("87654321");
  assert.match(await page.locator("#signup-confirm-password-error").textContent(), /don’t match/);
  await page.locator("#signup-confirm-password").fill("CramTest9!");
  assert.equal(
    await page.locator("#signup-confirm-password").getAttribute("aria-invalid"),
    "false",
  );
  await page.locator("#signup-password").fill("CramTest99!");
  assert.equal(
    await page.locator("#signup-confirm-password").getAttribute("aria-invalid"),
    "true",
    "Recheck confirmation when the original changes",
  );
  await page.locator("#signup-password").fill("CramTest9!");
  await page.locator("#signup-email").fill("existing@example.invalid");
  assert.equal(await page.locator("#signup-email").getAttribute("aria-invalid"), "true");
  await signup.locator("[type=submit]").click();
  assert.equal(submitted, 0, "Disallowed signup domains must not reach the API");
  await page.locator("#signup-email").fill("existing@gmail.com");
  await signup.locator("[type=submit]").click();
  await page.waitForFunction(() =>
    document.querySelector("#signup-email-error").textContent.includes("already has an account"),
  );
  assert.equal(submitted, 1);
  assert.equal(await page.locator("#signup-email").getAttribute("aria-invalid"), "true");
  await page.locator("#signup-email").fill("not-an-email");
  await page.locator("#signup-password").fill("short");
  await page.locator("#signup-confirm-password").fill("different");
  await page.locator("#signup-email").focus();
  await page.screenshot({
    path: path.join(__dirname, "../../.tmp_dashboard/signup-validation-desktop.png"),
    fullPage: true,
  });
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#signup-confirm-password").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(__dirname, "../../.tmp_dashboard/signup-validation-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await page.locator("#onboarding-overlay").evaluate((el) => el.scrollWidth <= el.clientWidth),
    true,
    "No horizontal overflow",
  );
  await page.setViewportSize(viewport);
  await page.unroute("**/api/auth/signup");
  for (const id of ["signup-password", "signup-confirm-password"]) {
    const input = page.locator("#" + id),
      toggle = signup.locator(`[aria-controls="${id}"]`);
    await input.fill("Temporary-UI-password");
    assert.equal(await input.getAttribute("type"), "password");
    await toggle.click();
    assert.equal(await input.getAttribute("type"), "text");
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    await toggle.focus();
    await page.keyboard.press("Space");
    assert.equal(await input.getAttribute("type"), "password");
    assert.equal(await input.inputValue(), "Temporary-UI-password");
  }
  await page.locator("#signup-password").fill("");
  await page.locator("#signup-confirm-password").fill("");
  await page.screenshot({
    path: path.join(__dirname, "../../.tmp_dashboard/signup-eyes-desktop.png"),
    fullPage: true,
  });
  await page.locator(".close-onboarding").click();
  await page.locator(".header-auth .open-login").click();
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Invalid email or password." }),
    }),
  );
  await page.locator("#login-email").fill("person@gmol.com");
  assert.equal(await page.locator("#login-email").getAttribute("aria-invalid"), "true");
  await page.locator("#login-email").fill("person@gmail.com");
  await page.locator("#login-password").fill("wrong-password");
  await page.locator("#login-form [type=submit]").click();
  await page.waitForFunction(() =>
    document.querySelector("#login-form .error").textContent.includes("couldn’t sign you in"),
  );
  assert.equal(await page.locator("#login-form [aria-invalid=true]").count(), 2);
  await page.screenshot({
    path: path.join(__dirname, "../../.tmp_dashboard/login-validation-desktop.png"),
    fullPage: true,
  });
  await page.locator("#login-password").fill("changed-password");
  assert.equal(await page.locator("#login-form [aria-invalid=true]").count(), 0);
  assert.equal(await page.locator("#login-form .error").textContent(), "");
  await page.unroute("**/api/auth/login");
  await page.route("**/api/auth/login", (route) => route.abort());
  await page.locator("#login-form [type=submit]").click();
  await page.waitForFunction(() =>
    document.querySelector("#login-form .error").textContent.includes("Cannot reach"),
  );
  assert.equal(
    await page.locator("#login-form [aria-invalid=true]").count(),
    0,
    "A network failure is not an invalid field",
  );
  await page.unroute("**/api/auth/login");
  await page.locator('[aria-controls="login-password"]').click();
  assert.equal(await page.locator("#login-password").getAttribute("type"), "text");
  await page.locator(".close-auth").click();
  assert.equal(await page.locator("#login-password").getAttribute("type"), "password");
  await page.locator(".header-auth .open-login").click();
  assert.equal(await page.locator("#login-form .error").textContent(), "");
  await page.locator(".close-auth").click();
  console.log(
    "PASS: inline required/email/password/match validation, error recovery, duplicate email, safe login feedback, network errors and responsive layout.",
  );
  console.log("PASS: signup/confirm/login password toggles, keyboard access and re-hide on close.");
};
