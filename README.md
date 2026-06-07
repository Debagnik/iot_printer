# Print Queue Manager for Raspberry Pi

A modern, responsive, and secure Web GUI and backend to manage a print queue and scan jobs for printers/scanners connected to a Raspberry Pi or Linux server.

---

## Features

- **User Authentication & Authorization**: Roles for standard `USER` and `ADMIN`. Includes security features such as user enablement/disablement and admin password resets.
- **Print Queue Management**: Upload documents (PDFs, images), specify options (Paper size, Paper type, print quality, color model, number of copies, and double-sided), and submit them to the print queue.
- **Integrated Scanner Control**: Initiate scans from the browser interface, download scanned documents, and delete old scans.
- **Admin Dashboard**: Comprehensive dashboard to monitor active print queues, manage user registrations/roles, configure system settings, and clear print and scan histories.
- **Automated Cleanup**: Daily automated cron-like task to delete uploaded/scanned files and print logs older than 24 hours to conserve server disk space.
- **MariaDB / MySQL Integration**: Enterprise-grade service-based database backing with high-performance connection pooling.

---

## Tech Stack

- **Backend**: Node.js, Express, Express-Session, BcryptJS
- **Frontend**: EJS Template Engine, Vanilla CSS (with vibrant colors, sleek dark/light mode toggle, and micro-animations)
- **Database**: MariaDB / MySQL (via `mysql2/promise`)
- **Printer & Scanner Core**: CUPS (`lp` command integration) and SANE (`scanimage` command integration)

---

## Prerequisites

- **Node.js**: v16+ recommended
- **Database**: MariaDB / MySQL service running locally or on the network
- **Printer Driver**: CUPS installed and configured on the host machine
- **Scanner Driver**: SANE backend installed and scanner permissions configured

---

## Installation & Setup

1. **Clone the repository** to your Raspberry Pi or target server.
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Configure Environment Variables**:
   Copy the example configuration file and edit the settings:
   ```bash
   cp .env.example .env
   ```
   Open the `.env` file and configure your database and system configurations:
   ```env
   PORT=2000
   NODE_ENV=production
   SESSION_SECRET=your_super_secret_session_key
   COOKIE_SECURE=false

   # Database Connection Configuration
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=your_mariadb_user
   DB_PASSWORD=your_mariadb_password
   DB_NAME=print_queue

   # Printer & Scanner Settings
   PRINTER_NAME=Ink-Tank-310-series
   SCANNER_NAME=HP_Ink_Tank_310_series
   SCANNER_SERIAL_ID=XXXXXXXXXXXX
   ```

4. **Initialize target database**:
   Log into your MariaDB/MySQL prompt and create the database specified in your `.env`:
   ```sql
   CREATE DATABASE print_queue CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

5. **Start the application**:
   ```bash
   # Production mode
   npm start

   # Development mode (with auto-restart)
   npm run dev
   ```

---

## Database Migration: SQLite to MariaDB

If you have an existing SQLite database file (`data/print_queue.db`) containing user accounts and history, you can migrate it seamlessly to your new MariaDB instance using the included migration script:

1. **Do not uninstall sqlite3 yet** (if already removed, temporarily install it with `npm install sqlite3`).
2. Configure the target database parameters in your local `.env` file.
3. Run the migration:
   ```bash
   node migrate-db.js
   ```
4. Verify the console output:
   ```text
   Connected successfully. Commencing migration...
   Temporarily disabling foreign key checks...
   Migrating "User" table...
   Found X users in SQLite.
   Migrating "Settings" table...
   Found Y settings entries in SQLite.
   Migrating "PrintJob" table...
   Found Z print jobs in SQLite.
   Migrating "ScanJob" table...
   Found W scan jobs in SQLite.
   Re-enabling foreign key checks...
   Migration completed successfully!
   ```
5. You can now clean up the temporary SQLite driver:
   ```bash
   npm uninstall sqlite3
   ```

---

## Project Structure

```text
├── data/                    # Legacy SQLite directory (deprecated)
├── public/                  # Static assets (CSS, client JS, images)
├── src/
│   ├── app.js               # Main entry point & routing configuration
│   ├── controllers/         # Request handling & template rendering logic
│   ├── middleware/          # Security & upload middlewares
│   ├── models/              # Data models and database interaction layer
│   │   ├── database.js      # MariaDB connection pool and schema
│   │   └── ...              # User, PrintJob, ScanJob models
│   └── utils/               # Shell integrations (CUPS, SANE, file cleanups)
├── views/                   # EJS UI templates
├── migrate-db.js            # SQLite to MariaDB data migration script
└── package.json             # Node dependencies and build scripts
```
