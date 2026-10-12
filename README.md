# Family Secret Santa

A free, MIT-licensed, self-hosted family exchange with personal wish-list links, annual match
history, and organizer-controlled emails. Application code lives on GitHub;
private records live in SQLite on the VPS. No Firebase or EmailJS account is
required.

## What works

- Separate organizer login and private personal links; no family passwords.
- Annual rosters, wish lists, up to five gift ideas, and specific exclusions.
- One gift given and received per person, no self-matches, and no directed
  repeats from the previous two calendar years. Reciprocal pairs are blocked
  by default and can be enabled in Rules & details.
- Persistent draft draws. A finalized draw is saved and locked before emails
  are prepared. Family pages show only their own assigned recipient.
- Editable imported history, provisional or verified. Finalization requires
  verified history for both preceding years and valid email addresses.
- Email previews, invitations, assignments, a durable delivery ledger, and
  explicit review of uncertain deliveries. Successfully sent messages are
  skipped when another batch runs.
- Docker/Compose deployment behind Pangolin, daily SQLite backups, and an
  organizer export of people and match history.

## Local development

Use Node.js 24.4 or later. The Docker image and CI use Node 24 LTS.

```sh
npm ci
cp .env.example .env
node scripts/password.js
```

Paste the printed `ADMIN_PASSWORD_HASH` line into `.env`, then run:

```sh
npm run dev
```

Open <http://localhost:3080/admin>. Create a year and add the people, or import
historical JSON files first and copy the latest year's roster. Email mode is
`preview` by default; it never sends email. Local databases, credentials, and
backups are ignored by Git and excluded from Docker build contexts.

```sh
npm run check
npm test
```

The integration tests use generic participants and temporary local servers.
No actual family data or SMTP service is used.

## History

Import or edit one pairing per line in **Past years**, or import a JSON file:

```sh
npm run import-history -- /private/path/history.json
```

Stop the app before using the CLI importer; the organizer import works while
the app is running. A JSON history file uses this shape:

```json
{
  "year": 2025,
  "status": "provisional",
  "source": "Family recollection; awaiting confirmation",
  "aliases": {"Christopher": ["Chris"]},
  "assignments": [
    {"giver": "Alex", "recipient": "Jamie"},
    {"giver": "Jamie", "recipient": "Chris"},
    {"giver": "Chris", "recipient": "Alex"}
  ]
}
```

An omitted status is provisional. Confirm it through the organizer dashboard
after checking every match. The first name is the giver; the second is the
recipient. Names and aliases resolve to permanent person IDs. There must be
one giver and one recipient entry for every participating person in that year.
Drafts affected by a historical correction are discarded and can be generated
again. Finalized exchanges cannot be overwritten by the importer.

The preceding two years must either have verified matches or an explicit
organizer confirmation that no exchange happened. New families can record
those empty years in **Past years**. Existing match histories cannot be erased
using the empty-year option; do not invent placeholder matches.

## Family workflow

1. Import and verify past matches. Create this year's exchange by copying the
   latest roster; update who is taking part and add email addresses.
2. Add partner exclusions and the gift budget/date in **Rules & details**.
3. Share each person's private link, or prepare invitation emails. Family
   members add their wish lists on their personal page.
4. Generate and review a draft. No rules are silently relaxed when a draw is
   impossible. Confirm the history and finalize once the roster is ready.
5. Prepare assignment emails, preview each message, and send the pending batch.
   Sending is separate from finalizing. Participants can see their recipient
   on their personal page as soon as the draw is finalized.

The organizer can see the complete draw and history. Personal links are bearer
credentials: anyone holding a link can open that person's page. They expire
after 450 days and can be revoked along with signed-in sessions. Links carry
the token in a URL fragment, which is redeemed into an HttpOnly cookie and
removed from the address bar. Authentication tokens are hashed in SQLite.
Prepared email bodies contain personal links and are therefore private data.

## Hosting and maintenance

See [VPS deployment](docs/vps.md) and [data and delivery behavior](docs/behavior.md).
The Compose file uses the existing `pangolin_frontend` network. It exposes an
internal port and stores SQLite and backups in named volumes. The app needs its
own HTTPS URL, organizer password hash, and SMTP configuration on the server.

Daily backups in the VPS's second named volume protect against application data
loss. Set up encrypted off-VPS copies to protect against losing the server.
The included backup utility uses SQLite's online backup API and checks each
snapshot's integrity. It does not copy a live SQLite file with `cp`.

## Open source

You can run, change, and share this app under the [MIT license](LICENSE).
Each installation is independent and owns its data. There is no shared public
service, telemetry, external font dependency, or hosted signup database.
Only a configured SMTP provider receives the emails you explicitly send.

Contributions are welcome. Use synthetic data in issues, screenshots, tests,
and pull requests. Never upload an actual family roster or database to GitHub.
