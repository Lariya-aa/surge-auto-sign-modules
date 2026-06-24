# Surge Auto Sign Modules

Chinese documentation is available in [READMEzh.md](READMEzh.md).

This repository contains a multi-site auto sign-in and daily activity framework for Surge / Quantumult X / Loon. It is structured as a shared runtime plus site-specific adapters and generated single-file scripts:

- `scripts/core/`: runtime, HTTP, storage, parsing, safety limits, and scheduling.
- `scripts/adapters/`: site-specific behavior.
- `scripts/dist/`: generated single-file scripts loaded by `.sgmodule` files.
- `modules/`: Surge module files.
- `tools/`: build and local check scripts.
- `tests/`: offline core tests.

## Included Modules

| Module | File | Capabilities |
|---|---|---|
| PSNINE | `modules/psnine.sgmodule` | Cookie capture, auth check, sign-in entry parsing, sign-in request, notification |
| Keylol | `modules/keylol.sgmodule` | Cookie capture, daily visit, points/HP/steam parsing |
| Linux.do | `modules/linuxdo.sgmodule` | Chrome/Profile A Cookie capture, account-A auth check, scheduled random topic browsing |
| Bahamut | `modules/gamer.sgmodule` | Login, CSRF fetch, main-site sign-in, guild sign-in, Anime question answering |

The Linux.do module intentionally does not implement automatic replies, post creation, or reactions.

Linux.do currently runs only Account A for testing. Keep Account A logged in to Chrome/Profile A, then bind the fixed slot once:

- In Chrome/Profile A, open `https://linux.do/?autosign_account=A`

Scheduled browsing policy:

- Monday-Friday 09:00-10:00: randomly browse 10 different topics.
- Monday-Friday 13:00-15:00: randomly browse 15 different topics.
- Monday-Friday 17:00-18:00: randomly browse 10 different topics.
- Saturday-Sunday 20:30-22:00: randomly browse 10 different topics.

Surge starts the task at the beginning of each window. The script then waits for a random delay inside that window and browses different topics. If proxy changes cause Linux.do to invalidate the session, log in again in Chrome/Profile A and open `https://linux.do/?autosign_account=A` to refresh the slot.

## Usage

1. Install the desired site module URL in Surge.
2. Enable the MITM hostnames declared in the module.
3. Log in to the target website and open a matching page to capture cookies.
4. Wait for the cron task or run the script manually in Surge.

Module URLs:

- PSNINE: `https://raw.githubusercontent.com/Lariya-aa/surge-auto-sign-modules/main/modules/psnine.sgmodule`
- Keylol: `https://raw.githubusercontent.com/Lariya-aa/surge-auto-sign-modules/main/modules/keylol.sgmodule`
- Linux.do: `https://raw.githubusercontent.com/Lariya-aa/surge-auto-sign-modules/main/modules/linuxdo.sgmodule`
- Bahamut: `https://raw.githubusercontent.com/Lariya-aa/surge-auto-sign-modules/main/modules/gamer.sgmodule`

For Bahamut credential-based login, configure these persistent keys:

- `AutoSign.gamer.config.uid`
- `AutoSign.gamer.config.password`
- `AutoSign.gamer.config.totp` optional
- `AutoSign.gamer.config.guild=false` disables guild sign-in
- `AutoSign.gamer.config.answer=false` disables Anime question answering

## Development And Verification

After editing `scripts/core/` or `scripts/adapters/`, rebuild the generated scripts:

```bash
node tools/build-modules.mjs
```

Run local checks:

```bash
node tools/check.mjs
```

The check verifies:

- `modules/*.sgmodule` files exist.
- Module `script-path` values exist; local paths are resolved to dist files, while remote raw URLs skip local path checks.
- `scripts/dist/*.js` passes `node --check`.
- The Linux.do dist file does not contain posting/replying/reaction surfaces.
- Core parser/safety offline tests pass.

## Notes And Limits

Without real cookies, MITM setup, and live site responses, local checks cannot prove that every remote sign-in will succeed. They prove that the framework builds, generated scripts load, missing-cookie paths fail clearly, and Linux.do has no automatic reply surface. Real sign-in behavior must be verified inside Surge after cookie capture.

Website markup and APIs can change. If a script reports a missing token, missing sign-in entry, or expired login state, update the corresponding adapter.
