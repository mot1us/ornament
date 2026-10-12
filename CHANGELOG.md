# Changelog

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
