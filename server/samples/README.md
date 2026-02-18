# Bill of Entry sample

Place your sample BOE PDF here so the parser can be tested against your real format.

**Recommended:** Name it `BE-5066726.pdf` (or any name).

Then run:

```bash
node server/scripts/parse-boe-sample.js server/samples/BE-5066726.pdf
```

Or from project root with default path:

```bash
node server/scripts/parse-boe-sample.js
```

The script prints:
1. The raw text extracted from the PDF (so we can see exact layout of duty fields, assessable value, etc.)
2. The parsed result (BE number, date, duty fields, assessable value, etc.)

Use this output to confirm the parser matches your BOE format. All BOE files are assumed to follow the same layout; only numbers and data change.
