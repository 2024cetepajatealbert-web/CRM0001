# CRAM system review — September 26, 2026

Follow-up: [Task 6 validation](TASK6_VALIDATION.md) documents the subsequently
requested strict account-domain/name policy and stronger new-password rules.
That policy supersedes the email-login behavior described in this historical review.

## Scope

Reviewed the desktop project and the latest published GitHub change, `164b3f3`
(signup names and allowed email domains). Unpushed laptop edits were unavailable
and are not covered. The review does not certify production security or a live
Messenger connection.

## Bugs corrected

- **Signup rules leaked into other features.** The shared email validator rejected
  non-Gmail/non-school addresses during login and when adding customer contact
  points. General email validation is separate again. New signup and invitations
  retain the published Gmail/school policy. Existing accounts can log in with their
  original email domain, and customer contacts can use other domains.
- **Optional middle-name mismatch.** Whitespace-only middle names now count as
  empty on both the form and server. Required names still reject blank values;
  the published letters-and-spaces rule remains intact.
- **Password truncation.** Signup accepted passwords beyond bcrypt's 72-byte
  limit. New passwords now reject excess UTF-8 bytes on the server and the signup
  form, including multibyte characters. Profile password changes use the same
  server rule. Existing login behavior is preserved to avoid locking out users.
- Contact email creation now supports the same 254-character limit as editing.

No existing account, password hash, customer record, or integration credential was
rewritten. No database migration is required for these changes.

## Regression checks

`server/scripts/check-validation.js` covers domain-policy boundaries, normalized
emails, optional names, and ASCII/multibyte password limits without a database.
It is included in `npm test`.

The fresh-install integration suite uses a uniquely named disposable database,
checks setup/migration repeatability, exercises CRUD and workspace permissions,
and tests Messenger with a mocked transport. With Playwright configured it also
checks desktop/mobile forms, password toggles, navigation and record editing.
It never sends real email or Facebook messages. Temporary QA data is removed.

## Before public hosting

1. **Replace the desktop's example JWT signing secret.** The local `.env` still
   matches the example value. A public signing secret allows forged session
   tokens. Generate a private random secret and restart the backend; existing
   sessions must log in again. This review did not silently rotate credentials.
   Do not change `CONNECTION_ENCRYPTION_KEY` casually: existing Page credentials
   depend on it. Check the laptop separately; its settings may differ.
2. **Use a dedicated MySQL application account.** This desktop currently connects
   as `root`. Give the runtime account only the permissions CRAM needs, with a
   separate administrative account for schema migrations and backups.
3. **Back up and test restoration.** GitHub contains code, not MySQL records.
   Keep database exports private and test recovery before using real client data.
4. **Complete Messenger setup separately.** Public HTTPS callbacks, Page
   subscriptions and permissions are still a deployment task. Mocked tests do
   not prove the live Meta connection works.

## Product decisions to confirm with the team

- Keep the Gmail/school-only signup restriction only if it is intentional. It
  excludes agents with company email addresses, while profile email changes
  currently accept general email addresses. If it must be a strict membership
  policy, define grandfathering and email-change rules before enforcing it there.
- Real names can contain hyphens and apostrophes. The current demo rule rejects
  those. Consider allowing them rather than treating punctuation as unsafe;
  output escaping and parameterized SQL remain necessary either way.
- Password recovery and account-email verification are separate future features.
  An allowed email domain alone does not prove someone owns that mailbox.
- Add server-side pagination/search before client and conversation counts grow;
  the workspace currently loads whole client/task collections.

These are proposals, not extra features added during this review.
