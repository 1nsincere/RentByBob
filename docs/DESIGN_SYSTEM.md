# RentByBob interface design system

## Theme v2: property-management dashboard style - 26 Oct 2026

Supersedes the earlier same-day "visual refresh". The user supplied a property-management dashboard screenshot as inspiration and asked for a less basic, more polished feel with gradients and motion. Adopted from it: a navy sidebar panel with a bright-blue active item, bright-blue primary buttons with a subtle vertical gradient, a cool grey-blue page, white cards with soft shadows, tinted icon circles on dashboard actions and summary tiles, and a blue gradient welcome card with white action cards inside. Not adopted: charts, revenue KPIs, search and notification icons, because the app has no approved data or workflow behind them, and fictional financial figures must not look real.

Implementation: token values at the top of `src/styles.css` (including new `--nav-*`, `--tone-*`, `--hero-gradient` and `--facade-*` tokens) plus one labeled "Theme v2" block at the end. Dashboard actions and summary tiles gained `aria-hidden` icons; no logic or data changed.

Rules:
- One elevation system: top-level cards share border and shadow; nested cards are flat. Decorative stripes are removed; left bars remain only where they mark something to act on (cash confirmation review, rent-change review, amount still due, preview notice).
- Motion: cards lift 2px on hover, buttons press down slightly, and dashboard and directory content rises in over 420ms. Tiles in one row animate together so the layout never looks uneven; only the tenant card list is staggered. All transforms and entrance animations are removed under `prefers-reduced-motion`.
- Focus rings show for keyboard users on focused containers (`:focus-visible`), turn white on the navy sidebar and blue hero, and are omitted on headings focused only for screen-reader announcement.
- Phone header: identity on its own line and labeled toggles in one wrapping row; the identity line is hidden in the fictional preview because the environment bar already labels it.

Measured contrast (sRGB, WCAG formula), 26 Oct 2026:

| Foreground | Background | Ratio | Minimum |
| --- | --- | ---: | ---: |
| Text `#0F1D33` | Page `#F2F5FA` | 15.45:1 | 4.5 |
| Secondary `#4B5A70` | Support `#EAEEF5` | 6.02:1 | 4.5 |
| White | Primary `#1D5FD6` | 5.74:1 | 4.5 |
| White | Gradient top `#2563EB` | 5.17:1 | 4.5 |
| Hero text `#EEF3FF` | Hero gradient top `#2563EB` | 4.65:1 | 4.5 |
| Primary `#1D5FD6` | Page `#F2F5FA` | 5.25:1 | 4.5 |
| Nav text `#C9D5E8` | Sidebar top `#13305C` | 8.83:1 | 4.5 |
| Nav label `#8FA3C2` | Sidebar top `#13305C` | 5.10:1 | 4.5 |
| Control border `#7A8699` | Support `#EAEEF5` | 3.17:1 | 3 |
| Icon tones (blue/teal/violet/amber) | Their tints | 4.37–5.68:1 | 3 |
| Dark text `#E9EEF7` | Dark surface `#111D31` | 14.50:1 | 4.5 |
| Dark secondary `#A9B6CA` | Dark support `#19273F` | 7.29:1 | 4.5 |
| White | Dark primary `#2563EB` | 5.17:1 | 4.5 |
| Dark icon tones | Their dark tints | 6.42–8.91:1 | 3 |
| Selected-room label `#9A3412` / `#FDBA74` | Surface (light/dark) | 7.31 / 10.01:1 | 4.5 |

A lighter gradient stop (`#2F74EA`) was rejected because white text measured 4.37:1. These are token measurements plus automated reflow, target and contrast checks, not a WCAG audit or a review with older users.

## Building front view drawn from room counts - 26 Oct 2026

