# RentByBob interface design system

## Direction

The working access application uses a calm, readable property-records interface rather than a dashboard. The renter experience has one principal destination, so it uses a compact header and account action instead of invented bottom-navigation tabs. Owners and clerks have several real workflows: a labeled staff navigation drawer on phones and a persistent sidebar on wider screens. Navigation links jump to actual sections on the current property workspace; there are no placeholder destinations.

Design mobile-first at 360–390 CSS pixels. The content and controls also reflow at 320px, with a narrower 160px CSS viewport used as a zoom-equivalent stress check. At larger widths the staff workspace gains a 14.5rem sidebar and a readable content column; forms remain stacked or use restrained auto-fit grids. The environment notice and header stay compact, and navigation is not fixed over content or the software keyboard.

## Color and visual balance

The 60–30–10 distribution is an approximate visual balance—not a contrast rule:

| Approximate share | Use | Token |
| --- | --- | --- |
| 60% | Warm page background and breathing room | Ivory `#F7F7F2` |
| 30% | Cards, forms, navigation and supporting panels | White `#FFFFFF`; sage-gray `#E8EEEA` |
| 10% | Primary actions, selected navigation, links and small emphasis | Deep teal `#1F5C55`; pressed/hover `#17463F` |

Text colors are charcoal `#202824` and secondary `#47534B`. Control boundaries use `#718178`; semantic error, success and warning states use separate restrained foreground/surface pairs. The status word remains visible, so color and small shape markers are never the only status signal. Cards use light borders, modest rounding and a subtle shadow. There are no gradients, glass effects, decorative charts, icon-only primary actions or motion-heavy transitions.

### Measured contrast

Ratios below are computed from the actual sRGB token pairs using the WCAG relative-luminance formula. They are implementation checks, not a conformance claim.

| Foreground / indicator | Background | Ratio | Check |
| --- | --- | ---: | --- |
| Main text `#202824` | Ivory `#F7F7F2` | 14.05:1 | Normal text ≥4.5:1 |
| Main text `#202824` | White `#FFFFFF` | 15.10:1 | Normal text ≥4.5:1 |
| Secondary `#47534B` | Ivory `#F7F7F2` | 7.50:1 | Normal text ≥4.5:1 |
| Secondary `#47534B` | White `#FFFFFF` | 8.06:1 | Normal text ≥4.5:1 |
| Secondary `#47534B` | Sage `#E8EEEA` | 6.85:1 | Normal text ≥4.5:1 |
| White `#FFFFFF` | Teal `#1F5C55` | 7.72:1 | Normal text ≥4.5:1 |
| White `#FFFFFF` | Pressed teal `#17463F` | 10.58:1 | Normal text ≥4.5:1 |
| Teal `#1F5C55` | Sage `#E8EEEA` | 6.56:1 | Text and selected nav |
| Error `#8A2929` | Error surface `#FFF0ED` | 7.79:1 | Normal text ≥4.5:1 |
| Success `#245C3D` | Success surface `#EDF5EF` | 7.07:1 | Normal text ≥4.5:1 |
| Warning `#70490D` | Warning surface `#FBF3DF` | 7.17:1 | Normal text ≥4.5:1 |
| Control border `#718178` | White `#FFFFFF` | 4.11:1 | Adjacent control edge ≥3:1 |
| Control border `#718178` | Ivory `#F7F7F2` | 3.82:1 | Adjacent control edge ≥3:1 |
| Control border `#718178` | Sage `#E8EEEA` | 3.49:1 | Adjacent control edge ≥3:1 |

The teal focus ring contrasts at least as strongly as the teal/ivory and teal/sage pairs above. Hover/pressed colors, disabled controls, status labels and focus appearance are distinct states; do not infer that a palette alone makes the UI accessible. Verify rendered component pairs again if colors or opacity change.

## Type, spacing and controls

- System sans-serif stack, no remote font dependency.
- Base body and form text: 18px; secondary copy generally 16px or larger.
- Page headings: 28–32px, section headings about 24px, subsection headings about 20px.
- Line height about 1.5; important text uses weight and grouping rather than pervasive bold.
- Relative spacing, 12px card radius, smaller 7px control radius, and a light neutral border.
- Primary actions are deep teal with white text. Secondary actions remain clearly labeled and outlined.
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
