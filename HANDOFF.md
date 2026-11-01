# Handoff: remaining work for RentByBob

Last updated: 1 Nov 2026 (branch `Final-Pilot-Testing`, commit `8c64e66` or later).
Written for any coding assistant (GitHub Copilot, Claude, others) picking this project up. Read `AGENTS.md` first;
its rules override anything here. Then read `docs/STATUS.md` (newest entry at the top), `docs/DECISIONS.md` and
`docs/SECURITY.md` before changing anything.

## What this project is

RentByBob is a rent tracker for Sir Bob's boarding houses (B. Zubiri St., Labangon, Cebu City), in a 90-day pilot.
One owner, one clerk (James), about 25 rooms and spaces. Tenants see their own room, balance and confirmed payments.

- Stack: React + strict TypeScript + Vite + Tailwind-style CSS (`src/styles.css`, `src/landing/landing.css`),
  Supabase (Auth, PostgreSQL with RLS, one Edge Function `invite-account`), hosted on Cloudflare Workers static assets
  (`wrangler.jsonc`). Live site: `https://rentbybob.acegrantk.workers.dev`. Supabase project ref: `hxkfuwqxpykckxvsbvbc`.
- All money writes are transactional `SECURITY DEFINER` PostgreSQL functions in `supabase/migrations/`. Never write
  money logic in the browser. Pending reports and uncleared checks never reduce settled balances.
- Staff need MFA (aal2) or a "remembered device" (aal1 plus header `x-rentbybob-device`, checked by
  `private.trusted_device_ok()`). Anything new that calls the database as a staff member must forward that header.
- Languages: English and Filipino (Tagalog). Code `fil`. Old code `ceb`/Bisaya was removed; some identifiers still say
  `bisaya` (for example `translate(english, bisaya)`); that is only a variable name.

## Ground rules (from AGENTS.md, repeated because they matter)

- Never print, commit or paste secrets (keys, passwords, the Gmail app password, `.env*` values).
- No production deployment, `supabase db push`, `functions deploy` or purchases unless the owner explicitly says so.
  Prepare the change, then tell the owner the exact command to run.
- New database behaviour goes in a NEW migration file (`supabase/migrations/YYYYMMDDNNNN_name.sql`). Never edit an
  applied migration. The live database has every migration up to `202611010001_real_email_invitations.sql`.
- Exact money arithmetic only (no floating point). Philippine business dates (Asia/Manila), UTC timestamps.
- Accessibility: 18px base text, 44px touch targets, visible focus, persistent labels, statuses in words, works at 200%
  zoom and 320px wide. Do not claim WCAG compliance.
- Fake data only in development and tests (`.invalid` or `example.com` addresses).
- Update `docs/STATUS.md` (new entry at the top: request, what changed, validation evidence, limitations, next steps)
  for every change.

## How to check your work (Windows, PowerShell or Git Bash)

```
npm test                                 # unit + in-memory PostgreSQL (PGlite) tests; must stay all-pass (120+ tests)
npm run build                            # tsc --noEmit + vite build
node scripts/check-production-build.mjs  # bundle, headers and redirects
npm run test:csp                         # production build under its own Content Security Policy
npm run test:offline                     # browser checks with Playwright + Edge (see Task 1: five are stale)
npm run dev                              # dev server; add ?preview=1 for a fictional signed-in workspace, ?atoms=1 for the style guide
```

Gotchas: use `npx.cmd` (not `npx`) in PowerShell. Many files use CRLF line endings; scripts that search for `\n}\n`
fail on them, so normalise or use an editor-style replace. Playwright scripts use `channel: 'msedge'`. Preview any
season with `#theme=halloween`, `#theme=christmas` or `#theme=none`.

## Owner actions (no code; remind the owner)

1. Merge `Final-Pilot-Testing` into `main` so Cloudflare redeploys the site.
2. Run `npx.cmd supabase functions deploy invite-account` (needed for invitations on a remembered device; until then
   staff must sign in with the authenticator code to invite).
3. Paste the friendlier invite email into Supabase > Authentication > Emails > Invite user (text is in the chat
   history; it explains who is sending and why, in English and Filipino). Ask tenants to mark it "Not spam".
4. Put the real phone number in `CONTACT` in `src/landing/LandingPage.tsx` (`phone` and `phoneHref`, for example
   `'0917 123 4567'` and `'tel:+639171234567'`). It is empty now, so the Call button is hidden.
5. Confirm the Facebook link `https://www.facebook.com/jameslee.gica.1`: it is used both as the property's Facebook
   button (`CONTACT.facebookHref`) and on James's team card (`src/landing/street.tsx`, `james`). Change either if wrong.
6. Have a native speaker review the Filipino text (`src/i18n.ts`, the `fil` block, plus `translate(...)` calls in
   `src/App.tsx`, `src/access/*.tsx`, `src/landing/*.tsx`, `src/components/Seasonal.tsx`, `src/components/Network.tsx`).
7. Supabase Auth settings (`docs/TRIAL_LAUNCH.md` step 2.5): signups off, minimum password 12, TOTP on, Email OTP
   expiration 86400.

## Code tasks

Each task says whether the owner must agree first. Do one task per branch/commit, run the checks, update STATUS.md.

