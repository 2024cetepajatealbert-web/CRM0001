# CRAM - Customer Relationship Management

A real-estate CRM prototype for managing clients, contact points, follow-ups and teams.

**Current stack:** HTML, CSS and JavaScript frontend; Node.js/Express API; MySQL database.
This version does not use React or MongoDB.

## Run on a presentation laptop

Follow **[Laptop Setup](docs/LAPTOP_SETUP.md)** for installation, database setup,
offline presentation and troubleshooting. Start preparing while you have internet.

Existing installations: start MySQL, open a terminal in `server`, run `npm run dev`,
then open <http://localhost:4000>. Do not initialize or reset your database just to start the app.

## Features and scope

- Sign-up/login with password hashing, inline validation and password visibility controls.
- Persistent client, contact, task and team management with confirmation for destructive actions.
- Overview, calendar, team assignment, workspace permissions and analytics.
- Messenger integration code is present, but public webhook delivery is not yet verified.
  It is not needed for the offline CRUD presentation. TikTok messaging is not implemented.

## Code organization

- `CRM001/`: frontend HTML, CSS, JavaScript and branding.
- `server/src/`: backend configuration, routes, services and validation.
- `server/scripts/`: setup, schema migrations and automated tests.
- `server/sql/`: safe empty core schema and additive dashboard schema.
- `docs/`: laptop setup, database mapping and feature guides.

From `server`, use `npm run format` to apply consistent indentation, or
`npm run format:check` to check formatting. `npm test` checks API and record behavior
using temporary QA workspaces and mocked Meta requests. Run tests only against your
local development/presentation database, not a production deployment.

## Keep private data out of GitHub

The repository contains code and empty schema, not your accounts, MySQL data,
`.env`, Page tokens or App Secret. `.env.example` contains placeholders.
The original destructive SQL export is intentionally excluded.

See [database records](docs/DATABASE_RECORDS.md), [database connection](docs/MYSQL_CONNECTION_GUIDE.md)
and [dashboard guide](docs/DASHBOARD_GUIDE.md) for details.
