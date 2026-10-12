# Data and delivery behavior

People have permanent random IDs, a display name, alternate names, and an email
address. Annual enrollments hold participation, wish lists, messages to gifters,
and gift ideas with product links.
Each year has independent settings, exclusions, and assignments. The latest two
calendar years' giver-to-recipient edges are excluded even if their history is
still provisional. A draw can be drafted with incomplete history but cannot be
finalized until both preceding histories are verified.
For a new tradition, the organizer can explicitly confirm that no exchange
happened in a prior year. This counts as verified empty history; it cannot
replace an existing draw.

The randomized constraint search returns a valid draw or an explicit failure.
It checks self-matches, exclusions, directed history, and optionally reciprocal
edges. It does not claim to sample all possible valid draws uniformly. A
bounded search prevents a complex exchange from exhausting the server.

Draft generation, history imports, and finalization use SQLite transactions.
Changing a roster, matching rule, or relevant history discards affected drafts.
Finalization revalidates the entire draw against the current roster and rules.
A finalized draw cannot be regenerated, and email retries do not change it.

Emails are persisted in an outbox before delivery. Each person/year/type has
one message record with a stable Message-ID. A successful SMTP acceptance is
recorded as `sent` and skipped on future batch runs. A definite SMTP rejection
is `failed`; an ambiguous connection failure is `uncertain`. A process restart
also converts an in-flight `sending` record to `uncertain`. The organizer must
check the mailbox before explicitly retrying an uncertain message.

SMTP cannot guarantee exactly-once delivery: a server can accept a message
before the app learns it succeeded. The uncertainty workflow avoids automatic
duplicate sends but cannot rule out a duplicate after an incorrect manual
retry decision. `sent` means the provider accepted the message, not proof that
the recipient opened it or that it avoided spam.

The organizer shares one random, unguessable **Group link** for an exchange.
It opens a form for a name, email, wish list, message to the gifter, and product
links. Submission requires no account or email verification. Saving shows a finished
list with an explicit **Edit wish list** action. Cancel discards unsaved edits;
reopening the page shows the saved list. Up to five gift ideas can be added
individually, and the note to the gifter is optional. A private browser
session lets someone return to their own form for 30 days. The group link never
reveals the roster, other submissions, email addresses, or matches.

Submissions wait for organizer review. The organizer maps each one to a stable
person, checks the email and content, then chooses **Approve wish list** or
**Decline**. Review submissions before finalizing the draw. Once approved, the
family form can change only that person's wishes, message, and product links;
it cannot change the accepted identity or email. The shared link is intended
for a trusted group: anyone who receives it can submit a form, and email
ownership is not verified by this flow.

Invitation and assignment messages include a private personal link. Assignment
emails contain the recipient's name, wish list, message to the gifter, and
product links as a snapshot taken when messages are prepared. The personal
page shows the recipient's latest saved content. Later edits do not change
already prepared messages. The SMTP provider and the recipient's mail provider
process these emails; their contents are not confined to the self-hosted database.

Organizer authentication uses a server-side session and scrypt password hash.
Existing personal links remain supported. The optional email sign-in page at
`/join` sends a sign-in link only to a known, active participant in
the latest open, drafted, or finalized exchange. Responses do not disclose
whether an email is on the roster. Each person needs a separate email address.
Email sign-in tokens are random and hashed in SQLite, work once, and expire in
15 minutes. Requests are limited by IP and by email, with email limits surviving
restarts. Sign-in delivery never sends prepared invitation or assignment batches;
failed or uncertain links are not retried automatically. Request a new link.
Existing organizer-issued personal links remain valid and can be revoked, along
with email sign-in links and sessions. Secure HttpOnly SameSite cookies,
CSRF tokens, origin checks, and a restrictive content security policy protect
browser requests. Family member API responses contain only the person's own
content and the name, wish list, message, and gift ideas of their recipient after
finalization. Group submission sessions expose only their own form, including
after the draw. Neither exposes a list of other family members, their email
addresses, or the incoming giver.

The organizer export includes people, rosters, matching settings, exclusions,
and assignments. It omits session credentials and prepared email bodies. Full
SQLite backups include all runtime data and therefore need stronger storage
protection.
