# Working on Ornament

Develop locally, run the required checks, then commit and push the requested
changes to the configured GitHub remote. This workflow is authorized by the
user. Keep unrelated changes out of commits and do not force-push.

Increment the app version for every completed requested update, including UI,
documentation, and instruction changes. Default to a patch increment. Keep
package.json and package-lock.json in sync, add a concise CHANGELOG.md entry,
and include the version in the delivery commit message and final response.

For this deployment, provide instructions using Dockhand and Pangolin. The user
performs VPS actions; keep deployment settings in Dockhand on the private VPS.

Run `npm run check` and `npm test` for application changes. Use generic fixtures
in tests. Verify the interface in the local browser when changing user flows.

GitHub contains application code only. Never commit family names or contact
details, match history, real wish lists, access tokens, passwords, `.env`, database
files, or backups. Runtime records belong on the private VPS volume; temporary
local development records are ignored. Confirm staged files before publishing.

Keep SMTP off during development. The default email mode is preview. Never send
real family emails or finalize the real exchange as part of development tests.
Use the app's explicit organizer actions after its data has been reviewed.

Preserve finalized draws, existing identities, and successful email records.
An uncertain SMTP delivery must be reviewed before retrying. Never silently
relax matching rules or overwrite an annual draw to repair email delivery.
