import { useEffect, useState } from 'react'
import { Button } from '../components/atoms'
import { RenterAccountView } from './RenterPortal'
import { parseRenterAccount } from './renter-account-model.ts'
import { text, type Language } from '../i18n'

// Development-only renter preview (?preview=renter). Fictional data, no Supabase client, never in production builds.
const id = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const acknowledgment = (n: number, amount: string, receivedOn: string, month: string, balance: string, collector: string) => ({
  number: `RBB-${id(n)}`, title: 'Cash Payment Acknowledgment', payment_id: id(n), tenant: 'Sample Alex Santos', building: "Bob's house",
  room: 'Room 01', property: 'Fictional sample property', amount, received_on: receivedOn, collector, issued_at: `${receivedOn}T03:00:00+00:00`,
  balance_at_issuance: balance, currency: 'PHP', notice: 'Payment acknowledgment only. Not an official tax receipt.', allocations: [{ month, amount }],
})
const sampleAccount = parseRenterAccount({
  tenants: [{
    id: id(1), display_name: 'Sample Alex Santos', kind: 'individual', property: 'Fictional sample property',
    agreements: [{
      id: id(2), building: "Bob's house", room: 'Room 01', move_in: '2026-08-01', rent: '3500.00', balance: '1000.00',
      charges: [
        { id: id(10), rental_month: '2026-08-01', due_date: '2026-08-01', amount: '3500.00', remaining: '0.00' },
        { id: id(11), rental_month: '2026-09-01', due_date: '2026-09-01', amount: '3500.00', remaining: '0.00' },
        { id: id(12), rental_month: '2026-10-01', due_date: '2026-10-01', amount: '3500.00', remaining: '1000.00' },
      ],
      payments: [
        { kind: 'cash', id: id(20), amount: '3500.00', received_on: '2026-08-01', confirmed_at: '2026-08-01T05:00:00+00:00', months: [{ month: '2026-08-01', amount: '3500.00' }], acknowledgment: acknowledgment(20, '3500.00', '2026-08-01', '2026-08-01', '0.00', 'Bob') },
        { kind: 'cash', id: id(21), amount: '3500.00', received_on: '2026-09-02', confirmed_at: '2026-09-02T05:00:00+00:00', months: [{ month: '2026-09-01', amount: '3500.00' }], acknowledgment: acknowledgment(21, '3500.00', '2026-09-02', '2026-09-01', '0.00', 'James') },
        { kind: 'check', id: id(22), reference: 'CHK-0003', amount: '2500.00', received_on: '2026-10-03', confirmed_at: '2026-10-08T05:00:00+00:00', months: [{ month: '2026-10-01', amount: '2500.00' }] },
      ],
      unconfirmed: [{ kind: 'cash', id: id(30), amount: '1000.00', received_on: '2026-10-20' }],
    }],
  }],
})

export function RenterPortalPreview() {
  const [language, setLanguage] = useState<Language>(() => { try { return localStorage.getItem('rentbybob-language') === 'fil' ? 'fil' : 'en' } catch { return 'en' } })
  const [theme, setTheme] = useState<'light' | 'dark'>(() => { try { return localStorage.getItem('rentbybob-theme') === 'dark' ? 'dark' : 'light' } catch { return 'light' } })
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => { document.documentElement.lang = language === 'fil' ? 'fil' : 'en' }, [language])
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  return <div className="app-shell renter-preview-shell">
    <a className="skip-link" href="#main">{tr('Skip to content', 'Pumunta sa nilalaman')}</a>
    <div className="environment-note">{tr('Fictional renter preview · Sample data · No sign-in or database', 'Halimbawang pahina ng umuupa · Halimbawang datos · Walang sign-in o database')}</div>
    <header className="site-header">
      <div className="shell header-inner">
        <span className="brand"><span className="brand-mark" aria-hidden="true">R</span><span>Rent<span className="brand-accent">ByBob</span></span></span>
        <div className="session-tools"><div className="session-actions">
          <Button className="quiet-button" aria-pressed={theme === 'dark'} onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? tr('Day mode', 'Day mode') : tr('Night mode', 'Night mode')}</Button>
          <Button className="quiet-button" aria-pressed={language === 'fil'} onClick={() => setLanguage(current => current === 'en' ? 'fil' : 'en')}>{language === 'en' ? 'English · Filipino' : 'Filipino · English'}</Button>
          <Button className="quiet-button" onClick={() => { location.href = '/' }}>{tr('Leave preview', 'Umalis sa preview')}</Button>
        </div></div>
      </div>
    </header>
    <div className="shell page-shell">
      <main id="main" tabIndex={-1}>
        <p className="notice" role="status"><strong>{tr('Renter view preview.', 'Halimbawang pahina ng umuupa.')}</strong> {tr('This is what a signed-in renter sees. All names and amounts are fictional and nothing is saved.', 'Ito ang makikita ng umuupa pagkatapos mag-sign in. Gawa-gawa ang lahat ng pangalan at halaga at walang mase-save.')}</p>
        <RenterAccountView account={sampleAccount} language={language} preview />
      </main>
      <footer className="site-footer"><span>RentByBob</span><span>{tr('No online payments · Sample reports stay on this screen', 'Walang online na bayad · Ang halimbawang ulat ay mananatili rito')}</span></footer>
    </div>
  </div>
}