Supersedes "Lodging-house facade illustration" below. The user asked for the building sketch to depend on the number of rooms. The front view now draws one door per space on each floor, using the counts and spaces entered in the preview:
- Rooms are panel doors labeled with their number. Apartments, houses and commercial units use an amber glass-door shape labeled with their name; shared spaces use the same shape.
- Rooms with an example tenant are filled blue and carry a white person mark, so occupancy is not shown by colour alone. The selected room has an orange outline and an underlined label.
- At most 10 doors sit in a row. Larger floors wrap into more rows, and the building widens with its busiest floor, so doors never overlap; this is checked at 14 rooms.
- A floor with no confirmed count shows a dashed "Room count not set" band rather than invented doors.
- The text alternative lists each floor's rentable rooms, special spaces and example-occupied count. The caption says positions and sizes are illustrative, not surveyed.
- Map and list thumbnails draw one band of windows per floor (up to 4 floors and 8 windows), and map tile subtitles are computed from the data (for example "9 rooms · 2 floors · Apartment").

Still preview-only and fictional: the saved database has no floor or occupancy model, and nothing here implies measured layout, capacity or vacancy.

## Payment history and room-rent setup

Keep payment history as distinct, compact entries with textual status, amount and actual receipt date; identify the collector for reported cash. Pending cash must say it is not confirmed and must not appear equivalent to a settled payment. Preserve a labeled empty state when no history exists.

After preview rent setup, display the current monthly rate as a separate summary and keep move-in date/rent fixed by default. Use an explicit, labeled checkbox to unlock the rate. The change review groups current rate, proposed rate, first effective rent month and due date, and states that earlier charges will not change. Provide a clear confirmation action and a separate way back to editing. Reflow the review and history fields on narrow screens; retain readable labels, visible focus and touch-sized controls. This flow is preview-only and must not be presented as an edit to persisted rent agreements.

## Paid-rent report

Use a spreadsheet-inspired, bordered report sheet with a clear month selector and summary metrics for confirmed cash, distinct renters and confirmed payment groups. The paid table should show renter, location, date cash was received, amount, rent months covered and acknowledgment action, then a total row. Put recorded charges with remaining balances in a separate outstanding section below. Keep receipt month and rent month independently labeled because they answer different questions. On phones, reflow rows into labeled compact cards rather than widening the page. Pending reports and uncleared checks are excluded from settled totals and balances. A missing charge is not labeled unpaid.

In payment account views, visually distinguish a pending cash report from the rent balance: label it “Pending · not confirmed” and explicitly state that it does not reduce the balance. Give collector and actual receipt date separate labels. In rent-by-month lists, keep month and due date apart from two separately labeled amounts: rent charged and still to pay. Label any combined room total as applying across accounts and state that it is not an extra charge. Reflow the amount groups under the month at narrow widths without hiding labels.

The outstanding section may offer an explicit selected-month charge action only to renters with an assigned room and saved rent setup, after showing the exact saved amount and calculated due date for confirmation. Show a separate multiple-months section for renters with positive balances in at least two distinct recorded rent months; include month names, count, rental location and total remaining. State clearly that the list reflects recorded charges, not absent months or overdue determinations. Keep all actions visibly preview-only, announce completion/errors, and stack confirmation controls at narrow widths.

## Mobile-first report and dashboard polish - 19 Oct 2026

Keep the existing warm ivory, charcoal, ink-blue and restrained brass palette and the local system sans-serif stack. On narrow screens, give the confirmed-cash metric the full first row; keep renter/payment counts together beneath it. Emphasize the selected-month remaining balance and visibly flag a non-empty 2+ month arrears list using the existing warning color and clear text, not color alone. Reflow tables into compact, labeled cards, retaining renter, rental space, date, amount, rent months, receipt/status and accessible table semantics. Tighten repeated spacing and explanatory text without hiding report content or reducing form/control targets.

For the dashboard preview, make the active-record count the prominent summary item and place property/access summaries together below it on phones. Compact the preview notice/navigation and whitespace so the tenant directory begins sooner. Keep the desktop three-card overview intact. Use short existing hover/pressed transitions; no additional movement or animation is needed for this refinement. Continue honoring reduced-motion settings.

## Staff dashboard home - 19 Oct 2026

