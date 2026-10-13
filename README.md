# Ornament

Self-hosted Secret Santa for family and friends.
Add your family members, email invitations, collect private wish lists, then draw names and email matches.

- Avoids matches from the previous two years.
- Organizer controls people, exclusions, draws, and email.
- Wish lists, messages, and current matches stay hidden from the organizer until explicitly revealed.
- Local checks report submission readiness; correction requests can be emailed without opening lists.
- Private SQLite data and daily backups on your server.
- Free and [MIT licensed](LICENSE). Each group runs its own instance.

## Run locally

Node.js 24.4+:

```sh
npm ci
cp .env.example .env
node scripts/password.js
# Paste the printed ADMIN_PASSWORD_HASH into .env.
npm run dev
```

Open [localhost:3080/admin](http://localhost:3080/admin) to set up an exchange.
Add known participants and their email addresses, including yourself if you are
taking part. In **Email**, prepare wish-list invitations, check recipient addresses,
then send. Each invitation works once for 48 hours; returning participants can
request a 15-minute sign-in email at `/join`. Email starts in preview mode.

The dashboard shows submission checks instead of private content. Use **Checks &
options** to request changes or deliberately reveal a wish list. Draw checks and
message delivery can be reviewed without opening matches or email bodies.
Group-link registration remains an explicit option, closed by default.

## Self-host

Paste [compose.yaml](compose.yaml) into a regular Dockhand stack, then follow
the [VPS setup](docs/vps.md). Choose a pinned release or checked `latest` images
with Dockhand updates; no GitHub account connection is needed. Keep credentials,
family records, and backups on your VPS.

[Import history](docs/history.md) · [App behavior](docs/behavior.md) · [Changelog](CHANGELOG.md)

The family view is a hand-drawn Christmas letter with playful transitions and
reduced-motion support. [Artwork and font notes](docs/artwork.md).

## Check changes

```sh
npm run check
npm test
```
