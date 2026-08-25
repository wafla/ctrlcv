# CtrlCV

CtrlCV is a temporary, login-free chat service for quickly exchanging messages
and files between devices. Create a session on one device, then join from another
device with the session code and 8-digit encryption key or by scanning the QR code.

Live service: [https://ctrlcv.net](https://ctrlcv.net)

## Key Features

- No account or login required
- Session code and QR-based connection
- Browser-side AES-GCM encryption for messages and files
- The encryption key is kept in the URL fragment (`#key=...`) and is not sent to
  or stored on the server
- Image and general file transfer, including HWP and HWPX
- Maximum attachment size of 10 MB
- Automatic deletion of sessions, messages, and uploaded files after 2 hours
- Anonymous usage events and daily aggregate statistics without message content
- Responsive desktop and mobile interfaces
- Privacy Policy and Terms of Service pages

## Privacy Model

Message content and attachments are encrypted in the sender's browser and
decrypted in the recipient's browser. The server stores only encrypted message
content and encrypted file blobs.

The 8-digit encryption key must be shared separately or through the full QR link.
Anyone who has both the session code and encryption key can access the session
until it expires.

Operational metrics do not contain message content. Raw usage events use a hashed
session identifier and are deleted after 30 days, while date-level aggregate
statistics may be retained longer.

## Tech Stack

- Next.js 15 and React 19
- TypeScript
- Tailwind CSS
- Oracle Autonomous Database
- Oracle Database Scheduler
- Node.js and PM2
- Nginx

## Local Setup

### 1. Install the project

The private submodule contains environment settings, the Oracle wallet, and the
local encrypted-upload directory. Access to that repository is required.

```bash
git clone --recurse-submodules <repository-url>
cd ctrlcv
npm install
```

For an existing clone:

```bash
git submodule update --init --recursive
```

### 2. Configure environment variables

Create `ctrlcv_private/.env.local` and configure:

```env
ORACLE_USER=
ORACLE_PASSWORD=
ORACLE_CONNECT_STRING=
ORACLE_WALLET_DIR=
ORACLE_WALLET_PASSWORD=
USAGE_HASH_SECRET=
DB_KEEPALIVE_SECRET=
```

Never commit this file or the Oracle wallet to the public repository.

### 3. Initialize the database

Run the SQL files against the target Oracle database in this order:

```text
scripts/schema.sql
scripts/schema_attachments.sql
scripts/schema_usage.sql
scripts/function_generate_code.sql
scripts/procedure_cleanup.sql
scripts/procedure_usage_cleanup.sql
scripts/scheduler_cleanup.sql
scripts/scheduler_usage_cleanup.sql
```

The cleanup job runs every 10 minutes. Expired attachment metadata and encrypted
files are also removed by the application cleanup flow.

### 4. Start development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production

Build and run the production server:

```bash
npm install
npm run build
pm2 restart ctrlcv --update-env
pm2 save
```

If the PM2 process does not exist yet:

```bash
pm2 start npm --name ctrlcv -- run start
pm2 save
```

After pulling updates that include private submodule changes:

```bash
git pull
git submodule update --init --recursive
npm install
npm run build
pm2 restart ctrlcv --update-env
pm2 save
```

## Oracle Keepalive

An Oracle scheduler job runs maintenance inside the database, but an external
connection is still required to prevent an Always Free Autonomous Database from
being paused due to inactivity.

The protected endpoint below opens a real Oracle connection and executes a small
query:

```text
GET /api/db-keepalive
Authorization: Bearer <DB_KEEPALIVE_SECRET>
```

Example Ubuntu crontab entry:

```cron
0 9 * * * curl -fsS -H "Authorization: Bearer YOUR_SECRET" http://127.0.0.1:3000/api/db-keepalive >/dev/null 2>&1
```

## Recent Updates

### 2026-08

- Added drag-and-drop attachment selection in desktop and mobile chat views
- Added clipboard image paste support in the message input
- Added confirm-before-send previews for every supported attachment
- Added image thumbnails and file name/size details before sending
- Added controls to remove a selected attachment before sending
- Added downloads for decrypted images using their original file names

### 2026-07

- Added browser-side encryption for messages and attachments
- Added an 8-digit encryption key and QR fragment-based key sharing
- Added manual session joining with session code and encryption key
- Added encrypted image and file uploads with a 10 MB limit
- Added HWP and HWPX upload support
- Added automatic cleanup for expired and orphaned upload files
- Added anonymous usage events and daily aggregate statistics
- Added Privacy Policy and Terms of Service pages
- Added an authenticated external Oracle keepalive endpoint

## Security Notes

- Serve the production site only over HTTPS.
- Keep `ctrlcv_private`, environment files, wallets, and secrets private.
- Rotate `DB_KEEPALIVE_SECRET` and `USAGE_HASH_SECRET` if either is exposed.
- Do not log decrypted messages, file contents, or encryption keys.

## License

No open-source license has been specified. All rights are reserved unless a
license is added later.
