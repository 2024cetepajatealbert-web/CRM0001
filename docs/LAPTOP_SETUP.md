# CRAM laptop setup and offline presentation

## 1. Prepare while connected to the internet

Install Git, Node.js 24 LTS (includes npm), MySQL Community Server 8.0 or 8.4,
and VS Code. MySQL Workbench is optional: it is a management app, not the database server.
Remember the MySQL username/password you set on THIS laptop.

Official downloads: [Git](https://git-scm.com/downloads), [Node.js](https://nodejs.org/en/download),
[MySQL Community](https://dev.mysql.com/downloads/), [VS Code](https://code.visualstudio.com/download).

Open a VS Code PowerShell terminal in the folder where you want the project:

```powershell
git clone https://github.com/2024cetepajatealbert-web/CRM0001.git
cd CRM0001\server
npm install
npm run setup:env
```

The folder is **CRM0001** (the repository name), which differs from the desktop's
existing **CRM001** folder. A clone is needed only once.

`setup:env` creates a private `.env` with random signing and encryption keys.
It never overwrites an existing `.env`.

## 2. Configure your laptop's MySQL connection

Open `server/.env` in VS Code. Set these values to match your laptop:

```ini
PORT=4000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=cram_presentation
DB_USER=root
DB_PASSWORD="YOUR_LAPTOP_MYSQL_PASSWORD"
```

Replace the password placeholder; quote passwords containing `#` or spaces.
Keep the generated JWT_SECRET and CONNECTION_ENCRYPTION_KEY private and unchanged.
Do not copy credentials from screenshots or publish your `.env`.
Using a separate `cram_presentation` database keeps other projects separate.

Start the MySQL Windows service (Windows Services app; the service name varies by installation).
The MySQL user must be allowed to create a database and tables for the initial setup.

## 3. Create an empty presentation database - once only

In the terminal inside `server`:

```powershell
npm run setup:db
```

This creates the seven empty core tables, then applies the three migrations to
prepare all current features. It contains no DROP DATABASE and imports no account
or client records. It refuses to initialize a database that already contains tables.

For an existing or privately restored CRAM database, back it up, check DB_NAME and
use `npm run migrate` instead. Do not run setup:db against your desktop's working database.
If initial setup is interrupted, do not delete tables automatically: keep the error
and inspect the partial setup, or choose a NEW empty DB_NAME and retry.

## 4. Run and create your presentation account

```powershell
npm run dev
```

Open <http://localhost:4000>. Sign up with your chosen email/password on the laptop,
then add a few fictional clients, tasks and teams for the demonstration.
There are no shared default login credentials.

Your desktop account does NOT automatically appear: GitHub transfers code, not MySQL records.
The same email can be used for a new account in the laptop's separate database.

## 5. If you need the exact desktop accounts and records

Use MySQL Workbench's Data Export on the desktop for the CRAM schema, including
structure and data. Transfer the export privately using a trusted USB drive or
encrypted storage, then import it into a separate database on the laptop.
Do not commit or push this export; it may contain personal data, password hashes
and encrypted integration credentials. Keep backups outside the repository or in
the ignored `private-backups` folder.

Point the laptop's DB_NAME to the imported database and run `npm run migrate`,
not `setup:db`. Existing account passwords will still work after a fresh login.
For saved Messenger credentials to decrypt, the original CONNECTION_ENCRYPTION_KEY
must also be transferred privately. Messenger is not needed for this presentation;
do not rotate an existing encryption key without planning to reconnect its Pages.

## 6. Every presentation/startup after setup

Start MySQL, open VS Code's terminal in this clone's `server` folder, then run:

```powershell
npm run dev
```

Keep the terminal open and use <http://localhost:4000>. No Live Server, tunnel,
Meta review or internet is needed for local authentication and CRUD once dependencies
are installed. Facebook message delivery and GitHub updates still require internet.

Press Ctrl+C in the running terminal to stop CRAM. Starting the app does not reset records.
Disconnect Wi-Fi and rehearse once: sign in, reject invalid input, add/edit a client,
refresh to demonstrate persistence, cancel deletion, then confirm deletion.

## 7. Download later code updates

Stop the server with Ctrl+C, then from the clone's root:

```powershell
git status
git pull --ff-only origin main
cd server
npm install
npm run dev
```

If you edited files locally and Git refuses, stop and review the changes. Never
use reset --hard or force-push just to make the error disappear. If an update
specifically includes schema changes, back up the database and run `npm run migrate`
before restarting. Pulling code does not synchronize the two computers' databases.

## Troubleshooting

- **EADDRINUSE / port 4000:** another server is running. Use it, or stop its terminal first.
- **Cannot reach backend:** MySQL and the Express terminal must both stay running.
- **Access denied:** check the laptop's MySQL user/password in `.env`.
- **Unknown database / missing table:** check DB_NAME and complete the appropriate setup/migration.
- **Old UI:** press Ctrl+F5. Sign out/in if needed. Do not reinitialize MySQL.
- **Forgot password:** password hashes cannot be read back as passwords. Do not copy a hash into Login.

## Formatting and tests

From `server`:

```powershell
npm run format
npm run format:check
npm test
```

Formatting uses two-space indentation, multiline blocks and consistent spacing.
Some HTML templates or SQL query strings may still contain long text; they are strings,
not compressed application logic. Tests create and clean their own temporary QA
workspaces; Meta calls are mocked and no real Facebook messages are sent.