Make the landing page the default staff workspace section. Show “Welcome back” and the authenticated email as the account identifier, followed by “What would you like to do today?” Give four clear, touch-sized actions: Log a payment, Add a tenant, View the property, and Find a tenant. Each action navigates to the corresponding existing screen without creating data. Keep the four choices in a two-column desktop layout and a single-column mobile layout; allow long email addresses to wrap. Keep a persistent Dashboard navigation item with a distinct icon and visible keyboard focus. Do not display this workspace on tenant-facing pages or assume an unverified profile name.

## Lodging-house facade illustration (historical; superseded 26 Oct 2026 by "Building front view drawn from room counts")

The focused building view uses a flat front elevation with a pitched roof, eaves, gable detail, horizontal floor divisions, a foundation and door-shaped room motifs. Render one floor band per configured floor and use a small, repeatable set of doors as a visual motif. The accessible image label and caption must state that door symbols do not indicate a room count; confirmed counts remain in the textual floor summaries and room tiles. Keep Building 1/2 at “Not set” until entered. Do not imply measured sizes, placement or a surveyed facade. This is a development illustration, not a tenant-facing plan.

## Illustrative building entry view

Bob’s house, Building 1 and Building 2 open a front-facing view from either the property sketch or building list. Use a restrained 650 ms fade/short scale-and-position arrival, without camera rotation or dramatic perspective. Turn off the animation under `prefers-reduced-motion`. Keep the property map/building list controls and a visible “Back to property map” button available in the focused view.

Present the building name, a floor selector, each floor’s rentable-room count and labeled room tiles. “Not set” is the required display for unconfirmed Building 1/2 counts; never derive counts from apartment/shared spaces. Bob’s six rooms are fictional preview examples. The facade and room arrangement are schematic only, not a measured or surveyed plan. Any edits remain in temporary preview state and reset on reload. Keep this visualization within the staff property workspace; do not introduce it into the tenant portal.

## Preserve the supplied site-map layout

Keep the property-map view as the first/default view under Buildings and units, with Building list as an alternate navigation option. Preserve the existing relative layout and labeled placements for Bob's house, Building 1, Building 2, House 1, Yamaha property and Stores 1-3, including the road and orientation. Keep the map keyboard-focusable and horizontally scrollable on narrow screens, with the building list available as an alternative. Do not reflow the plotted landmarks into a generic card grid or infer measured positions. The sketch remains illustrative and temporary; the current saved building/unit schema has no surveyed coordinates, so database locations must not be silently overlaid or presented as measured map placements.

## Single-origin development mode switch

Keep fictional preview and authenticated account workflows on one development origin, with a visible environment label showing whether the user is in offline preview, local development, hosted development or an unconfigured environment. The preview notice must state that records are fictional, temporary and isolated; provide an explicit “Return to account app” action. The account app offers “Open fictional preview” in development before sign-in and to staff, but not in the renter portal. Do not make either mode look like the other, mix their records, or hide the active local-versus-hosted authentication configuration. Keep header actions labeled and touch-sized, allow them to wrap on narrow screens, and retain keyboard focus styling. The switch is a development convenience, not a change to account access or backend selection.

## Saved cash readiness and amount guard

At the top of saved Payments and balances, show a compact, text-labeled readiness checklist from the current authorized database snapshot: verifier assignment, saved room agreements, saved monthly charges, and pending/confirmed cash counts. State that only real, owner-reviewed terms should be saved; never suggest that missing records or a verifier may be guessed. Give the owner a direct action to open the existing verifier-setup form when none is assigned. Before submitting pending cash, parse amount and balance as exact centavos and reject zero, malformed, out-of-range or over-balance amounts before the RPC. If no positive recorded balance exists, explain that an approved charge must be recorded first; do not allow an unallocatable report or imply advance credit. Keep pending-versus-confirmed labels explicit.

