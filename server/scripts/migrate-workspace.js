require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const db = require("../src/config/database");
async function add(table, name, definition) {
  const cols = await db.query(`SHOW COLUMNS FROM \`${table}\``);
  if (!cols.some((c) => c.Field === name))
    await db.query(`ALTER TABLE \`${table}\` ADD \`${name}\` ${definition}`);
}
async function migrate() {
  await add("user", "workspace_id", "INT NULL");
  await add("teams", "workspace_id", "INT NULL");
  await add("client", "workspace_id", "INT NULL");
  await add("client", "created_by", "INT NULL");
  await add("client", "contacted_at", "DATETIME NULL");
  await db.query(`CREATE TABLE IF NOT EXISTS workspace_members (workspace_id INT NOT NULL, user_id INT NOT NULL,
    role ENUM('OWNER','MANAGER','AGENT') NOT NULL DEFAULT 'AGENT', joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(workspace_id,user_id), FOREIGN KEY(workspace_id) REFERENCES teams(teams_id), FOREIGN KEY(user_id) REFERENCES user(user_id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS team_members (team_id INT NOT NULL,user_id INT NOT NULL,PRIMARY KEY(team_id,user_id),
    FOREIGN KEY(team_id) REFERENCES teams(teams_id),FOREIGN KEY(user_id) REFERENCES user(user_id))`);
  const teams = await db.query("SELECT teams_id,teams_teams_id FROM teams");
  function root(id) {
    const seen = new Set();
    while (teams.find((t) => t.teams_id === id)?.teams_teams_id) {
      if (seen.has(id)) throw Error("Circular team hierarchy");
      seen.add(id);
      id = teams.find((t) => t.teams_id === id).teams_teams_id;
    }
    return id;
  }
  for (const t of teams)
    await db.query("UPDATE teams SET workspace_id=? WHERE teams_id=? AND workspace_id IS NULL", [
      root(t.teams_id),
      t.teams_id,
    ]);
  const users = await db.query(
    "SELECT user_id,teams_teams_id,role,workspace_id FROM user ORDER BY user_id",
  );
  for (const u of users) {
    const wid = root(u.teams_teams_id);
    const group = users.filter((x) => root(x.teams_teams_id) === wid);
    const owner = group.find((x) => ["ADMIN", "TL"].includes(x.role)) || group[0];
    await db.query("UPDATE user SET workspace_id=? WHERE user_id=? AND workspace_id IS NULL", [
      wid,
      u.user_id,
    ]);
    await db.query(
      "INSERT IGNORE INTO workspace_members (workspace_id,user_id,role) VALUES (?,?,?)",
      [
        wid,
        u.user_id,
        u.user_id === owner.user_id
          ? "OWNER"
          : ["ADMIN", "TL"].includes(u.role)
            ? "MANAGER"
            : "AGENT",
      ],
    );
    if (u.workspace_id === null)
      await db.query("INSERT IGNORE INTO team_members (team_id,user_id) VALUES (?,?)", [
        u.teams_teams_id,
        u.user_id,
      ]);
  }
  await db.query(
    "UPDATE client c JOIN user u ON u.user_id=c.user_user_id SET c.workspace_id=u.workspace_id,c.created_by=c.user_user_id WHERE c.workspace_id IS NULL",
  );
  await db.query(`CREATE TABLE IF NOT EXISTS team_invitations (id INT AUTO_INCREMENT PRIMARY KEY,workspace_id INT NOT NULL,team_id INT NOT NULL,
    email VARCHAR(80) NOT NULL,token_hash CHAR(64) NOT NULL UNIQUE,invited_by INT NOT NULL,expires_at DATETIME NOT NULL,accepted_at DATETIME NULL,
    FOREIGN KEY(workspace_id) REFERENCES teams(teams_id),FOREIGN KEY(team_id) REFERENCES teams(teams_id),FOREIGN KEY(invited_by) REFERENCES user(user_id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS activity_log (id BIGINT AUTO_INCREMENT PRIMARY KEY,workspace_id INT NOT NULL,client_id INT NULL,
    actor_id INT NULL,description VARCHAR(255) NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX activity_workspace(workspace_id,created_at),FOREIGN KEY(workspace_id) REFERENCES teams(teams_id),FOREIGN KEY(client_id) REFERENCES client(client_id))`);
  await db.query("ALTER TABLE contact_point MODIFY contact_info VARCHAR(255) NULL");
  const indexes = await db.query("SHOW INDEX FROM contact_point");
  // Keep an index available for the client foreign key throughout the migration.
  if (!indexes.some((i) => i.Key_name === "uq_contact_value"))
    await db.query(
      "ALTER TABLE contact_point ADD UNIQUE KEY uq_contact_value (client_id,contact_type,contact_info)",
    );
  if (indexes.some((i) => i.Key_name === "uq_client_contact_type"))
    await db.query("ALTER TABLE contact_point DROP INDEX uq_client_contact_type");
  await db.query(
    `INSERT IGNORE INTO contact_point (client_id,contact_type,contact_info) SELECT client_id,'Email',email FROM client_crm_details WHERE email<>''`,
  );
  await db.query(
    `INSERT IGNORE INTO contact_point (client_id,contact_type,contact_info) SELECT client_id,'Phone',phone FROM client_crm_details WHERE phone<>''`,
  );
  await db.query(`CREATE TABLE IF NOT EXISTS platform_connections (id INT AUTO_INCREMENT PRIMARY KEY,workspace_id INT NOT NULL,
    platform VARCHAR(20) NOT NULL DEFAULT 'Messenger',page_id VARCHAR(255) NOT NULL UNIQUE,page_name VARCHAR(255) NOT NULL,
    credentials TEXT NOT NULL,webhook_key CHAR(48) NOT NULL UNIQUE,status VARCHAR(40) NOT NULL DEFAULT 'Awaiting webhook',
    created_by INT NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,last_event_at DATETIME NULL,
    FOREIGN KEY(workspace_id) REFERENCES teams(teams_id),FOREIGN KEY(created_by) REFERENCES user(user_id))`);
  await add("conversation", "connection_id", "INT NULL");
  await add("conversation", "status", "VARCHAR(15) NOT NULL DEFAULT 'Open'");
  await add("conversation", "last_message_sender_type", "VARCHAR(15) NULL");
  await add("conversation", "last_incoming_at", "DATETIME NULL");
  await add("conversation", "unread_count", "INT NOT NULL DEFAULT 0");
  for (const name of ["access_token", "page_id", "conversation_id_ext", "client_psid"])
    await db.query(`ALTER TABLE conversation MODIFY ${name} VARCHAR(255) NULL`);
  for (const name of [
    "token_refreshed_at",
    "page_created_at",
    "last_message_at",
    "last_message_who",
  ])
    await db.query(`ALTER TABLE conversation MODIFY ${name} DATETIME NULL`);
  const convIndex = await db.query("SHOW INDEX FROM conversation");
  if (!convIndex.some((i) => i.Key_name === "uq_channel_recipient"))
    await db.query(
      "ALTER TABLE conversation ADD UNIQUE KEY uq_channel_recipient (connection_id,client_psid)",
    );
  await add("message", "sender_user_id", "INT NULL");
  await add("message", "provider_message_id", "VARCHAR(255) NULL");
  await add("message", "request_id", "CHAR(36) NULL");
  await add("message", "response_seconds", "INT NULL");
  await add("message", "error_message", "VARCHAR(255) NULL");
  await db.query("ALTER TABLE message MODIFY sent_at DATETIME NULL");
  const msgIndex = await db.query("SHOW INDEX FROM message");
  if (!msgIndex.some((i) => i.Key_name === "uq_provider_message"))
    await db.query(
      "ALTER TABLE message ADD UNIQUE KEY uq_provider_message (conversation_conversation_id,provider_message_id)",
    );
  if (!msgIndex.some((i) => i.Key_name === "uq_send_request"))
    await db.query(
      "ALTER TABLE message ADD UNIQUE KEY uq_send_request (conversation_conversation_id,request_id)",
    );
  console.log(
    "Shared workspace, contact points, activities and Inbox schema ready. Existing records preserved.",
  );
}
migrate()
  .catch((e) => {
    console.error(e.code || e.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
