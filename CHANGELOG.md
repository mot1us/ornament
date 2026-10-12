# Changelog

## 0.5.0

- Give wish lists a Charlie Brown Christmas look, with new artwork, handwritten headings, snowy colors, and a letter to Santa.
- Animate sending, editing, gift ideas, match reveals, buttons, and dialogs; honor reduced-motion preferences.
- Keep artwork and the open-license display font on the app's own server.

## 0.4.2

- Promote checked releases to latest after published-image verification, keeping versioned images for rollback.
- Add an automatic-update Compose option and instructions for Ornament-only Dockhand schedules.

## 0.4.1

- Send a first wish list to Santa, show a clear confirmation, and keep Edit wish list with Save changes for later updates.

## 0.4.0

- Redesign family wish lists as vintage Christmas cards, with a finished saved view and explicit edit/cancel actions.
- Add gift ideas one at a time, simplify the optional note, and improve mobile layouts and inline errors.
- Clarify pending organizer review and verify a complete exchange through result delivery and private edits.

## 0.3.0

- Collect names, emails, wish lists, messages, and product links through one private group link, without a sign-in email.
- Review submissions against existing identities before drawing; keep each saved form private to its browser.
- Include the recipient’s message and gift ideas in match emails; preserve existing links, draws, and email records.

## 0.2.0

- Share one group URL; participants request an email sign-in link from the homepage.
- Keep sign-in links single-use and valid for 15 minutes, with request limits and private sessions.
- Preview sign-in emails during setup and send requested links separately from organizer email batches.
- Preserve existing personal links, family data, and finalized matches.

## 0.1.5

- Rename Docker services to `ornament` and `ornament-backup`, with routing to
  `ornament:3080`.
- Preserve existing data and backup volumes and document the stack upgrade.

## 0.1.4

- Publish checked Docker images for AMD64 and ARM64 to GitHub Container Registry.
- Deploy a pinned release through a regular Dockhand stack with private VPS volumes.
- Verify container startup and backups in CI; retain an optional local build override.

## 0.1.3

- Pass Dockhand settings and secrets into the app without requiring a local
  environment file in the Git checkout.
- Document deployment and updates through Dockhand with Pangolin routing.
- Keep Dockhand-generated environment files out of Git and Docker build context.
- Validate the Compose configuration in CI.

## 0.1.2

- Update VPS setup instructions for the renamed mot1us/ornament repository.
- Set private permissions on the VPS environment file during setup.

## 0.1.1

- Require a version bump and changelog entry for every completed update.
- Check that package versions agree and the current version has release notes.

## 0.1.0

- Build a self-hosted Secret Santa app with private links, wish lists, annual
  draws, two years of repeat avoidance, email previews, and SQLite backups.
- Refine the wish-list flow, add vintage Christmas artwork, and name the app
  Ornament.
