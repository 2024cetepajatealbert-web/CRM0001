# Connect CRAM to Facebook Messenger

Clients message your Facebook **Page**. Agents read and reply in CRAM Inbox.
CRAM does not connect to your personal Facebook inbox. A saved customer contact
alone is not a live Messenger conversation.

## Start locally (no public tunnel needed for pull sync)

1. Start MySQL and run `npm run dev` from `server`. Open http://localhost:4000.
2. Log in as a workspace owner/manager and open **Connect → Facebook**.
3. In Meta's app dashboard, open your Messenger use case → Messenger API Settings.
   Generate a **Page access token** beside the correct Page, not a User/App token.
4. Put that token and the same Meta app's App Secret into CRAM. Click **Validate & save Page**.
   Keep both private. Never paste them into GitHub, chat, browser URLs or screenshots.
5. On the saved Page card click **Sync now**. CRAM imports accessible conversation
   history into the existing client/contact/conversation/message tables. Repeated
   imports skip duplicate message IDs.
6. Open **Inbox**. Use **Import earlier messages from Facebook** for older history.
   Use **Match to existing client** if an imported person already has a client record;
   it moves this conversation and linked tasks, without deleting either client.
7. Optionally enable **automatic sync** on the Page card. While Inbox is open and
   visible, a manager checks one enabled Page approximately every 30 seconds;
   an agent checks their selected assigned conversation. Close/hide CRAM or
   disconnect the internet and polling stops. This is not a background service.

Each sync batch imports up to 10 conversations and 50 recent messages per
conversation. Click Sync now again if more conversations remain. History is
loaded in bounded pages, not an unlimited one-click export. Attachments are
displayed only from allowed HTTPS Meta domains; unavailable media stays a placeholder.
Media URLs can expire. Outgoing attachments are not implemented.

Replies use Meta's Send API and the normal 24-hour reply window. CRAM displays
Sent only after confirmation; Failed and Unknown are distinct. **Unknown** means
check the Page Inbox before retrying—network timeouts can occur after delivery.
Do not interpret imported Page messages as a particular CRAM agent's work;
agent attribution/response metrics are recorded for confirmed CRAM replies.

## Permissions and testing

Meta's Conversations API documentation lists `pages_manage_metadata`,
`pages_read_engagement` and `pages_messaging`. Page access and app roles also matter.
Access to people outside the permitted testing roles can require Advanced Access
and App Review. A valid token alone does not guarantee access to all conversations.

Sources: [Meta Conversations API](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a)
and [Meta Send API](https://www.postman.com/meta/messenger-platform-api/folder/vilwbh4/send-api).

## Optional webhooks (push new messages immediately)

1. Deploy CRAM behind public HTTPS or deliberately start a temporary HTTPS tunnel.
   A path such as `/api/messenger/webhook/...` or `localhost:4000` alone is not public.
2. Set `PUBLIC_BASE_URL` in `server/.env` to the public HTTPS origin and restart CRAM.
3. In Connect, click **Show webhook details** for the saved Page. Copy its complete
   HTTPS callback URL and reveal/copy its **verify token** into Meta's Configure webhooks form.
   The verify token is different from the Page access token and App Secret.
4. Click Verify and save in Meta. Subscribe the Page to `messages` and
   `message_echoes` for the events CRAM stores. Signature checks use the App Secret.
5. A verification timestamp only proves the handshake succeeded. It does not prove
   subscriptions, permissions or live incoming/outgoing delivery work. Test separately.

Refreshing a saved Page token keeps its webhook path/verify token stable. If a verify
token was exposed, arrange a deliberate credential rotation; don't publish it again.
Pull sync and webhooks can coexist: message-ID deduplication prevents duplicate rows.
This task did not open a tunnel, publish the app or change Meta subscriptions.

## Optional email (separate from Messenger)

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`
and `PUBLIC_BASE_URL` privately in `.env`, using your email provider's actual settings.
Use an address reachable by the recipient for PUBLIC_BASE_URL; localhost links only
work on the same computer. Use HTTPS for deployment. Restart after changes.

- **Invite agent:** explicitly tick the email option to send an invitation, or copy
  the private link manually. A delivery failure leaves the manual link available.
- **Forgot your password:** sends a 30-minute reset link when email is configured.
  Only its hash is stored on the user row. Successful use clears it and invalidates
  existing sessions. No signup verification-code table has been reintroduced.

Without SMTP, normal signup/login and manual invitation links still work.
The application cannot recover an original password from its hash.

## Local diagnostics

From `server`, `node scripts/check-live-messenger.js` checks saved Page tokens.
Add `--import` only when you intend to save fetched chats locally. Neither mode sends
replies or prints credentials/message text. The expired token found on 2026-10-23
was subsequently replaced: the owner confirmed two-way messaging and persistence,
and a read-only token check passed on 2026-11-06. If Meta returns **190 / 463** again,
generate a new Page token and save it in Connect before retrying.
