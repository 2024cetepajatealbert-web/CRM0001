# CRAM MySQL and authentication setup

## 1. Understand the stack

CRAM uses a JavaScript full-stack architecture:

| Layer | Technology | Responsibility |
|---|---|---|
| Client | Current HTML/CSS/JS prototype; React later | Displays Sign-up, Login, and CRM screens |
| API | Express on Node.js | Validates requests, creates accounts, and issues sessions |
| Database | MySQL | Stores users, teams, clients, and conversations |

MySQL replaces MongoDB here. Do **not** add Mongoose or MongoDB packages for this version.

## 2. Import the supplied database carefully

`server/sql/CRAMDB.sql` is the supplied schema. It includes `DROP DATABASE IF EXISTS CRAMDB`, which deletes any existing CRAMDB database before recreating it. Use it only on a development database or when you are certain the existing data can be erased.

In MySQL Workbench, open `server/sql/CRAMDB.sql` and run it.

For the MySQL command line:

```powershell
mysql -u root -p < server/sql/CRAMDB.sql
```

## 3. Configure the Express server

From the workspace root:

```powershell
if (-not (Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
cd server
npm install
```

Edit `server/.env` with your local MySQL account. Never commit this file. The important database values are:

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=CRAMDB
DB_USER=root
DB_PASSWORD=your_mysql_password
```

If a password includes `#`, spaces, or other special characters, wrap it in double quotes in `.env`, for example: `DB_PASSWORD="your-password"`. Otherwise dotenv may treat part of the value as a comment.

The reusable MySQL connection class is [database.js](../server/src/config/database.js). Controllers use `database.query()` for prepared statements and `database.transaction()` for operations that must succeed together, such as creating a team and a user.

After editing `.env` (including a strong `JWT_SECRET`), run these commands from `server`:

```powershell
npm run migrate:dashboard
npm run migrate:workspace
npm run migrate:records
npm run dev
```

See [Dashboard Guide](DASHBOARD_GUIDE.md) for the Facebook connection encryption key and Messenger setup. Do not overwrite an existing `.env` or reimport the base SQL into your working database.

## 4. Connect the client to the API

The server serves the current client from port 4000, so open `http://localhost:4000` after `npm run dev`.

The client uses the API automatically when it is opened through the Express server. Sign-up calls:

- `POST /api/auth/signup`

Login calls:

- `POST /api/auth/login`

The account is saved to MySQL immediately after valid Sign-up details are submitted. There is no email-verification step.

## 5. Security rules to keep

- Keep passwords only as bcrypt hashes; CRAM already uses `bcryptjs` with 12 rounds.
- Keep `.env`, JWT secrets, and database passwords out of Git.
- Use HTTPS, a strong unique `JWT_SECRET`, and a production CORS origin before deployment.
- Do not put a database password in the browser code.
- Back up the database before applying schema changes to non-development data.
