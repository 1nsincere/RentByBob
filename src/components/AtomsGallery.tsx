import { Button, Chip, IconButton, type ButtonSize, type ButtonVariant, type ChipTone } from './atoms'

// Developer-only style guide (open /?atoms=1 while running `npm run dev`; it is not part of the production build).
// Shows every atom the app uses, in every variant and size, and when to use each.
const VARIANTS: [ButtonVariant, string, string][] = [
  ['primary', 'Primary', 'The main forward action: Save, Record cash, Add tenant.'],
  ['secondary', 'Secondary', 'An alternative or a way back: Cancel, Edit, Refresh.'],
  ['ghost', 'Ghost', 'A quiet action inside a row or card.'],
  ['approve', 'Approve', 'An approval or double check: Confirm cash, make months final.'],
  ['danger', 'Danger', 'The final click of a removal: Remove tenant, Reverse payment.'],
  ['danger-quiet', 'Danger (outline)', 'Opens a removal form; becomes solid red only at the final step.'],
]
const SIZES: ButtonSize[] = ['lg', 'md', 'sm']
const TONES: [ChipTone, string][] = [['success', 'Confirmed'], ['warning', 'Waiting'], ['info', 'Checking'], ['brand', 'Open now'], ['danger', 'Not received'], ['neutral', 'Archived']]
const bell = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 20a2 2 0 0 0 3.4 0" /></svg>

export function AtomsGallery() {
  return <main className="atoms-gallery">
    <p className="eyebrow">ATOMIC DESIGN · LEVEL 1</p>
    <h1>Atoms</h1>
    <section aria-labelledby="atoms-buttons"><h2 id="atoms-buttons">Buttons</h2>
      <table className="atoms-table"><thead><tr><th scope="col">Variant</th>{SIZES.map(size => <th scope="col" key={size}>{size === 'md' ? 'Medium (default)' : size === 'lg' ? 'Large' : 'Small'}</th>)}<th scope="col">Disabled</th><th scope="col">Use for</th></tr></thead>
        <tbody>{VARIANTS.map(([variant, name, use]) => <tr key={variant}><th scope="row">{name}</th>
          {SIZES.map(size => <td key={size}><Button variant={variant} size={size}>Continue</Button></td>)}
          <td><Button variant={variant} disabled>Continue</Button></td><td>{use}</td></tr>)}</tbody></table>
    </section>
    <section aria-labelledby="atoms-icons"><h2 id="atoms-icons">Icon buttons</h2>
      <div className="atoms-row">{(['white', 'outline', 'brand', 'dark'] as const).map(variant => <IconButton key={variant} variant={variant} label={`Notifications (${variant})`}>{bell}</IconButton>)}</div>
    </section>
    <section aria-labelledby="atoms-chips"><h2 id="atoms-chips">Status chips</h2>
      <div className="atoms-row">{TONES.map(([tone, label]) => <Chip key={tone} tone={tone}>{label}</Chip>)}</div>
      <p className="field-help">The status is always written in words; colour and the dot only support it.</p>
    </section>
  </main>
}
