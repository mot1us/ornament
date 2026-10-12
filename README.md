# Secret Santa

A free, self-hosted Secret Santa app. Open your private link, add a wish list,
and see your match after the draw.

- Avoids matches from the previous two years.
- Organizer controls people, exclusions, draws, and email.
- Private SQLite data and daily backups on your server.
- [MIT licensed](LICENSE). Each household runs its own instance.

## Run locally

Node.js 24.4+:

```sh
npm ci
cp .env.example .env
node scripts/password.js
# Paste the printed ADMIN_PASSWORD_HASH into .env.
npm run dev
```

Open [localhost:3080/admin](http://localhost:3080/admin) to set up an exchange
and share personal links. Email starts in preview mode.

## Self-host

Use [Docker + HTTPS on your VPS](docs/vps.md). Keep credentials, family records,
and backups outside Git. This repository contains code only.

[Import history](docs/history.md) · [App behavior](docs/behavior.md)

## Check changes

```sh
npm run check
npm test
```
