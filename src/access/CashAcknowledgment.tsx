import { createPortal } from 'react-dom'
import { useEffect, useRef } from 'react'
import { Button } from '../components/atoms'
import { text, type Language } from '../i18n'

export type CashAcknowledgmentData = {
 number: string; tenant: string; building: string; room: string; property: string;
 amount: string; received_on: string; collector: string; issued_at: string;
 balance_at_issuance: string; allocations: { month: string; amount: string }[];
 // Part of the payment kept as advance credit at confirmation (202610270010); absent on older acknowledgments.
 advance_credit?: string;
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
   <div className="ack-actions"><Button className="primary" onClick={() => window.print()}>{tr('Print / Save PDF','I-print / I-save bilang PDF')}</Button><Button onClick={finish}>{tr('Close receipt','Isara ang resibo')}</Button></div>
   <article className="ack-document pos-receipt">
     <header className="pos-header"><p className="pos-brand">RentByBob</p><p>{data.property}</p>
     <h2 id="ack-heading">{tr('Cash Payment Acknowledgment','Patunay ng Natanggap na Cash')}</h2><p>{tr('RENT PAYMENT · CASH','BAYAD SA UPA · CASH')}</p></header>
     <p className="ack-number">{tr('Receipt number','Numero ng resibo')}<br />{data.number}</p>
     {preview && <p className="notice">{tr('SAMPLE ONLY — not proof of payment.','HALIMBAWA LANG — hindi patunay ng bayad.')}</p>}
     <dl><dt>{tr('Tenant','Umuupa')}</dt><dd>{data.tenant}</dd><dt>{tr('Rental space','Lugar na inuupahan')}</dt><dd>{data.building} / {data.room}</dd><dt>{tr('Cash received','Natanggap na cash')}</dt><dd><strong>{decimalPesos(data.amount)}</strong></dd><dt>{tr('Payment date','Petsa ng bayad')}</dt><dd>{data.received_on}</dd><dt>{tr('Received by','Tinanggap ni')}</dt><dd>{data.collector}</dd><dt>{tr('Verification','Kumpirmasyon')}</dt><dd>{tr('Confirmed by designated cash verifier','Kinumpirma ng itinalagang tagakumpirma ng cash')}</dd><dt>{tr('Issued (Philippine time)','Inisyu (oras ng Pilipinas)')}</dt><dd>{new Intl.DateTimeFormat('en-PH',{ dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Manila' }).format(new Date(data.issued_at))}</dd></dl>
     <h3>{tr('Rent covered','Mga buwan ng upa na nabayaran')}</h3><ul className="pos-items">{data.allocations.map(a => <li key={a.month}><span>{a.month.slice(0,7)}</span><strong>{decimalPesos(a.amount)}</strong></li>)}</ul>
     {data.advance_credit && data.advance_credit !== '0.00' && <ul className="pos-items"><li><span>{tr('Advance credit','Paunang bayad (advance)')}</span><strong>{decimalPesos(data.advance_credit)}</strong></li></ul>}
     <div className="pos-total"><span>{tr('CASH RECEIVED','NATANGGAP NA CASH')}</span><strong>{decimalPesos(data.amount)}</strong></div>
     <p className="pos-balance">{tr('Remaining rent at issuance','Natitirang upa noong inisyu')}<br /><strong>{decimalPesos(data.balance_at_issuance)}</strong></p>
     <p>{tr('This acknowledges the cash amount listed above. A partial payment does not mean all rent is fully paid. Later payments may change the current balance.','Pinatutunayan nito ang halaga ng cash na nakalista sa itaas. Ang bahagyang bayad ay hindi nangangahulugang tapos na ang lahat ng upa. Maaaring magbago ang kasalukuyang balanse dahil sa susunod na bayad.')}</p>
     {preview && <div className="pos-signature"><span className="mock-signature" aria-hidden="true">Bob</span><p>{tr('Sir Bob · mock signature placeholder','Sir Bob · halimbawang pirma')}</p><small>{tr('Design sample only. Not signed or authorized by Bob.','Halimbawang disenyo lang. Hindi pinirmahan o inaprubahan ni Bob.')}</small></div>}
     <footer className="pos-footer"><p>{tr('Thank you for your payment.','Salamat sa iyong bayad.')}</p><p className="field-help">{tr('Payment acknowledgment only.','Patunay ng bayad lamang.')}<br />{tr('Not an official tax receipt.','Hindi opisyal na resibo para sa buwis.')}<br />{tr('No email was sent.','Walang email na ipinadala.')}</p></footer>
   </article>
 </dialog>, document.body)
}
