# CRAM workspace guide

Open `http://localhost:4000` and log in. Clients contact your Facebook Page in Messenger; only staff use CRAM accounts. There is no client application or website-chat registration flow.

## Screens

- **Overview:** saved clients, open conversations, contact coverage, and scheduled work. New workspaces start empty, without demo clients or invented metrics.
- **Clients:** All, Uncontacted, Follow-up, and Recently added (7 days). Names open Inbox; Add/Edit captures first/middle/last names, phone, and email. Existing clients also have multiple contact-point controls. Offline clients do not get artificial conversations. Lead source, stage, budget, property interest, qualification notes, and their related pipeline displays are paused in the UI. Existing database values remain intact when saving the simplified form.
- **Inbox:** conversations, platform tabs for existing conversations, text replies, read counts, open/closed status, earlier messages, and client-specific tasks. Checks every 5 seconds while visible. Messenger is the only implemented external messaging provider.
- **Activities:** calendar, upcoming/overdue tasks, appointments, completed tasks, and activity history. Calendar events and client names open Inbox. Team filtering uses the task's assigned agent. Reminders appear while the workspace is open, not as background/push notifications.
- **Teams:** members with assigned-client lists and metrics, subteams, member add/remove, lead assignment, and invitation links. Removing subteam membership does not delete the account or remove workspace access. Reassignment moves pending tasks and conversations; completed tasks retain the original agent.
- **Analytics:** total clients, open conversations, response time, tasks due today, message volume by platform, agent task completion, engagement groups, and stale open conversations. Average response measures the interval between the preceding client message and a reply sent through CRAM; unanswered messages and external Page replies without a CRAM agent identity are excluded. Message volume covers 30 days; agent performance is all-time. Engagement groups use contact history and task/activity dates, not sales stages.
- **Connect:** save a Facebook Page connection securely. TikTok is informational, not a working messaging integration. Saving a WhatsApp/SMS/TikTok contact does not enable sending through that provider.

New Messenger inquiries receive an editable placeholder name such as “Messenger contact 6789”; CRAM does not invent a person's real name. They are assigned to the manager who connected the Page. There is currently no merge tool for matching an incoming Messenger contact to an existing offline lead.

## Permissions and invitations

Workspace OWNER/MANAGER accounts see workspace clients and can manage teams, assignments, invitations, and connections. AGENT accounts see assigned clients, their tasks and conversations, and their own performance. Server-side scope checks protect records independently of the UI. Existing accounts are grouped by their original root team during migration; separate new sign-ups create separate workspaces.

Use **Teams → Invite agent**, enter a new agent's email, and privately share the generated link. It expires after 7 days and is stored only as a hash. The recipient signs up with the matching email and joins the selected workspace/subteam. Existing accounts cannot yet be moved into a workspace by invitation. CRAM does not send invitation emails or verification codes. For remote teammates, use the deployed site's address, not localhost.

## Safe database setup

Keep the existing database. **Do not reimport `server/sql/CRAMDB.sql` over working data; it drops the database.** Back up before applying migrations on another installation.

From `server`:

```powershell
npm run migrate:dashboard
npm run migrate:workspace
npm run migrate:records
npm start
```

Migrations preserve records and can be rerun. The workspace migration adds workspace scoping, memberships, invitations, activity logs, encrypted platform connections, message delivery identifiers, and conversation metadata. Primary email/phone remain in `client_crm_details`; additional contacts live in `contact_point`. Messages and tasks use the original `message`, `conversation`, and `tasks` tables.

The unused `cramdb.email_verification_tokens` table was explicitly dropped on this installation after confirming it was empty. The workspace migration does not recreate it. Other installations can remove it separately after confirming no application uses it:

```sql
DROP TABLE IF EXISTS cramdb.email_verification_tokens;
```

## Connect real Messenger messages

1. Set up a Meta app and Facebook Page you control. Obtain a **Page access token** with required messaging permissions, including `pages_messaging`, and the app secret. Follow the [official Messenger API documentation](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api). Public use may require app review, business verification, and Live mode; development-mode access is restricted.
2. This local server already has a generated `CONNECTION_ENCRYPTION_KEY` in its ignored `.env`. On another machine, generate a private 32-byte hex key using the command in `.env.example`. Keep it backed up separately from the database. Tokens and app secrets are encrypted with AES-256-GCM. Never commit `.env`, post tokens in chat, or put them in frontend code.
3. In **Connect → Facebook**, enter the Page token and app secret, then select **Validate & save Page**. CRAM checks the Page identity with Meta. This does not automatically subscribe the Page.
4. Deploy the backend behind public HTTPS (or arrange an approved development HTTPS tunnel). Combine that public origin with the callback path displayed by CRAM. `localhost` is not reachable by Meta.
5. In Meta's Messenger webhook settings, enter this callback URL and the one-time **webhook verify token** CRAM displays. This token is for Meta's server handshake, not email/account verification. Subscribe the app/Page to `messages` and, where available, `message_echoes`, and complete the Page subscription in Meta.
6. Send a message to the Page from an allowed test account. The signed webhook creates the client, conversation, and message in MySQL. Open Inbox, then send a reply. The connection status becomes Connected after a valid message event arrives.

CRAM validates raw-body webhook signatures and deduplicates provider message IDs. Standard replies are allowed only within 24 hours of the client's latest incoming message. Failed delivery is displayed; ambiguous network failures are marked Unknown—check the Page Inbox before manually retrying. Request IDs prevent processing the same request twice. Existing Messenger history is not imported. Attachments appear as placeholders; view them in the Facebook Page Inbox. Sent means provider acceptance, not delivery/read receipt. Local tests do not prove real Meta credentials or permissions are configured.

Saving a connection again rotates its webhook path/verify token; update Meta's callback settings immediately. Tokens can expire or lose permissions. Connection status records received events, not continuous credential-health checks.

## API layout and testing

See [Database records guide](DATABASE_RECORDS.md) for the seven original tables, supported create/edit/delete controls, permission rules, and deletion effects. All 13 current tables are active dependencies; empty supporting tables should not be dropped.

`src/routes/crmRoutes.js` handles clients/tasks, `teamRoutes.js` handles teams/invitations/contacts, `inboxRoutes.js` handles authenticated conversations/connections/reporting, and `messengerWebhook.js` handles signed public callbacks. Shared scope checks and credentials are in `src/services/`. The frontend remains HTML/CSS/JavaScript; this change does not convert it to React.

```powershell
# From server; starts an isolated test server on 4088 and mocks Meta
npm test
```

Tests create temporary QA workspaces and remove only their own records afterward. No real messages are sent. They cover assignments, invitations, contacts, permissions, encrypted credentials, signed/duplicate webhooks, reply idempotency, and metrics. Optional browser tests use `PLAYWRIGHT_MODULE` pointing to an installed Playwright package, with `PLAYWRIGHT_CHANNEL=chrome`. They check navigation, replies, calendar links, teams, invitations, and mobile layout; screenshots go into ignored `.tmp_dashboard/`.

Before public deployment, add operational backups, production HTTPS, database least-privilege credentials, monitoring, a durable webhook queue, and a security/privacy review. Do not expose your development database or root account to the internet.