Show pending cash in a property-wide verification queue so the designated clerk can find reports without opening every agreement. Each item identifies the responsible tenant, building/unit, amount, actual receipt date, collector and pending status. Only the currently designated verifier sees the confirmation action; owners and other staff see the state but cannot confirm. Keep the confirmation review explicit and visible, then remove the item from the pending queue only after the database confirms settlement. Retain the agreement-level history and acknowledgment reopening separately.

For the selected saved agreement, show a staff-only read-only account statement. Identify the tenant and rental space, order rent charges by due date and confirmed payments by actual receipt date, show allocation months from each acknowledgment, and show the current remaining amount on each rent charge. Keep pending cash in its own labeled section and state that it is not included in the balance. The current agreement balance remains the authoritative total. Do not imply tenant access or add statement export in this slice.

Responsive verification for the saved cash surface: browser assertions cover 390px, 320px and 768px, plus a 160-CSS-pixel viewport as a narrow zoom approximation and 200% root text size at 320px. Keep statuses wrapping and forms on a `minmax(0, 1fr)` grid to prevent intrinsic-width overflow. Preserve 44px-or-larger button targets and the visible keyboard focus ring for acknowledgment actions. These are automated checks, not a full assistive-technology, browser-zoom or WCAG conformance audit.

## Admin/staff visual refinement - 19 Oct 2026

Updated the shared visual tokens toward warm ivory `#F7F4ED`, soft stone `#EEEAE4`, white surfaces and charcoal text. Replaced the primary teal with restrained ink blue `#245A81` / pressed-hover blue `#194363`; muted brass `#8D642E` is limited to small highlights. Positive, pending and error states retain separate semantic colors and visible status words. Tenant navigation/data boundaries and all financial workflow behavior are unchanged.

The system font stack now prefers Inter when installed, then falls back to local UI/system sans-serif fonts; no remote font is requested. Existing 18px root/body and form scale, 24px section headings, 20px subsection headings, helper text and 44px minimum controls are preserved. Buttons, cards, selected payment tabs and workspace navigation have short hover/pressed/focus transitions without information hidden on hover. Reduced-motion styling remains enabled. Payment worklist and cash balance panels use stronger grouping and tabular numerals; pending states remain explicitly labeled and never appear as settled.

Measured sRGB contrast ratios for the updated token combinations:

| Foreground / indicator | Background | Ratio | Check |
| --- | --- | ---: | --- |
| Main text `#252B31` | Ivory `#F7F4ED` | 13.02:1 | Normal text ≥4.5:1 |
| Main text `#252B31` | White `#FFFFFF` | 14.30:1 | Normal text ≥4.5:1 |
| Secondary `#4B535C` | Ivory `#F7F4ED` | 7.10:1 | Normal text ≥4.5:1 |
| Secondary `#4B535C` | Stone `#EEEAE4` | 6.55:1 | Normal text ≥4.5:1 |
| White `#FFFFFF` | Ink blue `#245A81` | 7.36:1 | Normal text ≥4.5:1 |
| White `#FFFFFF` | Hover blue `#194363` | 10.37:1 | Normal text ≥4.5:1 |
| Ink blue `#245A81` | Stone `#EEEAE4` | 6.18:1 | Text and selected navigation |
| Brass `#8D642E` | Ivory `#F7F4ED` | 4.79:1 | Text and restrained accent |
| Control border `#747982` | White `#FFFFFF` | 4.38:1 | Adjacent control edge ≥3:1 |
| Control border `#747982` | Ivory `#F7F4ED` | 3.98:1 | Adjacent control edge ≥3:1 |
| Control border `#747982` | Stone `#EEEAE4` | 3.67:1 | Adjacent control edge ≥3:1 |

Dark-theme token checks:

| Foreground / indicator | Background | Ratio | Check |
| --- | --- | ---: | --- |
| White `#FFFFFF` | Ink-blue action `#245A81` | 7.36:1 | Normal text ≥4.5:1 |
| White `#FFFFFF` | Pressed/hover action `#194363` | 10.37:1 | Normal text ≥4.5:1 |
| Main text `#F1F3F2` | Page `#171B1D` | 15.56:1 | Normal text ≥4.5:1 |
| Secondary `#C3CBCE` | Surface `#22282B` | 9.07:1 | Normal text ≥4.5:1 |
| Focus `#92CAFF` | Page `#171B1D` | 10.00:1 | Focus indicator |
| Control border `#93A2A8` | Surface `#22282B` | 5.67:1 | Adjacent control edge ≥3:1 |

