# Match history

Past years appear only in **History**, not in the active-year selector. For the
current draw, the page shows the two preceding calendar years and their status.
Use **Review [year] history** from History or Draw to inspect pairings without
switching the active exchange. Unconfirmed imported records have an explicit
confirmation form; **Confirmed** means no further confirmation is needed.
**Edit [year] pairings** loads the saved names and keeps an already confirmed
record checked when editing. Saving returns to the same active draw year.

If a current member is absent from that historical roster, review shows their
name so you can check whether they participated. Add only their actual historical
matches; members who joined later need no invented history. Former participants
can remain in past pairings without entering the current draw.

Import or edit one pairing per line in **History**, or import a JSON file:

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

The tester labels the draw year and the two history years it checks. Historical
exchanges cannot be tested as new draws. Incomplete or unconfirmed history has
direct review buttons, and a passing test is qualified as using recorded history
until both years are confirmed. Confirmation also checks the recorded historical
participant list for a complete one-to-one draw.

The preceding two years must either have verified matches or an explicit
organizer confirmation that no exchange happened. New families can record
those empty years in **History**. Existing match histories cannot be erased
using the empty-year option; do not invent placeholder matches.
