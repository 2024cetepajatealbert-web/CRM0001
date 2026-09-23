# Where CRAM saves your records

CRAM uses the existing `cramdb` MySQL database. Its seven original tables remain the core storage. The account table is named `user` (singular), not `users`.

| Original table  | How records are created                             | Edit/update in CRAM                                                                                            | Delete behavior                                                                                                                                                                         |
| --------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client`        | Add client, or first incoming Messenger inquiry     | Clients → Edit: name, email, and phone; Teams → Lead assignment                                                | Managers can delete from the client editor. Removes dependent contacts, details, tasks, conversations, and local messages in one transaction.                                           |
| `contact_point` | Client email/phone and additional contact points    | Client editor → Contact points → Edit                                                                          | Removes only that contact; synchronizes the primary email/phone display. Does not disconnect live conversation routing.                                                                 |
| `conversation`  | Signed incoming Messenger event                     | Inbox → Close/Reopen; lead reassignment updates responsible agent                                              | Managers can delete the local conversation and messages. Client and tasks remain; task-to-conversation links are cleared.                                                               |
| `message`       | Incoming event, outgoing reply, or New draft        | Saved drafts can be edited. Sent/received messages cannot be rewritten. Delivery status updates automatically. | Managers can delete local history; agents can delete their own drafts. This never unsends a Facebook message.                                                                           |
| `tasks`         | Schedule from Clients, Activities, or Inbox         | Edit title, notes, type, and due date; complete/reopen using the check button                                  | Deletes only the selected task. Inbox scheduling links it to the selected conversation.                                                                                                 |
| `teams`         | Sign-up creates a workspace; Teams creates subteams | Rename team; add/remove subteam members                                                                        | Subteam deletion moves memberships and invitations to the root workspace. Users and business records remain. Root workspace deletion is blocked.                                        |
| `user`          | Sign-up or sign-up with a private team invitation   | My profile updates names/email/password. Owners can edit member names and AGENT/MANAGER roles.                 | Only an owner may delete a non-owner account. Its work moves to the owner, sessions lose access, and historical message attribution becomes unassigned. Self/owner deletion is blocked. |

Changing your own profile requires your current password. Passwords remain bcrypt hashes. A password change increments `user.auth_version` and invalidates all existing sessions for that account. My profile never returns a password hash.

## Supporting tables are still necessary

There are currently 13 tables, all referenced by the application. Empty is not the same as unused.

| Supporting table       | Purpose                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `client_crm_details`   | Primary-contact mirror plus preserved property/budget/notes/stage/source fields, currently paused in the UI |
| `workspace_members`    | Workspace permissions and access control                                                                    |
| `team_members`         | Subteam membership; a user can participate in more than one team                                            |
| `team_invitations`     | Hashed private invitation links and expiry/acceptance state                                                 |
| `activity_log`         | History of CRM changes and actions                                                                          |
| `platform_connections` | Encrypted Page credentials, webhook routing, and connection state                                           |

Dropping these would break their features. The obsolete `email_verification_tokens` table has already been dropped. No new table was added for the record-management controls; only `user.auth_version` was added for session revocation.

## Confirmation and recovery

Destructive management dialogs describe the affected records and require typing `DELETE`. Subteam membership removal is different from deleting a user account. Contact editing/deletion does not change Messenger Page-scoped recipient identifiers stored in `conversation`.

Deletes remove actual MySQL rows. There is no recycle bin; restore from a database backup if needed. Client/conversation deletions do not erase Facebook history or block future inquiries. A later webhook can recreate deleted local data, and a provider retry can restore a locally deleted message. Deleting received messages can close the local reply window until a new client message arrives. Metrics reflect the remaining stored records.

Sending replies cannot be deleted while their status is Sending. Drafts do not affect sent-message totals or response times. Copy to reply leaves the saved draft intact; delete it separately when finished.

## Updating another installation

Back up first. Never rerun `CRAMDB.sql` over working data because it drops the database. From `server`:

```powershell
npm run migrate:dashboard
npm run migrate:workspace
npm run migrate:records
npm start
```

Restart an existing server after code changes instead of opening a second copy on port 4000.

Run `npm test` for temporary-account integration checks, including the seven original tables, permission boundaries, dependent deletes, profile changes, and session invalidation. Optional Playwright browser checks test the management controls. QA cleanup targets only the workspaces created by the test; it does not delete real records.
