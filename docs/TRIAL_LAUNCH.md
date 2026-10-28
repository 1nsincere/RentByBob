# Launching the 90-day client trial

Written 27 Oct 2026 for the owner/developer. Nothing here has been done yet; every step uses your own accounts. Do the steps in order. Never paste a service-role key, database password or anyone's password into the code, chat, screenshots or Cloudflare.

What you will end up with: one live website (Cloudflare Pages) connected to one live database (a new Supabase project), with your client's staff signing in, entering their real tenants, and running alongside their paper records.

## 1. Check the code (10 minutes)
1. `npm.cmd ci`
2. `npm.cmd run verify:release`, `npm.cmd run test:offline`, `npm.cmd run test:csp`, `npm.cmd run test:cash:supabase` - all must pass.

## 2. Create the live database (Supabase, 20 minutes)
1. supabase.com > New project. Region: **Southeast Asia (Singapore)**. Name: e.g. `rentbybob-live`. Choose a strong database password and keep it in a password manager (you need it for step 2.4 and for backups).
2. Plan: the Free plan works to try things, but it pauses after a week without use and has no daily backups. For a trial with real money records, use **Pro** (check the current price on supabase.com/pricing).
3. Project Settings > API: note the **Project URL** (`https://<20 letters>.supabase.co`) and the **publishable (anon) key**. Both are public values. Do not use the service-role key anywhere.
4. Put the database structure in (from this folder):
   - `npx.cmd supabase login`
   - `npx.cmd supabase link --project-ref <the 20 letters>`
   - `npx.cmd supabase db push` - review the list: it must end with `202610280001_notebook_months_double_check.sql`.
   - `npx.cmd supabase functions deploy invite-account`
   - `npx.cmd supabase secrets set APP_ORIGIN=https://<your-site>.pages.dev` (after step 3 gives you the address; you can come back to this)
5. Authentication > Sign In / Providers: **signups off**, anonymous sign-ins off. Authentication > Settings: minimum password length **12**, secure password change on. Authentication > Multi-Factor: **TOTP on**. On Pro, also turn on leaked-password protection and session limits (timebox 12 h, inactivity 2 h).

## 3. Pin the live database in the code (5 minutes)
The app refuses to connect to any online database unless its exact address is written in the code (protection against connecting to the wrong place).
1. In `src/access/connection.ts`, set `productionUrl` to your Project URL, for example `export const productionUrl: string | null = 'https://abcdefghijklmnopqrst.supabase.co'`.
2. In `src/landing/LandingPage.tsx`, replace the placeholder phone number and Messenger link in `CONTACT`.
3. Run `npm.cmd test`, commit and push.

## 4. Publish the website (Cloudflare Pages, 15 minutes)
1. dash.cloudflare.com > Workers & Pages > Create > Pages > Connect to Git > choose the private repository.
2. Production branch: the branch you pushed (`Pilot-Test-Branch`, or merge it into `main` first).
3. Build command `npm ci && npm run build`; output directory `dist`.
4. Environment variables (Production): `VITE_SUPABASE_URL` = Project URL, `VITE_SUPABASE_ANON_KEY` = publishable key, `VITE_SUPABASE_TARGET` = `production`, `NODE_VERSION` = `24`.
5. Deploy. Your address is `https://<name>.pages.dev` (a custom domain can be added later).
6. Back in Supabase > Authentication > URL Configuration: Site URL = your Pages address; Redirect URLs = the address and `<address>/auth/callback`. Finish step 2.4's `APP_ORIGIN` secret.

## 5. Create the owner and the staff (20 minutes)
1. Supabase > Authentication > Users > **Add user** > the owner's email and a temporary password, tick auto-confirm.
2. Supabase > SQL Editor: open `scripts/bootstrap-live-owner.sql`, replace the two `REPLACE_WITH_...` values (owner email, property name), run it once.
3. Open the website, sign in as the owner, set up the authenticator app (MFA), then change the password (Account security).
4. For James and other staff: create their sign-in the same way (Add user, auto-confirm), then in the app: Accounts & security > **Assign or disable access** > their email > Clerk. They set up MFA at first sign-in.
5. Email invitations instead of manual users need a mail sender: Supabase > Authentication > SMTP (for example a Gmail/Google Workspace or Brevo account). Without SMTP, use Add user.

## 6. Enter the property and tenants (1-2 hours with James)
1. Buildings and units > **Create layout** (Building 1, Building 2, House 1, Bob's house, stores, Yamaha).
2. Add tenant record for each current renter: room, move-in date, monthly rent.
3. Payments > More tools > Setup: assign the cash verifier by James's email (confirm it with him in person).
4. Rent already owed from before the trial: on each tenant's account (Payments > Rent by month) use **Months owed from the notebook**: pick the first and last unpaid month and write which notebook notes they come from. They wait outside the balance until a *different* staff member (James or the owner) ticks them and presses "I checked the notebook: make these final". If a move-in date is only a guess, tick that in Add tenant; the other person confirms it too. Then check every balance against the paper ledger with James.
5. Only then turn on Automatic monthly rent and Automatic room listing.
6. Renters who want to see their account: create their sign-in (Add user) and link them under Assign or disable access > Renter.

## 7. Run the trial
- Week 1-2: record every payment in both the paper ledger and the app; compare totals every Friday (Payments > Paid rent report).
- Daily: the dashboard's Late rent list and "Renters say they paid" alerts.
- Backups (Pro has daily backups; also keep your own weekly copy): `npx.cmd supabase db dump --linked -f backup-YYYY-MM-DD.sql` and `npx.cmd supabase db dump --linked --data-only -f data-YYYY-MM-DD.sql`, stored outside the repository (they contain tenant data).
- Problems: write down the date, screen and what happened; nothing is lost by stopping to ask.

## If something goes wrong
- Website: Cloudflare Pages > Deployments > roll back to the previous deployment.
- Database: changes are never deleted by the app (reversals and archives keep history). Restore only from a backup into a new project first (see OPERATIONS.md).
