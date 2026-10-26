import { useState } from 'react'
import { PublicRoomsFrame, PublicRoomsView, type InquiryInput, type InquiryResult } from './PublicRooms'
import { parsePublicListings } from './public-listings-model.ts'
import type { Language } from '../i18n'

// Development-only sample of the public rooms page (?availability=preview). Fictional rooms, no Supabase client,
// no network calls; "sending" a message is simulated. Excluded from production builds by the artifact check.
const id = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const sampleListings = parsePublicListings({ properties: [{ name: 'Fictional sample boarding houses', buildings: [
  { label: 'Building 1', rooms: [
    { unit_id: id(1), room: 'Room 03', asking_rent: '3500.00', description: 'Ground floor, good for 2 persons, shared bathroom.' },
    { unit_id: id(2), room: 'Room 06', asking_rent: '3500.00', description: 'Second floor, window facing the road.' },
  ] },
  { label: 'Building 2', rooms: [
    { unit_id: id(3), room: 'Room 02', asking_rent: '3800.00', description: 'Second floor, near the shared gym.' },
  ] },
  { label: "Bob's house", rooms: [
    { unit_id: id(4), room: 'Room 04', asking_rent: '2800.00', description: 'Quiet room for 1 to 2 persons.' },
    { unit_id: id(5), room: 'Room 05', asking_rent: '2800.00', description: '' },
  ] },
] }] })

export function PublicAvailabilityPreview() {
  const [language, setLanguage] = useState<Language>('en')
  const submit = async (_input: InquiryInput): Promise<InquiryResult> => 'sent'
  return <PublicRoomsFrame propertyName="Fictional sample boarding houses" language={language} setLanguage={setLanguage}
    notice="Development sample · Fictional rooms · Messages are not sent or saved">
    <PublicRoomsView listings={sampleListings} language={language} submit={submit} />
  </PublicRoomsFrame>
}
