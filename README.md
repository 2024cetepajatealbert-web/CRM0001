# CRAM setup and run guide

CRAM stores your team's clients, conversations and follow-ups in MySQL. One Node.js server runs both the website and its API.

## Start CRAM on a computer that's already set up

1. Open **Services** from the Windows Start menu and check that your MySQL service is running.
2. Open the project folder containing this guide in VS Code. Choose **Terminal → New Terminal** and run the following commands.

   ```powershell
   cd server
   npm run dev
   ```

   If the terminal is already in `server`, run just `npm run dev`.

3. Leave the terminal open and log in with your existing CRAM account. [Open CRAM](http://localhost:4000)
4. To check the database connection, look for `"database":"connected"` on the [health page](http://localhost:4000/api/health). Press **Ctrl+C** in the terminal when you're ready to stop CRAM.

## Set up a new computer

Follow these steps on the Windows computer where you want to run CRAM.

### 1. Install what you need

- **Node.js 24.x** includes npm, which installs CRAM’s dependencies. [Download Node.js](https://nodejs.org/en/download)
- **MySQL Community Server 8.0 or 8.4** stores your CRAM data. During installation, set it up as a Windows service and save the MySQL password you choose. [Download MySQL Community Server](https://dev.mysql.com/downloads/mysql/)
- **Git** lets you clone the project. If you already have the project ZIP, extract it and continue with those files. [Download Git](https://git-scm.com/downloads/)

### 2. Download CRAM and install its dependencies

Open a PowerShell terminal in the folder where you keep your projects. Clone CRAM and enter its server folder.

```powershell
git clone https://github.com/2024cetepajatealbert-web/CRM0001.git
cd .\CRM0001\server
```

If you extracted the ZIP, open its `server` folder in the terminal. Run the remaining commands from that folder.

```powershell
npm install
npm run setup:env
```

If you use pnpm, use `pnpm install --frozen-lockfile` for the install step.

### 3. Enter this computer’s MySQL settings

Open **Services** in Windows and check that MySQL is running. Then open `server/.env` in VS Code. Use the MySQL login for **this computer** and replace the password placeholder. The account needs permission to create a database and tables during setup.

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=CRAMDB
DB_USER=root
DB_PASSWORD="your MySQL password here"
```

Use your actual MySQL port and username if they differ from the example. Keep the quotes around passwords with spaces or `#`. Store your `.env` and its generated keys privately.

### 4. Choose how to set up your data

#### Start fresh

Run this once from `server`. It creates an empty CRAM database with the tables the app needs.

```powershell
npm run setup:db
```

#### Bring your existing accounts and records

Use this option if you have a full CRAM SQL backup. Import it into an empty database because the backup already contains the table definitions.

1. Copy your private `.sql` backup to the new computer. Install MySQL Workbench if needed. [Download MySQL Workbench](https://dev.mysql.com/downloads/workbench/)
2. Open MySQL Workbench, connect to MySQL on the new computer, and choose **Server → Data Import**.
3. Select **Import from Self-Contained File** and browse to your backup.
4. Under **Default Target Schema**, choose an empty `CRAMDB`. Use **New** to create it if needed. If `CRAMDB` already has records, use a separate empty schema and set `DB_NAME` to that schema in `server/.env`.
5. Click **Start Import**. Once Workbench reports success, check that `DB_NAME` matches the database where you imported the backup. [MySQL Workbench import guide](https://dev.mysql.com/doc/workbench/en/wb-admin-export-import-management.html)
6. Run the following from the `server` folder to bring the database schema up to date.

   ```powershell
   npm run migrate
   ```

If you already have an older CRAM database, back it up and run `npm run migrate` on that database. When `server/.env.admin` exists, migrations use its database settings. Check that it matches the database in `server/.env`.

To use a Messenger Page connection restored from the backup, copy the original `CONNECTION_ENCRYPTION_KEY` privately from the old computer’s `server/.env` to the new one. CRAM uses that key to read the saved Page credentials.

### 5. Start CRAM and sign in

From `server`, run the following command and leave the terminal open.

```powershell
npm run dev
```

Open CRAM in your browser. If you started fresh, choose **Sign-up** and use a Gmail or `@online.htcgsc.edu.ph` address. If you restored a backup, log in with the CRAM account from that backup. [Open CRAM](http://localhost:4000)

### Optional restricted database login

After setup, you can give CRAM its own restricted MySQL login with `npm run setup:security -- --database-user`. Run it with your local MySQL root account configured in `server/.env`. It makes a private backup first using `mysqldump`. Set `MYSQLDUMP_PATH` to the executable’s full path if it is outside the default MySQL 8.0 folder.

## Optional connections

- **Facebook Messenger.** To connect a new Page, a workspace owner or manager opens **Connect → Facebook**, enters the Page access token and the same Meta app’s secret, and selects **Validate & save Page → Sync chats now**. For webhook delivery, set `PUBLIC_BASE_URL` to your public HTTPS origin in `server/.env`, restart CRAM, then use **Show webhook settings** to copy the callback URL and verify token into Meta. Subscribe the Page to `messages` and `message_echoes`.
- **Email invitations and password resets.** In `server/.env`, fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` with your provider's settings. Set `PUBLIC_BASE_URL` to the address recipients can open and restart CRAM. Use HTTPS when sharing links beyond this computer.

After installation, signing in and managing local records also work offline while MySQL and CRAM are running.

### Mr.C, your Inbox assistant

Open **Inbox → Mr.C** and select a sample conversation. Mr.C explains what the buyer needs and suggests a follow-up for the agent to review. **Read sample chat** opens the source messages. A **Prepared example** is a prewritten brief that works with the local CRAM server, including when Gemini is unavailable.

You can also try Gemini on a fictional buyer conversation.

1. Create a key in a Google AI Studio project on the **Free Tier**. [Google AI Studio keys](https://aistudio.google.com/api-keys) · [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite)
2. Add `GEMINI_API_KEY=your_key_here` to the private `server/.env` on the CRAM computer, replacing the placeholder with your key. Restart the server with **Ctrl+C** and `npm run dev` from `server`.
3. Open **Mr.C** again. **AI-generated brief** identifies a result from Gemini 3.1 Flash-Lite. Generating it needs internet access. CRAM reuses a successful brief for that sample until the server restarts.

The server sends only the built-in fictional chat. Google’s free-tier terms exclude personal and confidential information. [Gemini API terms](https://ai.google.dev/gemini-api/terms)

## If startup fails

| What you see                             | What to check                                                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| npm cannot find `package.json`           | Open the terminal in the project's `server` folder.                                                                               |
| Port 4000 is already in use              | Open the health page above. If CRAM is already running, use that instance or stop its terminal with **Ctrl+C** before restarting. |
| MySQL is unavailable or access is denied | Check the MySQL service and the credentials in `server/.env`. Restart CRAM after editing the file.                                |
| Unknown database or missing table        | Confirm the database name and follow the matching database setup step above.                                                      |

## Keeping this guide current

Update this README with every system change. Add instructions for pending integrations, revise steps as setup changes, and delete each temporary step once it is permanently handled by CRAM. Keep any setup a new computer or Facebook Page still requires. Use placeholders for private credentials.
