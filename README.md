# Ornament

Self-hosted Secret Santa for family and friends.
Share one group link, collect wish lists, then draw names and email matches.

- Avoids matches from the previous two years.
- Organizer controls people, exclusions, draws, and email.
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
Copy **Group link** and share it privately. People enter their name, email,
wish list, message to their gifter, and product links without signing in.
Review submissions before drawing names. Email starts in preview mode.

## Self-host

Paste [compose.yaml](compose.yaml) into a regular Dockhand stack, then follow
the [VPS setup](docs/vps.md). It pulls a versioned Docker image; no GitHub account
connection is needed. Keep credentials, family records, and backups on your VPS.

[Import history](docs/history.md) · [App behavior](docs/behavior.md) · [Changelog](CHANGELOG.md)

## Check changes

```sh
npm run check
npm test
```
