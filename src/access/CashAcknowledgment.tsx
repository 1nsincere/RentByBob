import { createPortal } from 'react-dom'
import { useEffect, useRef } from 'react'
import { Button } from '../components/atoms'
import { text, type Language } from '../i18n'

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
export function CashAcknowledgment({ data, close, preview=false, language='en' }: { data: CashAcknowledgmentData; close: () => void; preview?: boolean; language?: Language }) {
 const tr=(english:string,bisaya:string)=>text(language,english,bisaya)
 const dialog = useRef<HTMLDialogElement>(null)
 const opener = useRef<HTMLElement | null>(null)
 useEffect(() => { opener.current = document.activeElement as HTMLElement | null; dialog.current?.showModal() }, [])
 // Close the modal before unmounting so focus reliably returns to the button that opened it.
 const finish = () => { dialog.current?.close(); opener.current?.focus(); close() }
 return createPortal(<dialog ref={dialog} className="ack-dialog" onCancel={e => { e.preventDefault(); finish() }} aria-labelledby="ack-heading">
   <div className="ack-actions"><Button className="primary" onClick={() => window.print()}>{tr('Print / Save PDF','I-print / I-save isip PDF')}</Button><Button onClick={finish}>{tr('Close receipt','Sirad-i ang resibo')}</Button></div>
   <article className="ack-document pos-receipt">
     <header className="pos-header"><p className="pos-brand">RentByBob</p><p>{data.property}</p>
     <h2 id="ack-heading">{tr('Cash Payment Acknowledgment','Pagpamatuod sa Nadawat nga Kwarta')}</h2><p>{tr('RENT PAYMENT · CASH','BAYAD SA ABANG · KWARTA')}</p></header>
     <p className="ack-number">{tr('Receipt number','Numero sa resibo')}<br />{data.number}</p>
     {preview && <p className="notice">{tr('SAMPLE ONLY — not proof of payment.','SAMPLE LANG — dili pamatuod sa bayad.')}</p>}
     <dl><dt>{tr('Tenant','Nag-abang')}</dt><dd>{data.tenant}</dd><dt>{tr('Rental space','Lugar nga giabangan')}</dt><dd>{data.building} / {data.room}</dd><dt>{tr('Cash received','Kwarta nga nadawat')}</dt><dd><strong>{decimalPesos(data.amount)}</strong></dd><dt>{tr('Payment date','Petsa sa bayad')}</dt><dd>{data.received_on}</dd><dt>{tr('Received by','Gidawat ni')}</dt><dd>{data.collector}</dd><dt>{tr('Verification','Kumpirmasyon')}</dt><dd>{tr('Confirmed by designated cash verifier','Gikumpirma sa gi-assign nga tigkumpirma sa kwarta')}</dd><dt>{tr('Issued (Philippine time)','Gi-isyu (oras sa Pilipinas)')}</dt><dd>{new Intl.DateTimeFormat('en-PH',{ dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Manila' }).format(new Date(data.issued_at))}</dd></dl>
     <h3>{tr('Rent covered','Mga bulan sa abang nga gibayran')}</h3><ul className="pos-items">{data.allocations.map(a => <li key={a.month}><span>{a.month.slice(0,7)}</span><strong>{decimalPesos(a.amount)}</strong></li>)}</ul>
     <div className="pos-total"><span>{tr('CASH RECEIVED','KWARTA NGA NADAWAT')}</span><strong>{decimalPesos(data.amount)}</strong></div>
     <p className="pos-balance">{tr('Remaining rent at issuance','Nabilin nga abang sa pag-isyu')}<br /><strong>{decimalPesos(data.balance_at_issuance)}</strong></p>
     <p>{tr('This acknowledges the cash amount listed above. A partial payment does not mean all rent is fully paid. Later payments may change the current balance.','Nagpamatuod kini sa kantidad sa kwarta nga gilista sa taas. Ang bahin nga bayad wala magpasabot nga nahuman na ang tanang abang. Mahimong mausab ang kasamtangang balanse tungod sa sunod nga bayad.')}</p>
     {preview && <div className="pos-signature"><span className="mock-signature" aria-hidden="true">Bob</span><p>{tr('Sir Bob · mock signature placeholder','Sir Bob · sample nga pirma')}</p><small>{tr('Design sample only. Not signed or authorized by Bob.','Sample sa disenyo lang. Wala pirmahi o tugoti ni Bob.')}</small></div>}
     <footer className="pos-footer"><p>{tr('Thank you for your payment.','Salamat sa imong bayad.')}</p><p className="field-help">{tr('Payment acknowledgment only.','Pamatuod sa bayad lamang.')}<br />{tr('Not an official tax receipt.','Dili opisyal nga resibo sa buhis.')}<br />{tr('No email was sent.','Walay email nga gipadala.')}</p></footer>
   </article>
 </dialog>, document.body)
}
