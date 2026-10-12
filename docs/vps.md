# VPS setup

Ornament uses a prebuilt image from `ghcr.io/mot1us/ornament`, available for
AMD64 and ARM64. The database and credentials stay on your VPS. GitHub
publishes the software; Dockhand pulls it without a GitHub account connection.

## Dockhand

1. Open your VPS environment → **Stacks → Create Stack**.
2. Name it `ornament` and paste [compose.yaml](../compose.yaml) into the editor.
3. Add the settings below in Dockhand's environment panel.
4. Validate, then **Create & Start**. Keep automatic updates off.

Generate the organizer password hash locally from this checkout:

```sh
node scripts/password.js
```

Set these values in Dockhand:

| Variable | Value |
| --- | --- |
| `ADMIN_PASSWORD_HASH` | Generated hash value, marked as a secret |
| `PUBLIC_URL` | Your HTTPS hostname, e.g. `https://ornament.example.com` |
| `EMAIL_MODE` | `preview` |

Copy only the hash after `ADMIN_PASSWORD_HASH=`. Save and deploy through
Dockhand so its saved secrets are supplied. Back up Dockhand's own data too.
The Compose file uses explicit environment variables, following the
[Dockhand manual](https://dockhand.pro/manual/).

## Pangolin

The external Docker network `pangolin_frontend` must already exist. Route your
hostname to `ornament:3080` on that network and enable HTTPS. No app port is
published directly on the VPS.

Leave the family routes accessible through Pangolin; the private group link
grants access to the submission form. Organizer access requires Ornament's
password. You can add separate Pangolin protection to `/admin`.
Visit `/admin`, set up an exchange, then copy **Group link** and share it
privately. People can submit without email being configured. Review each
submission and approve it against an existing person or a new participant
before drawing names. Keep historical identities when matching prior years.

## Private data

The app stores SQLite in `santa_data` and daily snapshots in `santa_backups`.
Dockhand adds the stack prefix to volume names. Preserve the stack name and
volumes when updating; never choose to delete volumes.

Both containers run as UID/GID 1000 with read-only root filesystems. The backup
container has no network access. Images contain application files only.

Import past matches using **History** in the organizer dashboard. Review
aliases and provisional histories before drawing names. Keep history files,
wish lists, emails, `.env` files, and backups out of GitHub.

## Email

Keep `EMAIL_MODE=preview` during setup. When ready, add your SMTP provider's
settings to Dockhand and deploy again:

```dotenv
EMAIL_MODE=smtp
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=465
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=Ornament <santa@your-domain.example>
```

Mark `SMTP_PASSWORD` as a secret. Port 465 uses TLS; 587 uses STARTTLS.
Verify the sender with your provider and test with your own address first.
For a non-Google relay, Oracle Cloud Email Delivery works over SMTP: use your
region's endpoint, generated SMTP credentials, and approved sender. Follow
[Oracle's setup steps](https://docs.oracle.com/en-us/iaas/Content/Email/Reference/gettingstarted.htm)
and [SMTP configuration](https://docs.oracle.com/en-us/iaas/Content/Email/Reference/gettingstarted_topic-Configure_the_SMTP_connection.htm).
These credentials are separate from your Oracle console password.
If you require zero cost, check your account's available sending quota and
eligibility before setting it up. Oracle's published Always Free allowance and
service-limit table conflict; do not assume a Free Tier account can send email
without an upgrade. Use another free SMTP relay if your account requires payment.

Review addresses and messages in **Email** before explicitly sending match
emails. They include the recipient's name, wish list, message, and product
links. The SMTP relay and recipients' mail providers process those contents.
The app does not install a VPS mail server.

Preview messages are never sent automatically. Optional email sign-in at
`/join` sends requested links immediately in SMTP mode, without sending any
invitation or assignment batch. In preview mode, find these links in
**Email → Preview**. They expire after 15 minutes and work once. This sign-in
flow is not required for group-link submissions.

## Backups and updates

The backup container writes a checked SQLite snapshot on startup and every
24 hours. Failures retry after one hour. Snapshots are retained. Monitor logs
and storage, and arrange encrypted off-VPS copies with your backup service.

Back up before updating. After a release's GitHub checks pass, change **both**
image tags in Dockhand's Compose editor to that release and deploy. Keep the
volumes. Use a published digest instead of a tag if you want an immutable pin.
Avoid `latest` and automatic deployment.

When upgrading from 0.1.4, stop the existing stack first. Replace its Compose
file with this release, retain the saved environment settings, and redeploy
with orphan removal enabled. This replaces the old service containers while
retaining `santa_data` and `santa_backups`. Set the Pangolin target to
`ornament:3080`. For CLI upgrades, use `docker compose up -d --remove-orphans`.

To restore, stop both containers, preserve the existing volume, and copy a
checked snapshot into a fresh data volume as `secret-santa.sqlite`, owned by
UID/GID 1000. Omit old `-wal` and `-shm` files. Restart and verify history,
draws, and delivery records before sharing links. Revoke links and sessions
if restoring after a security incident.

## CLI alternative

```sh
git clone https://github.com/mot1us/ornament.git
cd ornament
cp .env.example .env
chmod 600 .env
docker compose pull
docker compose run --rm --no-deps ornament node scripts/password.js
# Add the generated hash, HTTPS PUBLIC_URL, and EMAIL_MODE=preview to .env.
docker compose up -d
```

To build your checkout instead, use the optional override:

```sh
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

## Publishing images

Pushes to `main` publish the package version only after app, Compose, and
container checks pass. CI uses GitHub's built-in token; it needs no VPS or
SMTP credentials. Existing release tags are preserved.

For the first publication, the repository owner must make the package public:
open the **Ornament package → Package settings → Change visibility → Public**.
GitHub starts new container packages as private, even for public repositories.
Once public, Dockhand can pull without credentials. See
[GitHub's package visibility instructions](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility).
