// Offline regression tests: no real credentials, database writes or Meta calls.
const assert = require("node:assert/strict");
const messenger = require("../src/services/messengerService");
const errorHandler = require("../src/middleware/errorHandler");
const originalFetch = global.fetch;
const originalVersion = process.env.META_GRAPH_VERSION;
const originalKey = process.env.CONNECTION_ENCRYPTION_KEY;
const secret = "must-not-appear-in-an-error";

function publicResponse(error) {
  let status, body;
  const originalLog = console.error;
  console.error = () => {};
  try {
    errorHandler(
      error,
      {},
      {
        status(value) {
          status = value;
          return this;
        },
        json(value) {
          body = value;
        },
      },
      () => assert.fail("Unexpected next call"),
    );
  } finally {
    console.error = originalLog;
  }
  assert.ok(!JSON.stringify(body).includes(secret));
  return { status, ...body };
}

async function run() {
  process.env.META_GRAPH_VERSION = "v24.0";
  for (const [code, expected] of [
    [190, /new Page access token/],
    [200, /permissions/],
    [100, /personal or app token/],
    [4, /limiting/],
    [999, /Page token/],
  ]) {
    global.fetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { code, error_subcode: 463, message: secret } }),
    });
    await assert.rejects(messenger.graph("me?fields=id,name,category", secret), (error) => {
      assert.equal(error.providerRejected, true);
      const response = publicResponse(error);
      assert.equal(response.status, 502);
      assert.match(response.message, expected);
      assert.match(response.message, new RegExp(`Meta code ${code}, subcode 463`));
      return true;
    });
  }
  global.fetch = async () => {
    throw new Error(secret);
  };
  await assert.rejects(messenger.graph("me", secret), (error) => {
    assert.match(publicResponse(error).message, /server internet connection/);
    assert.equal(error.providerRejected, undefined);
    return true;
  });
  await assert.rejects(
    messenger.graph("123/messages", secret, { message: { text: "test" } }),
    (error) => {
      assert.match(publicResponse(error).message, /before sending again/);
      assert.equal(error.providerRejected, undefined);
      return true;
    },
  );
  global.fetch = async () => ({
    ok: true,
    json: async () => {
      throw new Error(secret);
    },
  });
  await assert.rejects(messenger.graph("me", secret), (error) =>
    /could not validate/.test(publicResponse(error).message),
  );
  global.fetch = async () => ({ ok: true, json: async () => null });
  await assert.rejects(messenger.graph("me", secret), (error) =>
    /unexpected response/.test(publicResponse(error).message),
  );
  const page = { id: "123", name: "Test Page", category: "Real estate" };
  global.fetch = async () => ({ ok: true, json: async () => page });
  assert.deepEqual(await messenger.graph("me", secret), page);
  process.env.CONNECTION_ENCRYPTION_KEY = "";
  assert.throws(
    () => messenger.encrypt({ pageToken: secret }),
    (error) => {
      const response = publicResponse(error);
      assert.equal(response.status, 503);
      assert.match(response.message, /CONNECTION_ENCRYPTION_KEY/);
      return true;
    },
  );
  process.env.META_GRAPH_VERSION = "invalid";
  await assert.rejects(messenger.graph("me", secret), (error) =>
    /META_GRAPH_VERSION/.test(publicResponse(error).message),
  );
  assert.equal(
    publicResponse(new Error(secret)).message,
    "The server could not complete that request.",
  );
  console.log(
    "PASS: safe Meta errors, network failures, configuration errors, success, and secret redaction.",
  );
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    global.fetch = originalFetch;
    if (originalVersion === undefined) delete process.env.META_GRAPH_VERSION;
    else process.env.META_GRAPH_VERSION = originalVersion;
    if (originalKey === undefined) delete process.env.CONNECTION_ENCRYPTION_KEY;
    else process.env.CONNECTION_ENCRYPTION_KEY = originalKey;
  });