### Task 1: Fix the five stale browser checks (no approval needed; maintenance)

`npm run test:offline` fails in `scripts/check-dashboard-preview.mjs`, `check-paid-rent.mjs`,
`check-deferred-screen.mjs`, `check-renter-preview.mjs` and `check-public-availability-preview.mjs`. They still expect
the old Bisaya wording (for example button "Show basic Bisaya", heading "Panid sa tag-iya", "Maayong pagbalik",
"Sample nga preview · Sample nga datos nga offline", alert "Wala maablihi kini nga bahin.", "Nabilin nga abang",
"Mga kwarto nga paabangan"). Replace each expected string with the current Filipino text from `src/i18n.ts` or the
component (for example the language button is now "Show Filipino"/"Ipakita sa Filipino" via `t.showBisaya`; the
renter and public pages toggle "English · Filipino" / "Filipino · English"; the deferred alert is
"Hindi mabuksan ang bahaging ito."). Do not change the app to match the tests. Done when `npm run test:offline` passes.

### Task 2: Invitation link opens your own site (owner agreement; best after Task 3)

Invite emails link to `hxkfuwqxpykckxvsbvbc.supabase.co/auth/v1/verify...`, which spam filters dislike. Change to a
link on the site: in the Supabase Invite template use
`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite`, and in `src/access/client.ts` (the
`/auth/callback` block, which today accepts only `#access_token=...&type=invite|recovery`) also accept
`?token_hash=...&type=invite|recovery` by calling `supabase.auth.verifyOtp({ token_hash, type })`, then clear the URL
with `history.replaceState`. Keep the existing hash flow working. Add a unit test for the URL parsing. Same for the
Reset password template (`type=recovery`).

### Task 3: Own domain and a proper mail sender (owner agreement; costs about PHP 700/year)

Owner buys a domain (for example `rentbybob.com`), adds it to Cloudflare, points the Worker at it, and sets up Brevo or
Resend with SPF, DKIM and DMARC records, then switches Supabase SMTP from the Gmail app password to that sender
(`noreply@<domain>`). Code changes afterwards: `APP_ORIGIN` secret, Supabase Site URL and Redirect URLs,
`public/_headers` and `scripts/check-production-build.mjs` only if they name the old address, `docs/TRIAL_LAUNCH.md`.

### Task 4: Owner "Activity" feed (owner agreement)

Accepted on 28 Oct 2026: one clerk can record and confirm cash, clear and reverse checks, and record handovers. The
promised compensating control is an owner-only page listing recent money actions from `public.audit_events` (who, what,
when, which tenant/room, amount where relevant). Add a read-only `SECURITY DEFINER` function
`read_recent_activity(p_property_id uuid, p_limit int)` that requires `private.staff_role(...) = 'owner'`, returns at
most 200 rows, no secrets or recipient emails; a database test for owner-allowed, clerk/tenant/anonymous-denied; and a
section under "Accounts & security" in `src/App.tsx` (navigation ids live in `navigationItems`). Use `LoadingSkeleton`
with `shape="table"` while loading.

### Task 5: Protect the public inquiry form from scripted spam (owner agreement; needs Cloudflare setup)

The public "ask about this room" form is limited per property and per room per hour in the database, but one script can
still fill the cap. Options: Cloudflare Turnstile verified inside a small Edge Function before calling the existing
inquiry function, or a Cloudflare rate-limit rule. Keep "no extra backend" (Supabase Edge Functions only).

### Task 6: Invitation address retention (owner decision first)

Recipient emails stay in `private.invitation_attempts` indefinitely. Ask the owner how long to keep them (for example
until accepted plus 90 days), then add a migration with a cleanup function that keeps open and uncertain attempts.
Record the decision in `docs/DECISIONS.md`.

### Task 7: After the pilot (owner agreement, based on real use)

- Remove screens nobody used (candidates: Invitation review, Access history) or fold them into an "Advanced (owner)"
  group in `staffNavigation()` in `src/App.tsx`. The owner was told this is not needed during the pilot.
- If phones struggle, default the landing street animation to off for lite devices (`src/perf.ts`, `data-perf="lite"`,
  `src/landing/street.tsx`). Do not add more landing decorations.

## Recently finished (for context; do not redo)

- Real email invitations (migration `202611010001`, `supabase/functions/invite-account/index.ts`,
  `src/access/ManageAccess.tsx`): any valid address; re-invite allowed after an issued or rejected attempt, never while
  one is open or uncertain; confirmed accounts refused (`RB409`); hosted projects send only with secret
  `INVITE_EMAIL_ENABLED=true` (set on the live project).
- Remembered-device header now reaches the invite function (`src/access/trusted-device.ts`, forwarded with
  `setHeader` in the function).
- Loading skeletons shaped like each screen (`LoadingSkeleton` `shape` prop in `src/components/atoms.tsx`) with slow
  and offline messages; connection bar and notice (`src/components/Network.tsx`, `src/components/requests.ts`).
- Seasonal touches in the app (`src/components/Seasonal.tsx`), Halloween 24 Oct to 23 Nov, Christmas 1 Dec to 6 Jan,
  switchable in Account security and on the landing page.
- Phone layout fixes: developer card hint, landing decorations button, sun and moon position, signed-in app bar.
