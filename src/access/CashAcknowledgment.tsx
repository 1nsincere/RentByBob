import { createPortal } from 'react-dom'
import { useEffect, useRef } from 'react'
import { Button } from '../components/atoms'

export type CashAcknowledgmentData = {
 number: string; tenant: string; building: string; room: string; property: string;
 amount: string; received_on: string; collector: string; issued_at: string;
 balance_at_issuance: string; allocations: { month: string; amount: string }[];
}
export function decimalPesos(value: string) {
 if (!/^\d+(\.\d{1,2})?$/.test(value)) return 'Amount unavailable'
 const [whole, fraction=''] = value.split('.')
 return `₱${BigInt(whole).toLocaleString('en-PH')}.${fraction.padEnd(2,'0')}`
}
export function CashAcknowledgment({ data, close, preview=false }: { data: CashAcknowledgmentData; close: () => void; preview?: boolean }) {
 const dialog = useRef<HTMLDialogElement>(null)
 useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => { previous?.focus() } }, [])
 return createPortal(<dialog ref={dialog} className="ack-dialog" onCancel={e => { e.preventDefault(); close() }} aria-labelledby="ack-heading">
   <div className="ack-actions"><Button className="primary" onClick={() => window.print()}>Print / Save PDF</Button><Button onClick={close}>Close receipt</Button></div>
   <article className="ack-document pos-receipt">
     <header className="pos-header"><p className="pos-brand">RentByBob</p><p>{data.property}</p>
     <h2 id="ack-heading">Cash Payment Acknowledgment</h2><p>RENT PAYMENT · CASH</p></header>
     <p className="ack-number">Receipt number<br />{data.number}</p>
     {preview && <p className="notice">SAMPLE ONLY — not proof of payment.</p>}
     <dl><dt>Tenant</dt><dd>{data.tenant}</dd><dt>Rental space</dt><dd>{data.building} / {data.room}</dd><dt>Cash received</dt><dd><strong>{decimalPesos(data.amount)}</strong></dd><dt>Payment date</dt><dd>{data.received_on}</dd><dt>Received by</dt><dd>{data.collector}</dd><dt>Verification</dt><dd>Confirmed by designated cash verifier</dd><dt>Issued (Philippine time)</dt><dd>{new Intl.DateTimeFormat('en-PH',{ dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Manila' }).format(new Date(data.issued_at))}</dd></dl>
     <h3>Rent covered</h3><ul className="pos-items">{data.allocations.map(a => <li key={a.month}><span>{a.month.slice(0,7)}</span><strong>{decimalPesos(a.amount)}</strong></li>)}</ul>
     <div className="pos-total"><span>CASH RECEIVED</span><strong>{decimalPesos(data.amount)}</strong></div>
     <p className="pos-balance">Remaining rent at issuance<br /><strong>{decimalPesos(data.balance_at_issuance)}</strong></p>
     <p>This acknowledges the cash amount listed above. A partial payment does not mean all rent is fully paid. Later payments may change the current balance.</p>
     {preview && <div className="pos-signature"><span className="mock-signature" aria-hidden="true">Bob</span><p>Sir Bob · mock signature placeholder</p><small>Design sample only. Not signed or authorized by Bob.</small></div>}
     <footer className="pos-footer"><p>Thank you for your payment.</p><p className="field-help">Payment acknowledgment only.<br />Not an official tax receipt.<br />No email was sent.</p></footer>
   </article>
 </dialog>, document.body)
}
