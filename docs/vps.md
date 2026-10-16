# VPS setup

Ornament uses a prebuilt image from `ghcr.io/mot1us/ornament`, available for
AMD64 and ARM64. The database and credentials stay on your VPS. GitHub
publishes the software; Dockhand pulls it without a GitHub account connection.

## Dockhand

1. Open your VPS environment → **Stacks → Create Stack**.
2. Name it `ornament` and paste [compose.yaml](../compose.yaml) into the editor.
3. Add the settings below in Dockhand's environment panel.
4. Validate, then **Create & Start**. For automatic updates, follow the section below.

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

Leave family routes reachable through Pangolin; access requires an emailed
invitation or a known-member sign-in. Organizer access requires Ornament's
password. Protect Dockhand and Pangolin administration separately.
Visit `/admin`, add known family members and their emails (including yourself),
then use **Email → Prepare wish-list invitations → Send pending emails**. Check
recipient addresses first; revealing message bodies is optional. Invitations
work once for 48 hours. Preserve historical identities when adding participants.
Group registration is closed unless you enable it under **People → Group
registration**. Its existing submissions can still be reviewed by identity and
format checks, with content hidden by default.

The configured `TRUST_PROXY_HOPS=1` must match your actual trusted proxy path.
Confirm that the nearest trusted proxy supplies/overwrites client addresses;
do not increase the value blindly or publish port 3080 directly. Otherwise
IP limits can group every visitor together or trust a spoofed address. This
must be verified on your deployment; the app's local tests cannot audit it.

## Private data

The app stores SQLite in `santa_data` and daily snapshots in `santa_backups`.
Dockhand adds the stack prefix to volume names. Preserve the stack name and
volumes when updating; never choose to delete volumes.

Both containers run as UID/GID 1000 with read-only root filesystems. The app is limited to 256 MB, half a CPU, and 100 processes. The backup
container has no network access and is limited to 128 MB, a quarter CPU, and
50 processes. These Compose limits require a stack edit on existing deployments. Images contain application files only.

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
emails. Message content is hidden until you confirm **Reveal preview**. They include the recipient's name, wish list, message, and product
links. The SMTP relay and recipients' mail providers process those contents.
The app does not install a VPS mail server.

Outgoing emails identify the exchange in their subjects and explain why the
recipient is receiving them. They include plain text and lightweight HTML with
visible, clickable links, without remote images or tracking. A bare `SMTP_FROM`
address or the default `Ornament` display name becomes `Ornament Secret Santa`;
the approved mailbox stays the same and a custom display name is preserved.
Existing SMTP settings work without a Compose or environment change.

These improvements do not guarantee inbox placement. Keep SPF, DKIM, and DMARC
configured with your relay; reputation and the recipient provider's filters
also affect spam placement. See
[Google's sender guidance](https://support.google.com/mail/answer/81126?hl=en)
and [Oracle's deliverability guidance](https://docs.oracle.com/en-us/iaas/Content/Email/Reference/deliverabilitybestpractices_topic-bestpractices.htm).
SMTP acceptance still means `sent`, not proof of inbox placement. An update
does not resend existing successful messages or retry uncertain deliveries.

Preview messages are never sent automatically. Optional email sign-in at
`/join` sends requested links immediately in SMTP mode, without sending any
invitation or assignment batch. In preview mode, find these links in
**Email → Preview**. They expire after 15 minutes and work once. Returning invited participants can use this flow on any device. Optional
group-link registration still supports saved-browser edits without email verification.

## Backups and updates

The backup container writes a checked SQLite snapshot on startup and every
24 hours. Failures retry after one hour. Snapshots are retained. Monitor logs
and storage, and arrange encrypted off-VPS copies with your backup service.

Back up before updating. After a release's GitHub checks pass, change **both**
image tags in Dockhand's Compose editor to that release and deploy. Keep the
volumes. Use a published digest instead of a tag if you want an immutable pin.

To follow checked releases, merge [compose.auto-update.yaml](../compose.auto-update.yaml)
into your stack: both services use `ghcr.io/mot1us/ornament:latest`.
For the CLI, use `docker compose -f compose.yaml -f compose.auto-update.yaml up -d --pull always`.
In Dockhand, save the complete merged Compose file and redeploy with image pulling
enabled. Keep the stack name, saved environment variables, and existing volumes.

Enable automatic image updates on each Ornament container in its editor's
**Settings** tab. Set a daily schedule in your timezone; use different times for
the app and backup container. Manage these schedules on **Schedules**. This keeps
the schedule specific to Ornament. Manual **Check for updates** and redeployment
remain available. See [Dockhand's update documentation](https://dockhand.pro/manual/#checking-for-updates).

Image updates briefly restart each container and preserve its configuration and
volumes. They never draw names or send prepared email batches. New Compose settings
still require a stack edit. To stop following releases, turn off both schedules
and replace both image references with a published version or digest.

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
container checks pass. The published image is smoke-tested before the current
`main` release is promoted to `latest`. Older, superseded runs cannot promote
their release. CI uses GitHub's built-in token; it needs no VPS or SMTP credentials.
Existing version and commit image tags are preserved.

For the first publication, the repository owner must make the package public:
open the **Ornament package → Package settings → Change visibility → Public**.
GitHub starts new container packages as private, even for public repositories.
Once public, Dockhand can pull without credentials. See
[GitHub's package visibility instructions](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility).

## Upgrade to 0.6.0

Back up first and pull the checked image. Legacy reusable invitation links stop
working; participants can use `/join` for fresh sign-in emails. Existing private
owner sessions, submissions, identities, finalized draws and sent records remain.
Group registration closes by default. Review any existing pending submissions,
retain each person's historical identity, and add missing known members.

Organizer wish-list content, gifter notes, current matches and email bodies are
now hidden by default. Local checks determine readiness; optional reveal actions
are explicit. Queue correction requests from **Checks & options**, then dispatch
them in **Email**. Every active list must pass before finalizing.

Automatic image updates do not add Compose resource limits. Replace the entire
stack Compose file with the complete updated configuration, retaining the stack
name, both `latest` image references, saved environment values, and both volumes.
Do not change successful email records or retry uncertain messages without review.
