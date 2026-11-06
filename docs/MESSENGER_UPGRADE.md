# CRAM Messenger and security upgrade — 2026-10-23

## Follow-up — 2026-11-06

The owner subsequently confirmed live incoming messages, replies from CRAM and
client/conversation persistence after signing back in. A fresh read-only Page-token
check passed, resolving the expired-token finding recorded below. Today's check
did not send messages or import conversations. Public webhooks remain unverified,
and SMTP is not configured on this desktop.

The runtime dependency audit identified advisories in `body-parser` 1.20.8 and
`qs` 6.16.0. Compatible updates installed `body-parser` 1.20.9 and `qs` 6.16.2 in
the committed lockfile. The subsequent production audit reported zero known
vulnerabilities. This is not a guarantee against undiscovered vulnerabilities or
a production-security certification.

After the patches, the full disposable-database suite and Chrome desktop/mobile
tests passed again, along with formatting, validation, API routing and safe-error
checks. Existing CRAM records were not changed. The temporary test database and
its test workspaces were removed at the end of the run.

References: [body-parser advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828)
and [qs advisory](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw).

## Implemented

- Adapted conversation/history import to CRAM's existing workspace permissions and
  encrypted Page credentials. The leader's application, database export and secrets
  were not copied over the project.
- Added bounded, repeatable Facebook sync; automatic sync is opt-in while Inbox is
  open, not a hidden background worker. Existing webhooks remain supported.
- Added attachment previews/links from allowed HTTPS Meta hosts, earlier-history
  controls, and manager-only matching of a conversation to an existing client.
- Fixed chronological message pagination and a race where an incoming Page echo
  could make a successful send return the wrong local message ID. Unknown delivery
  remains distinct from an explicit provider rejection.
- Added manager-only webhook-detail reveal, masked verify-token fields and stable
  webhook credentials when refreshing a saved Page token.
- Added optional SMTP invitation delivery and password recovery. Reset tokens are
  hashed, expire after 30 minutes, are single-use and revoke existing login sessions.
  Signup still works without verification email. No OTP table was restored.
- Fixed form validation moving the submit button during a click; preserved the
  simplified five-item password checklist and existing validation policy.
- Added database-aware health reporting, no-store API responses, basic security
  headers, rejection of an example JWT signing secret, and clearer port-conflict errors.

## Applied to this desktop

- Created a private pre-change SQL backup under ignored `private-backups/`.
- Replaced the example JWT signing secret. Sign in again after restarting.
- Created a dedicated local MySQL runtime account with SELECT/INSERT/UPDATE/DELETE
  on CRAMDB only. Root was not changed or deleted; migration/backup settings are in
  ignored `server/.env.admin`. Runtime settings remain in ignored `server/.env`.
- Verified runtime privileges and applied the additive migrations. CRAMDB still has
  13 tables; existing tables/records and the Page encryption key were preserved.
- Added columns to existing `user`, `conversation`, `message` and
  `platform_connections` tables. No new tables were needed.

## Verification and limits

Passed the fresh-install suite with a uniquely named disposable database, repeated
migrations, workspace/role isolation, CRUD, webhook signatures, duplicate imports,
history pagination, echo/send race and mocked invitation/recovery delivery.
Chrome desktop/mobile checks passed for authentication feedback, visibility
controls, navigation, client/task/team/profile edits, Inbox, Connect sync and
private webhook details, recovery links and responsive layouts.

The real local `/api/health` returned healthy with MySQL connected using the restricted
account. The live Facebook check found one saved connection whose token Meta rejected
with **190 / 463**. Import did not proceed. No live outgoing Facebook message or email
was sent. Mocked sends prove application behavior, not live Meta delivery.

## Original next steps (see follow-up above)

1. Generate a new Page access token beside CRAM Demo, save it in Connect, and click
   Sync now. Keep the token/App Secret private. Check app permissions/roles if Meta
   refuses history access after the token is refreshed.
2. Use a separately authorized test conversation to verify an actual outgoing reply.
   This task was authorized for connection checks/import only, not a live send.
3. Configure SMTP only if email invitations/recovery are wanted. Live delivery is
   untested; manual invitation links and existing signup/login work without it.
4. Public hosting still needs HTTPS, deployment review, appropriate Meta access,
   tested backups/restoration and operational monitoring. Webhooks were not exposed
   publicly or verified against Meta in this upgrade.

AI summaries/scheduling, a React rewrite, TikTok messaging, outgoing media uploads,
large-dataset pagination of all dashboard records and a background job queue are
outside this focused upgrade. The existing dashboard is retained. Credentials,
private backups and database records are not part of the GitHub update.

See [Messenger setup](MESSENGER_SETUP.md) and [laptop setup](LAPTOP_SETUP.md).
