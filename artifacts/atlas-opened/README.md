# Atlas Opened release checks

These checks do not send Community Assistant questions.

Run the local route check after the new files exist:

```powershell
node artifacts/atlas-opened/check-http.cjs
```

It discovers every file under `public/atlas/opened/`, confirms staging serves each one with `noindex`, and confirms production rejects them even when a staging Host header is supplied. Results are saved to `artifacts/atlas-opened/http-check.json`.

After staging reports the exact commit as ready, run:

```powershell
node artifacts/atlas-opened/check-release.cjs 0123456789abcdef0123456789abcdef01234567
```

The release check compares staging bytes with the newly added files, checks both existing Atlas routes, and confirms every Atlas file from baseline `3f5c5673551c6ef2901bccf3cf36b9265c834b32` is unchanged. Text files ignore CRLF-only differences; binary files are compared byte-for-byte. Results are saved to `artifacts/atlas-opened/release-check.json`.
