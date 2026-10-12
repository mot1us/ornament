# Deploy to the VPS

The stack is prepared for Docker/Compose and the existing Pangolin/Traefik
gateway. Choose a new HTTPS hostname for the family site before deploying.

## Install

Clone the GitHub repository on the VPS into a dedicated stack directory:

```sh
git clone https://github.com/mot1us/ornament.git
cd ornament
cp .env.example .env
chmod 600 .env
```

Generate a new organizer password hash with Node 24+ or using the application
image. Building the image does not need any credentials:

```sh
docker compose build secret-santa
docker compose run --rm --no-deps secret-santa node scripts/password.js
```

Set these values in the VPS `.env`:

```dotenv
ADMIN_PASSWORD_HASH=scrypt:PASTE_THE_GENERATED_SALT:PASTE_THE_GENERATED_HASH
PUBLIC_URL=https://santa.example.com
COOKIE_SECURE=true
EMAIL_MODE=preview
```

Keep the `.env` file private (`chmod 600 .env`). The example domain is a
placeholder; use the hostname you configure in Pangolin. The app refuses to
start with an external HTTP URL or insecure cookies.

```sh
docker compose up -d --build
docker compose ps
```

Pangolin should route this hostname to `secret-santa:3080` over
`pangolin_frontend`. Use HTTPS. The family routes use the application's own
private-link authentication; a separate Pangolin login on the entire hostname
would make those links inconvenient. Additional Pangolin protection can be
applied to `/admin` if desired. Do not expose port 3080 directly on the host.
Keep access logs free of request bodies and redact sensitive headers. Personal
link tokens use fragments, so they do not appear in HTTP request URLs.

The main container and backup container run as the non-root `node` user, have
read-only root filesystems, and drop Linux capabilities. The backup container
has no network access. SQLite lives in `santa_data`, and backups in
`santa_backups`. Dockhand may add a stack prefix to those volume names.

## Bring over history

Transfer the history files privately to the VPS; never commit them to GitHub.
Use **History** in the organizer dashboard, or stop the main container and
mount a private import directory for the CLI:

```sh
docker compose stop secret-santa secret-santa-backup
docker compose run --rm --no-deps -v /private/imports:/imports:ro secret-santa \
  node scripts/import-history.js /imports/history-2024.json /imports/history-2025.json
docker compose up -d
```

Use aliases to join alternate names to the same identity before importing a
second history. Imported histories start provisional unless explicitly marked
verified. Create the current year by copying the latest roster, then add email
addresses and partner exclusions.

## Email

Keep `EMAIL_MODE=preview` during setup. Configure an existing SMTP provider on
the VPS; the website and private database remain self-hosted. This does not
install a mail server on the VPS.

```dotenv
EMAIL_MODE=smtp
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=Ornament <santa@your-domain.example>
```

Port 587 requires STARTTLS; port 465 uses TLS from the start. Certificate
verification stays enabled. Do not copy an EmailJS browser public key into
these fields; SMTP uses the connected email provider's credentials. Configure
the provider's sender verification and domain records according to its
instructions, then recreate the application container after changing `.env`:

```sh
docker compose up -d --force-recreate secret-santa
```

Messages prepared in preview mode must be explicitly queued again before real
sending. Verify addresses and previews in **Email** first. Never use the real
family list for deployment smoke tests.

## Backup and recovery

The backup container writes a checked snapshot on startup and every 24 hours.
A failed backup retries after one hour. Monitor its logs and storage usage.
Snapshots are retained; no automatic deletion is configured.

For a manual online snapshot:

```sh
docker compose exec secret-santa node scripts/backup.js /backups
```

Arrange encrypted off-VPS copies of the backup volume using your existing
backup service, such as a properly configured restic repository. This requires
a destination and credentials that have not been selected for this project.
SQLite snapshots contain private messages and access links; keep them private
and encrypted outside the server. Schedule a periodic restore test.

To restore, stop both containers first. Preserve the existing data volume and
copy a checked snapshot into a fresh `santa_data` volume as
`secret-santa.sqlite`, owned by UID/GID 1000. Do not bring old `-wal` or `-shm`
files into the restored directory. Restart the application and verify rosters,
history, finalized draws, and delivery statuses before sharing links. Sessions
and link credentials are included in a full snapshot; revoke them in the
organizer dashboard if the restore followed a security incident.

## Updates

Back up first, pull the reviewed GitHub commit, and rebuild the containers.
Keep the existing named volumes. CI checks the application and Docker build
for each pushed change. Deployment is deliberate; CI does not SSH into your
VPS or send family emails.
