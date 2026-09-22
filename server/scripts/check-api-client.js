// Offline regression checks; no real accounts, network calls, or database writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../CRM001/js/api.js'), 'utf8');
const authSource = fs.readFileSync(path.join(__dirname, '../../CRM001/js/script.js'), 'utf8');
const corsOptions = require('../src/config/corsOptions');
const success = () => ({ ok: true, status: 200, headers: { get: () => 'application/json; charset=utf-8' }, json: async () => ({ ok: true }) });

async function run() {
  for (const [url, expected] of [
    ['http://127.0.0.1:5500/CRM001/index.html', 'http://127.0.0.1:4000'],
    ['http://localhost:5500/index.html', 'http://localhost:4000'],
    ['http://localhost:4000/', ''],
    ['http://localhost:4088/', ''],
    ['https://cram.example/', ''],
    ['https://cram.example:5500/', ''],
  ]) {
    const calls = [];
    const context = vm.createContext({ location: new URL(url), window: {}, document: { addEventListener() {} }, fetch: async (...args) => { calls.push(args); return success(); } });
    vm.runInContext(source, context);
    vm.runInContext(authSource + '; globalThis.authForTest = new AuthApi();', context);
    await context.authForTest.login({ email: 'test@example.invalid', password: 'test-only-password' });
    await context.authForTest.signup({ email: 'test@example.invalid' });
    await context.window.cramApi.request('/api/crm/workspace', { headers: { Authorization: 'Bearer test-only' } });
    assert.equal(calls[0][0], expected + '/api/auth/login');
    assert.equal(calls[1][0], expected + '/api/auth/signup');
    assert.equal(calls[2][0], expected + '/api/crm/workspace');
    assert.equal(calls[0][1].credentials, 'include');
    assert.equal(calls[2][1].headers.Authorization, 'Bearer test-only');
    context.fetch = async () => { throw new Error('Technical network error'); };
    await assert.rejects(context.authForTest.login({}), /Start it with npm run dev/);
    context.fetch = async () => ({ ...success(), headers: { get: () => 'text/html' } });
    await assert.rejects(context.authForTest.login({}), /unexpected server response/);
    context.fetch = async () => ({ ...success(), json: async () => { throw new SyntaxError('Unexpected end of JSON input'); } });
    await assert.rejects(context.authForTest.login({}), /unexpected server response/);
    context.fetch = async () => ({ ...success(), ok: false, status: 401, json: async () => ({ message: 'Invalid email or password.' }) });
    await assert.rejects(context.authForTest.login({}), /Invalid email or password/);
  }
  const fileContext = vm.createContext({ location: new URL('file:///C:/CRAM/index.html'), window: {}, fetch: () => assert.fail('File mode must not send credentials') });
  vm.runInContext(source, fileContext);
  await assert.rejects(fileContext.window.cramApi.request('/api/auth/login'), /not directly as an HTML file/);
  for (const mode of ['development', 'production']) {
    const options = corsOptions({ NODE_ENV: mode, CLIENT_ORIGIN: 'https://cram.example', PORT: '4000' });
    // Capture the callback result, not the middleware return value.
    const allowed = origin => { let value; options.origin(origin, (err, result) => { assert.equal(err, null); value = result; }); return value; };
    assert.equal(allowed('http://127.0.0.1:5500'), mode === 'development');
    assert.equal(allowed('http://localhost:5500'), mode === 'development');
    assert.equal(allowed('https://cram.example'), true);
    assert.equal(allowed('https://untrusted.example'), false);
    assert.equal(allowed('null'), false);
  }
  console.log('PASS: Live Server and same-origin API routing, login/signup, safe errors, and restricted development CORS.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
