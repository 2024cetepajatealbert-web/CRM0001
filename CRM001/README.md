# CRAM — Real Estate CRM

CRAM helps Philippine real-estate teams keep leads, follow-ups, appointments, and client records in one relationship-focused workspace.

## Project structure

```text
CRM001/
├── CRM001/                 # Current client prototype (landing, Sign-up, Login, dashboard)
│   ├── assets/              # Brand images
│   ├── css/                 # Visual styles grouped by purpose
│   ├── js/                  # Client behaviour and API calls
│   └── index.html
├── server/                  # Express + Node + MySQL API
│   ├── src/config/          # Database class
│   ├── src/controllers/     # Authentication business rules
│   ├── src/routes/          # HTTP route definitions
│   ├── src/utils/           # Validation helpers
│   └── sql/                 # Supplied MySQL schema
└── docs/                    # Setup documentation
```

## Technology choice

The team’s target stack is **React + Express + Node.js + MySQL**. This is a MERN-style JavaScript architecture, but not technically MERN because MySQL replaces MongoDB. The current client is a working HTML/CSS/JavaScript prototype so the dashboard design remains stable while the API is built. React can replace the client layer later without changing the Express routes or MySQL schema.

## Authentication flow

- **Sign-up:** first, middle (optional), last name, email, password → account created → welcome.
- **Login:** email and password → welcome.

Sign-up saves the account directly to MySQL. Passwords are stored as bcrypt hashes, never as plain text.

## Team

- Developers: Partusa, Pajate, Gener
- Team Lead / Developer: add your leader’s name here

## Start here

For another computer, start with [Laptop Setup](../docs/LAPTOP_SETUP.md).

From the project root, run `cd server`, then `npm run dev`. Open
`http://localhost:4000` for the presentation. Keep the terminal and MySQL running.
VS Code Live Server on `http://127.0.0.1:5500` or `http://localhost:5500` is also
supported during development, but it serves only frontend files: the Express
backend on port 4000 must still run. Login and dashboard requests are routed to
that backend automatically. Other preview ports require additional configuration.
Opening `index.html` directly with a `file://` URL is not supported.

Personal login credentials are not embedded in the website. Use the password
chosen during sign-up; MySQL stores a password hash, not a recoverable password.

Follow [MySQL Connection Guide](../docs/MYSQL_CONNECTION_GUIDE.md) to import the database, configure the server, and run the live API.

The workspace includes Overview, Clients, Inbox, Activities, Teams, Analytics, and Connect. Clients message your Facebook Page; staff reply from CRAM after configuring Messenger. See [Dashboard Guide](../docs/DASHBOARD_GUIDE.md) for migrations, permissions, Messenger setup, and integration checks.
