# Match history

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
