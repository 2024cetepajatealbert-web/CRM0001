# CRAM MySQL and authentication setup

For step-by-step instructions on a different computer, follow [Laptop Setup](LAPTOP_SETUP.md).

## Current stack

| Layer    | Technology               |
| -------- | ------------------------ |
| Client   | HTML, CSS and JavaScript |
| Backend  | Express on Node.js       |
| Database | MySQL 8.0/8.4            |

This version does not use React, MongoDB or Mongoose.

## New installation

From `server`, run `npm install` and `npm run setup:env`. Edit the private `.env`
with this computer's MySQL settings. Quote DB_PASSWORD if it includes `#` or spaces.
Start MySQL, then run `npm run setup:db` for an EMPTY database and `npm run dev`.
Open <http://localhost:4000> and create an account.

The committed `server/sql/001_base.sql` contains only the seven empty core tables;
`server/sql/002_dashboard.sql` adds dashboard storage. The setup command also runs
workspace and record migrations. There are no default accounts or passwords.

## Existing database

Back up first. Keep your current `.env`, DB_NAME and connection encryption key.
Apply schema upgrades with `npm run migrate`; start normally with `npm run dev`.
Do not initialize or import a database just to restart the website.

The old local `CRAMDB.sql` export is excluded from GitHub. It contains destructive
DROP statements and records. Never rerun it against your working database.

## Connection and security

`server/src/config/database.js` manages a MySQL pool, prepared statements and
transactions. Account passwords are bcrypt hashes, not recoverable plaintext.
The API uses JWT sessions; `.env` must have a strong random JWT_SECRET.
The setup:env command generates one for a new installation but never changes an
existing file. A password or JWT signing-key change requires a fresh login.

The CONNECTION_ENCRYPTION_KEY protects saved Messenger credentials. Preserve it
with your private backups; changing it makes existing encrypted connections unreadable.
Never commit `.env`, personal data, database exports, tokens or App Secrets.

The frontend uses the API when served by Express on port 4000 or by local VS Code
Live Server on port 5500. The Express backend must run in both cases.
