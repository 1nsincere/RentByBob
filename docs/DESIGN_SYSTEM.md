# RentByBob interface design system

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

These are token-pair checks only, not an accessibility certification or a complete rendered component contrast audit. Status pairs remain text-labeled. Browser verification covered the payment worklist at 320/390/768px, 200% root text at 320px with visible button target sizing, and paid-rent behavior at narrow widths. Full native zoom, keyboard, assistive-technology and manual touch review remain outstanding.

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

Text colors are charcoal `#252B31` and secondary `#4B535C`. Control boundaries use `#747982`; semantic error, success and warning states use separate restrained foreground/surface pairs. The status word remains visible, so color and small shape markers are never the only status signal. Cards use light borders, modest rounding and a subtle shadow. There are no gradients, glass effects, decorative charts, icon-only primary actions or motion-heavy transitions.

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
