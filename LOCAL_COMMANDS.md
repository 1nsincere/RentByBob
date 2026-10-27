# Local commands cheat sheet

Run these in **PowerShell** (or the VS Code terminal) from the project folder:

```powershell
cd "C:\Users\acegr\Desktop\Rent Tracker System"
```

Everything here uses your **local** computer only. Nothing is sent to the internet or to real tenants.

---

## 1. Start everything (every day)

| Step | Command | Notes |
|---|---|---|
| 1 | Open **Docker Desktop** from the Start menu | Wait until it says "Engine running". The database needs it. |
| 2 | `npx.cmd supabase start` | Starts the local database, sign-in, email inbox and Studio. Your data is kept. |
| 3 | `npm.cmd run dev:local` | Starts the real app. Leave this window open. |

Then open in your browser:

| What | Address |
|---|---|
| Landing page (what visitors see first) | http://127.0.0.1:5173 |
| Real app sign-in (owner, clerk, renter) | http://127.0.0.1:5173/sign-in |
| Public rooms page (what visitors see) | http://127.0.0.1:5173/rooms |
| Fictional preview (sample data, no sign-in) | http://127.0.0.1:5173/?preview=1 |
| Fictional renter view | http://127.0.0.1:5173/?preview=renter |
| Local email inbox (invites, password resets) | http://127.0.0.1:54324 |
| Supabase Studio (users, tables, a clerk's ID) | http://127.0.0.1:54323 |

**To run the preview on its own port (5175) at the same time as the real app**, open a second window:

```powershell
npx.cmd vite --host 127.0.0.1 --port 5175 --strictPort
```

Then use http://127.0.0.1:5175/?preview=1

---

## 2. Stop everything

| What | How |
|---|---|
| The app (port 5173 or 5175) | Click its terminal window and press **Ctrl + C** |
| The local database | `npx.cmd supabase stop` (your data is kept) |
| Docker | Quit Docker Desktop from the system tray (optional) |

---

## 3. After pulling new code or when told "apply the database update"

Stop the app first (Ctrl + C), then:

```powershell
npx.cmd supabase db push --local
```

This applies any new files in `supabase/migrations` (as of 27 Oct 2026 the newest is `202610270012_renter_payment_reports.sql`). To see which ones are applied:

```powershell
npx.cmd supabase migration list --local
```

If a sign-in setting was changed (`supabase/config.toml`), restart the database so it takes effect:

```powershell
npx.cmd supabase stop
npx.cmd supabase start
```

Then start the app again with `npm.cmd run dev:local`.

> Do **not** run `npx.cmd supabase db reset` or `npx.cmd supabase db pull`. Reset erases your local data, and pull is not needed.

---

## 4. Checking the database is running

```powershell
npx.cmd supabase status
```

If it says it cannot connect to Docker, open Docker Desktop and try again.

---

## 5. Tests (optional, before saving work)

| Command | What it checks | Time |
|---|---|---|
| `npm.cmd test` | Unit and database-rule tests (no browser) | about 1 minute |
| `npm.cmd run test:offline` | Browser checks of the fictional preview | about 3 minutes |
| `npm.cmd run verify:release` | Tests, production build and safety checks | about 2 minutes |
| `npm.cmd run test:csp` | The production build works under its security headers | about 1 minute |
| `npm.cmd run test:perf` | Speed on a simulated phone | about 1 minute |
| `npm.cmd run test:cash:supabase` | Full end-to-end test on a throwaway database with fictional data | about 8–10 minutes |

Stop the app on port 5173 before `test:offline` or `test:cash:supabase`, because they use that port too.

---

## 6. Backups

Make a backup of your local database (kept 30 days, stored outside the project folder):

```powershell
powershell.exe -NoProfile -File scripts\backup-local.ps1
```

Check that the newest backup can be restored (uses a throwaway copy, does not touch your data):

```powershell
powershell.exe -NoProfile -File scripts\rehearse-restore.ps1
```

To make backups run automatically every day, see "Daily backup" in `docs/OPERATIONS.md`.

---

## 7. Forgot a local password

```powershell
powershell.exe -NoProfile -File scripts\reset-local-password.ps1
```

It asks for the email and a new password (at least 12 characters, hidden while typing). Local accounts only.

---

## 8. Saving your work to GitHub

```powershell
git status
git add -A
git commit -m "Describe what you changed"
git push
```

---

## 9. If something goes wrong

| Problem | Fix |
|---|---|
| "Port 5173 is already in use" | The app is already running in another window. Use that, or close it with Ctrl + C. |
| App shows "records unavailable" or a button errors | Run `npx.cmd supabase db push --local` (section 3), then restart the app. |
| Cannot connect to Docker | Open Docker Desktop and wait for "Engine running". |
| No invite or reset email arrived | Check the local inbox at http://127.0.0.1:54324 (no real emails are sent locally). |
| Need a clerk's account ID | Studio → Authentication → Users (http://127.0.0.1:54323), or just use the clerk's email in Payments → More tools → Setup. |
