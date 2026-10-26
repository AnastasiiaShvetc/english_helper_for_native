# Private progress synchronization

The application stays on GitHub Pages. `sync-server.cjs` is an independent service
on the owner's VPS, behind HTTPS at `/english-sync/`. It requires Node.js 24 or newer
with the built-in `node:sqlite` module; there are no npm dependencies.

The production service runs as `english-sync`, listens only on `127.0.0.1:8791`, and
stores its SQLite database in `/var/lib/english-sync/progress.sqlite` (mode 600).
Nginx forwards `/english-sync/` to the service without changing the existing sites.
CORS allows only `https://anastasiiashvetc.github.io`; this is an additional browser
restriction, not authentication. Every data request requires a random per-device
bearer token. Only token hashes are stored in the database. Tokens never belong in
the repository or a public URL.

## Connecting a device

The administrator creates a one-use code with:

```bash
sudo -u english-sync /opt/english-sync/bin/node \
  /opt/english-sync/server/sync-server.cjs --create-code device-label
```

Open the existing application URL with `#sync=<code>` on the intended device.
Codes expire after seven days and can be used only once. The fragment is removed
from the address before exchange, and the device receives its own token. Use a
different code for each device. In an installed home-screen PWA, open its Data page
and paste the invitation into the connection field instead: an external browser
may have a separate storage container from the installed app. The server rate-limits code exchanges. A device
keeps its token locally; clearing browser data requires a fresh invitation.

## Data preservation

- The original browser progress is backed up locally under
  `my-english-before-sync-v1` before its first sync.
- The first submitted snapshot from every device is retained in the server's
  `imports` table, unchanged.
- Answers and completed sessions form a union with stable identifiers. Identical
  legacy records copied across devices are deduplicated. Multiple identical legacy
  sessions retain the largest observed multiplicity: the old format has no IDs or
  start timestamps, so distinct but indistinguishable historic sessions cannot be
  distinguished from copied sessions. The raw imports remain available for recovery.
- Scheduling is rebuilt from the combined answer history. A currently open question
  is not replaced by a background refresh. Finished tasks carry a timestamped
  active-session clear marker.
- Each changing exchange retains a pre-merge snapshot (last 200). A systemd timer
  makes a consistent SQLite backup daily, retaining 30 days.
- Offline answers stay in local storage and retry on reconnect, focus and every
  15 seconds while the app is visible. No cross-device deletion/reset is provided.
- Importing a file or an older private progress link now merges rather than
  destructively replaces the current progress.

## Operations

```bash
systemctl status english-sync
journalctl -u english-sync -n 50 --no-pager
systemctl status english-sync-backup.timer
curl -fsS https://2-26-62-47.sslip.io/english-sync/health
```

`SYNC_DB`, `SYNC_PORT`, `SYNC_ORIGIN` and `SYNC_BACKUPS` override defaults for tests
or other deployments. Do not make the database or backup directory web-accessible.

## Verification

```bash
node --test tests/sync.test.cjs tests/server.test.cjs
node tests/browser-sync.cjs
```

The browser test needs Playwright and Chrome (`CHROME_PATH` may override its path).
It uses a separate temporary database and two isolated browser contexts. It does not
touch production progress. Tests cover authentication, denied origins, one-use
codes, persistence after service restart, offline recovery and duplicate prevention.
