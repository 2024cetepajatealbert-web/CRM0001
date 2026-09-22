const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async (page, base) => {
  await page.goto(base);
  await page.locator('.header-auth .open-signup').click();
  const signup = page.locator('#signup-form');
  for (const id of ['signup-password', 'signup-confirm-password']) {
    const input = page.locator('#' + id), toggle = signup.locator(`[aria-controls="${id}"]`);
    await input.fill('Temporary-UI-password');
    assert.equal(await input.getAttribute('type'), 'password');
    await toggle.click(); assert.equal(await input.getAttribute('type'), 'text');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    await toggle.focus(); await page.keyboard.press('Space');
    assert.equal(await input.getAttribute('type'), 'password');
    assert.equal(await input.inputValue(), 'Temporary-UI-password');
  }
  await page.locator('#signup-password').fill(''); await page.locator('#signup-confirm-password').fill('');
  await page.screenshot({path:path.join(__dirname,'../../.tmp_dashboard/signup-eyes-desktop.png'),fullPage:true});
  await page.locator('.close-onboarding').click();
  await page.locator('.header-auth .open-login').click();
  await page.locator('[aria-controls="login-password"]').click();
  assert.equal(await page.locator('#login-password').getAttribute('type'), 'text');
  await page.locator('.close-auth').click();
  assert.equal(await page.locator('#login-password').getAttribute('type'), 'password');
  console.log('PASS: signup/confirm/login password toggles, keyboard access and re-hide on close.');
};