These are token-pair checks only, not an accessibility certification or a complete rendered component contrast audit. Status pairs remain text-labeled. Browser verification covered the payment worklist at 320/390/768px, 200% root text at 320px with visible button target sizing, and paid-rent behavior at narrow widths. Full native zoom, keyboard, assistive-technology and manual touch review remain outstanding.

## Dark-theme surface and action consistency - 19 Oct 2026

The prior dark theme reused light-blue link colors as filled action backgrounds while retaining white text, and several dashboard/form/report surfaces still used fixed light colors. Split filled actions (`--action`, `--action-hover`, `--on-action`) from link colors and added shared theme tokens for table headers/stripes, pressed/hover surfaces, borders, status outlines and avatars. Applied them to selected navigation/tabs, property controls, dashboard actions, reports and semantic notices. Replaced the dashboard gradient fill with a solid surface. The acknowledgment preview remains intentionally paper-colored and uses dark print text in either theme; the MFA QR remains white for scanning.

The focused offline-preview browser check verifies the selected Paid rent control meets 4.5:1 in dark mode, the table heading uses a dark surface, the theme preference survives reload, and preview makes no external requests. It does not certify every rendered pair or native zoom/assistive-technology behavior. See [STATUS.md](STATUS.md) for test results and the next review step.

## Three-section workflow polish - 17 Oct 2026

Preview uses three labeled icon navigation links, restrained surfaces, dynamic summary counts, consistent teal actions and compact filters/sort. Tenant cards identify the rental space and named occupant count. Room rosters pair person icons with names/counts; never color alone. Add tenant uses grouped fieldsets, persistent labels, optional/required cues, a live summary, review/edit/confirm states and field-linked validation. Drafts remain mounted during section navigation. Narrow reflow and simulated 200% text sizing pass for the new form; full keyboard/screen-reader/native zoom audit remains open.

## Interactive directory and site map - 17 Oct 2026

Preview tenant cards show identity initials, textual active/archive status, building/room and expandable details, with Locate room navigation. SVG/CSS building illustrations and the fixed sketch use semantic buttons with selected state; no raster assets or icon-only primary controls. Room boxes grow into a responsive grid as counts change, with text labels for occupied/unassigned/shared spaces. Map is illustrative and explicitly not to scale; a keyboard-scrollable map region and compact Building list provide alternatives on phones. Actual floor geometry remains unconfirmed. Narrow-page overflow checks at 320/390/768px passed; this is not a WCAG certification.

## Direction

The working access application uses a calm, readable property-records workspace rather than a chart-heavy dashboard. Staff get a concise summary of active records, authorized properties and access level before task navigation; no decorative charts are used. The renter experience has one principal destination, so it uses a compact header and account action instead of invented bottom-navigation tabs. Owners and clerks have several real workflows: a labeled staff navigation drawer on phones and a persistent sidebar on wider screens. Navigation links jump to actual sections on the current property workspace; there are no placeholder destinations.

Design mobile-first at 360–390 CSS pixels. The content and controls also reflow at 320px, with a narrower 160px CSS viewport used as a zoom-equivalent stress check. At larger widths the staff workspace gains a 14.5rem sidebar and a readable content column; forms remain stacked or use restrained auto-fit grids. The environment notice and header stay compact, and navigation is not fixed over content or the software keyboard.

## Color and visual balance

The 60–30–10 distribution is an approximate visual balance—not a contrast rule:

