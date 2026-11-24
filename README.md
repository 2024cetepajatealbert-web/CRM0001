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

### 1. Install the tools

- Install **Node.js 24.x** with npm. [Download Node.js](https://nodejs.org/en/download)
- Install **MySQL Community Server 8.0 or 8.4**, configure it as a Windows service, and save the MySQL password you choose. MySQL Workbench is optional for viewing tables. [Download MySQL Community Server](https://dev.mysql.com/downloads/mysql/)
- Install **Git** if you plan to clone the project. You can also download and extract the project ZIP. [Download Git](https://git-scm.com/downloads/)

### 2. Get the project and install its dependencies

From a PowerShell terminal in the folder where you keep projects, run the following commands.

```powershell
git clone https://github.com/2024cetepajatealbert-web/CRM0001.git
cd .\CRM0001\server
```

If you already have the files, open the `server` folder that contains `package.json`. Run the remaining commands there.

```powershell
npm install
npm run setup:env
```

If you use pnpm for dependencies, use `pnpm install --frozen-lockfile` for the install step to match the versions in the repository.

### 3. Connect CRAM to MySQL

Open the generated `.env` file inside `server` in your editor. On a new local installation, set these entries using the MySQL credentials for **this computer**. The account used for initial setup needs permission to create the database and tables.

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=CRAMDB
DB_USER=root
DB_PASSWORD="your MySQL password here"
```

The quotes allow passwords containing spaces or `#`. Keep the generated `JWT_SECRET` and `CONNECTION_ENCRYPTION_KEY` private and keep a secure copy. CRAM uses the second key to read saved Messenger credentials.

### 4. Prepare the database and open CRAM

- **New or empty database.** Run `npm run setup:db` once. It creates the tables and applies the migrations. A fresh database starts with zero accounts.
- **Restored database or an older CRAM installation.** Back it up, confirm `DB_NAME`, then run `npm run migrate`. Migrations use the private `.env.admin` file when present. An existing installation that already has the current schema can go straight to startup.

On a new install using local MySQL root, you can give CRAM its own restricted database login with `npm run setup:security -- --database-user`. This command uses `mysqldump` to make a private backup first. Set `MYSQLDUMP_PATH` to the executable's full path if it is installed outside the default MySQL 8.0 folder.

Run `npm run dev` and open CRAM. On an empty database, choose **Sign-up** and use a Gmail or `@online.htcgsc.edu.ph` address. Accounts and client records belong to the MySQL database on the computer hosting CRAM. [Open CRAM](http://localhost:4000)

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
