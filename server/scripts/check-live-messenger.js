// Read-only Graph calls. --import explicitly permits saving fetched chats locally.
require("dotenv").config({ path: require("node:path").join(__dirname, "../.env") });
const db = require("../src/config/database");
const messenger = require("../src/services/messengerService");
const sync = require("../src/services/messengerSync");
const PublicError = require("../src/utils/publicError");
async function run() {
  const pages = await db.query("SELECT * FROM platform_connections WHERE credentials<>''");
  console.log(`Saved Page connections: ${pages.length}. No outgoing messages will be sent.`);
  for (const page of pages) {
    try {
      const credentials = messenger.decrypt(page.credentials);
      const remote = await messenger.graph("me?fields=id,name,category", credentials.pageToken);
      if (String(remote.id) !== String(page.page_id))
        throw new PublicError("Saved token belongs to a different Page; reconnect in CRAM.");
      console.log(`Connection #${page.id}: Page token validated.`);
      if (process.argv.includes("--import")) {
        const result = await sync.syncPage(page);
        console.log(JSON.stringify({ connectionId: page.id, ...result }));
      }
    } catch (error) {
      console.log(
        `Connection #${page.id}: ${error instanceof PublicError ? error.message : "Could not read or decrypt saved connection. Check server configuration."}`,
      );
      process.exitCode = 1;
    }
  }
}
run()
  .catch((error) => {
    console.error(error.code || "Connection check failed.");
    process.exitCode = 1;
  })
  .finally(() => db.close());