| Approximate share | Use | Token |
| --- | --- | --- |
| 60% | Warm page background and breathing room | Ivory `#F7F4ED` |
| 30% | Cards, forms, navigation and supporting panels | White `#FFFFFF`; soft stone `#EEEAE4` |
| 10% | Primary actions, selected navigation, links and small emphasis | Ink blue `#245A81`; pressed/hover `#194363`; muted brass `#8D642E` |

Text colors are charcoal `#252B31` and secondary `#4B535C`. Control boundaries use `#747982`; semantic error, success and warning states use separate restrained foreground/surface pairs. The status word remains visible, so color and small shape markers are never the only status signal. Cards use light borders, modest rounding and a subtle shadow. There are no decorative gradient fills (the illustrative property map retains a dotted-grid pattern), glass effects, decorative charts, icon-only primary actions or motion-heavy transitions.

The saved dark theme uses page `#171B1D`, surface `#22282B`, supporting surface `#2E363A`, main text `#F1F3F2` and secondary text `#C3CBCE`. Link/focus colors remain light blue, while filled actions, selected navigation and selected tabs use the separate ink-blue action colors `#245A81` / `#194363` with white text. Dashboard, form, map-control and report surfaces use theme tokens; the acknowledgment remains paper-colored for legible printing.

### Measured contrast

Ratios below are computed from the actual sRGB token pairs using the WCAG relative-luminance formula. They are implementation checks, not a conformance claim.

| Foreground / indicator | Background | Ratio | Check |
| --- | --- | ---: | --- |
| Main text `#252B31` | Ivory `#F7F4ED` | 13.02:1 | Normal text ≥4.5:1 |
| Main text `#252B31` | White `#FFFFFF` | 14.30:1 | Normal text ≥4.5:1 |
| Secondary `#4B535C` | Ivory `#F7F4ED` | 7.10:1 | Normal text ≥4.5:1 |
| Secondary `#4B535C` | White `#FFFFFF` | 7.80:1 | Normal text ≥4.5:1 |
| Secondary `#4B535C` | Stone `#EEEAE4` | 6.55:1 | Normal text ≥4.5:1 |
| White `#FFFFFF` | Ink blue `#245A81` | 7.36:1 | Normal text ≥4.5:1 |
| White `#FFFFFF` | Hover blue `#194363` | 10.37:1 | Normal text ≥4.5:1 |
| Ink blue `#245A81` | Stone `#EEEAE4` | 6.18:1 | Text and selected nav |
| Brass `#8D642E` | Ivory `#F7F4ED` | 4.79:1 | Normal text ≥4.5:1 |
| Error `#8A2929` | Error surface `#FFF0ED` | 7.79:1 | Normal text ≥4.5:1 |
| Success `#245C3D` | Success surface `#EDF5EF` | 7.07:1 | Normal text ≥4.5:1 |
| Warning `#70490D` | Warning surface `#FBF3DF` | 7.17:1 | Normal text ≥4.5:1 |
| Control border `#747982` | White `#FFFFFF` | 4.38:1 | Adjacent control edge ≥3:1 |
| Control border `#747982` | Ivory `#F7F4ED` | 3.98:1 | Adjacent control edge ≥3:1 |
| Control border `#747982` | Stone `#EEEAE4` | 3.67:1 | Adjacent control edge ≥3:1 |

The ink-blue focus ring contrasts at least as strongly as the ink-blue/stone pair above. Hover/pressed colors, disabled controls, status labels and focus appearance are distinct states; do not infer that a palette alone makes the UI accessible. Verify rendered component pairs again if colors or opacity change.

## Type, spacing and controls

- Inter when installed, followed by local UI/system sans-serif fallbacks; no remote font dependency.
- Base body and form text: 18px; secondary copy generally 16px or larger.
- Page headings: 28–32px, section headings about 24px, subsection headings about 20px.
- Line height about 1.5; important text uses weight and grouping rather than pervasive bold.
- Relative spacing, 12px card radius, smaller 7px control radius, and a light neutral border.
- Primary actions use ink blue with white text. Secondary actions remain clearly labeled and outlined.
- Inputs, buttons, menu links and selects target at least 44px height. Disabled actions stay legible and cannot be mistaken for success.
- Focus rings are 3px and offset; a skip-to-content link is first in the document.
- Passwords can be shown and hidden using a labeled button; standard password-manager autocomplete and pasting remain available.
- Long names, addresses, references and errors wrap rather than widening the page. Monetary values are not invented or rendered by this access-only app.

