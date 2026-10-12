# Data and delivery behavior

People have permanent random IDs, a display name, alternate names, and an email
address. Annual enrollments hold participation, wish lists, and gift ideas.
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

Invitation and assignment messages include a private personal link. Assignment
emails also snapshot the recipient's current wish list at preparation time.
The personal page shows the recipient's latest saved wish list. Existing
prepared messages remain unchanged by later wish-list edits.

Organizer authentication uses a server-side session and scrypt password hash.
The shared homepage sends a sign-in link only to a known, active participant in
the latest open, drafted, or finalized exchange. Responses do not disclose
whether an email is on the roster. Each person needs a separate email address.
Email sign-in tokens are random and hashed in SQLite, work once, and expire in
15 minutes. Requests are limited by IP and by email, with email limits surviving
restarts. Sign-in delivery never sends prepared invitation or assignment batches;
failed or uncertain links are not retried automatically. Request a new link.
Existing organizer-issued personal links remain valid and can be revoked, along
with email sign-in links and sessions. Secure HttpOnly SameSite cookies,
CSRF tokens, origin checks, and a restrictive content security policy protect
browser requests. Family API responses contain only the person's own wish list
and the name, wish list, and gift ideas of their recipient after finalization.
They contain no list of other family members, email addresses, or incoming giver.

The organizer export includes people, rosters, matching settings, exclusions,
and assignments. It omits session credentials and prepared email bodies. Full
SQLite backups include all runtime data and therefore need stronger storage
protection.
