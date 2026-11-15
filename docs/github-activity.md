# GitHub activity snapshot

The activity section on `/evolution/` is driven by a checked-in snapshot at
`github-activity/snapshot.json`. The browser never calls GitHub directly; the
snapshot is refreshed at build time by `scripts/activity-refresh.mjs`.

## Allowlist

Only repositories listed in `github-activity/snapshot.json` under
`allowed_repositories` can appear in the snapshot. The refresh script reads the
allowlist from the file itself, so adding a repository is a deliberate,
reviewed change.

To allow a new repository:

1. Open `github-activity/snapshot.json`.
2. Add the public GitHub URL to `allowed_repositories`.
3. Run the validator:
   ```powershell
   node github-activity/validate.mjs
   ```
4. Commit both files in the same PR.

### Canonical owner rule

Every URL is canonicalized to the public owner `cristian-cardona-dev` at refresh
time. The snapshot stores the canonical URL even if the source allowlist entry
used a different owner. This prevents a stale or alternate owner from leaking
into the published site.

## Manual refresh

### Dry run

Fetch every allowlisted repository and print a summary without writing the file:

```powershell
node scripts/activity-refresh.mjs --dry-run
```

A dry run is useful before adding a repository or after rotating tokens.

### Live refresh

Write the refreshed snapshot to `github-activity/snapshot.json`:

```powershell
node scripts/activity-refresh.mjs
node github-activity/validate.mjs
```

The refresh needs a `GITHUB_TOKEN` environment variable with `public_repo`
scope (the default `secrets.GITHUB_TOKEN` in GitHub Actions works). Without a
token the API rate limit is much lower and the refresh may fail.

### Freshness guard

The quality pipeline fails if the snapshot is older than 14 days:

```powershell
node github-activity/validate.mjs --max-age-days=14
```

Run the same command locally before opening a PR if the snapshot has not been
refreshed recently.

## "Refresh now" dispatch

Trigger a refresh manually from the command line:

```powershell
gh workflow run activity-refresh.yml
```

This works from any branch and uses the workflow defined in
`.github/workflows/activity-refresh.yml`.

## Automation

- **Daily cron:** the workflow runs at `06:17 UTC` every day (`17 6 * * *`).
- **Deploy dispatch:** when the refreshed snapshot actually changes (ignoring the
  `captured_at` timestamp), the workflow commits the update and dispatches
  `.github/workflows/deploy-static.yml` with `pipeline=web` so the site is
  rebuilt with the new activity.

A timestamp-only refresh is a no-op: the workflow strips `captured_at` before
comparing old and new snapshots, so it does not commit or redeploy when nothing
else changed.

## Schema reference

`github-activity/snapshot.json` follows the schema enforced by
`github-activity/validate.mjs`:

- `schema_version`: fixed at `"1.0.0"`.
- `snapshot_id`: stable identifier for this fixture.
- `captured_at`: UTC ISO timestamp of the refresh.
- `status`: object with `availability` (`available`, `empty`, or `unavailable`),
  `stale` (boolean), and a human-readable `message`.
- `source`: always `provider: "github"`, `mode: "checked_in_fixture"` or
  `"build_snapshot"`, and `url: "https://github.com/"`.
- `allowed_repositories`: unique list of canonical public GitHub URLs.
- `repositories`: array of records, each with `id`, `url`, `visibility`,
  `open_pull_requests`, and arrays of `pull_requests`, `commits`, `releases`,
  and `deployments`.

### `deployments` is retained but always empty

The schema keeps a `deployments` array on every repository for forward
compatibility, but the current refresh script does not fetch deployments. The
array is always `[]`. If a future change starts fetching deployments, the schema
and validator already accept the shape and no migration is needed.

### `stale` is tied to the 90-day age policy

`status.stale` is computed from `captured_at`: it is `true` when the snapshot is
older than 90 days. The quality pipeline uses `--max-age-days=14` to fail much
sooner, but the schema-level `stale` flag follows the documented 90-day policy.
A snapshot with `stale: true` must also include a reviewed `stale_reason`.

## Troubleshooting

### Rate limit

If you see `GitHub API 403` in the refresh output:

- Ensure `GITHUB_TOKEN` is set.
- Wait for the rate-limit window to reset.
- Use `--dry-run` to verify the allowlist before consuming a live write.

### All repositories failed

If every allowlisted repository fails, `activity-refresh.mjs` exits non-zero and
writes nothing. Check:

- Network access to `api.github.com`.
- Whether the token has expired or lacks scope.
- Whether every repository in the allowlist is still public.

### Stale snapshot

If `node github-activity/validate.mjs --max-age-days=14` fails:

1. Run `node scripts/activity-refresh.mjs` to refresh.
2. Re-run the validator.
3. Commit the updated `github-activity/snapshot.json`.

If the snapshot is intentionally older than 14 days (for example, during a
feature freeze), set `status.stale: true` and add a `stale_reason` explaining why
the older data is still correct. Do not bypass the validator.