## Information architecture and states

Renters see their actual authorized records, a plain-language empty state, account status, and sign-out. No staff MFA setup is rendered for a renter account. A renter has one core destination, so no fake tabs are added. Payment history, balances and online payments are clearly stated as unavailable.

Staff see database-backed tenant records/search, property locations, tenant creation, and invitations. Owners additionally see reviewed access assignment, invitation reconciliation, and access history. Staff navigation is expanded in a labeled `<details>` drawer on mobile and a sidebar on desktop. The current section is announced with `aria-current`; at narrow width the drawer is in normal document flow, not fixed over content.

Unassigned, invitation-pending, disabled, loading, failure, empty, issued, unresolved and archived conditions use text labels and actionable plain-language explanations. Invitation issuance is not described as inbox delivery. Reviews and manual access changes preserve existing server checks, audit history and explicit confirmation. Archived directories remain visible as retained history.

## Evidence and remaining accessibility work

The Playwright browser suite uses real local Supabase/Auth fixtures (fictional `.invalid` users), and checks staff/renter workflows, keyboard focus, mobile drawer operation, long-email wrapping, and horizontal overflow at 160, 320, 360, 390, 430, 768 and 1280 CSS px. A separate browser check tests enlarged text at 225% root font size on a 320px viewport and checks 44px controls. It does not emulate a browser's native zoom control. The 160px viewport check approximates the CSS viewport available at 200% zoom from 320 physical CSS px; it is a responsive stress test, not proof of native zoom behavior.

Screenshots are captured only from the browser-test fictional renter fixture and must not include passwords, invitation links/tokens or MFA secrets. Test automation does not establish screen-reader quality, all focus order, touch usability, all browser zoom behavior, the complete control contrast matrix, or WCAG 2.2 AA conformance. Conduct manual keyboard and assistive-technology review before making a conformance claim.

See [STATUS.md](STATUS.md) for the current implementation/test evidence and [ONBOARDING.md](ONBOARDING.md) for account state and access boundaries.


## Frontend-first revision - 17 Oct 2026

Reference: the user's U-ConvertIT project, inspected in a browser. Adapted strong headline hierarchy, spacious composition and a distinct action surface without copying its branding or adding a marketing landing page. RentByBob retains its existing 60-30-10 teal palette. Sign-in stacks below 54rem and splits into intro/form columns above it. Staff navigation selects one mounted section at a time; hidden sections are excluded from layout and keyboard interaction. Section focus follows explicit navigation and drafts survive switching. These are in-page views, not URL-addressable routes.

Screenshots from fictional browser tests are in ignored test-results/sign-in-mobile.png, sign-in-desktop.png and owner-mobile.png. Manual real-phone, screen-reader and native zoom review remain outstanding.


## Atoms: buttons, icon buttons, chips - 28 Oct 2026

Atomic design level 1, from the owner's "Atoms" reference. Tokens: `--danger*`, `--approve*`, `--info*`, `--on-solid` (light and dark; white text on each solid colour passes 4.5:1). Buttons are pill shaped; variants primary, secondary, ghost, approve, danger, danger-quiet; sizes lg, md (default), sm (all keep a 44px minimum height). Meaning by colour: green = go or approve (approve adds a decorative check mark with empty alt text so it is not read aloud), red = removal (outline to open, solid for the final click), white = alternative, text-only = quiet. Icon buttons are round and must have a text label. Status chips are pill shaped with a dot and always say the status in words. Live reference: `npm run dev`, open `/?atoms=1` (development only). Code: `src/components/atoms.tsx`, `src/components/AtomsGallery.tsx`, the "Button system (atoms)" block at the end of `src/styles.css`.
