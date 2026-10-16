import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../components/atoms'
import { Feedback } from './AuthForms'
import { supabase } from './client'

type Building = { id: string; label: string }
type Unit = Building & { building_id: string }
export function PropertyDirectory({ propertyId, owner }: { propertyId: string; owner: boolean }) {
  const [buildings,setBuildings]=useState<Building[]>([]),[units,setUnits]=useState<Unit[]>([])
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false)
  const [kind,setKind]=useState('building'); const requestId=useRef(crypto.randomUUID())
  const load=useCallback(async()=>{
    const [b,u]=await Promise.all([supabase!.from('buildings').select('id,label').eq('property_id',propertyId).order('label'),supabase!.from('units').select('id,label,building_id').eq('property_id',propertyId).order('label')])
    if(b.error||u.error){setBuildings([]);setUnits([]);setError('Property directory could not be loaded. No sample locations are substituted.');setLoaded(false);return}
    setBuildings(b.data);setUnits(u.data);setLoaded(true);setError('')
  },[propertyId])
  useEffect(()=>{void load()},[load])
  return <section className="card"><h2>Buildings, sections and units</h2><p>Directory labels only. These records do not assign occupants, set capacity or create rent charges.</p><Feedback message={error} error /><Feedback message={message} />
    <Button onClick={()=>void load()}>Refresh locations</Button>
    {loaded && <ul className="records">{buildings.map(b=><li key={b.id}><div><strong>{b.label}</strong><ul>{units.filter(u=>u.building_id===b.id).map(u=><li key={u.id}>{u.label}</li>)}</ul>{!units.some(u=>u.building_id===b.id)&&<p>No units recorded in this building/section.</p>}</div></li>)}</ul>}
    {loaded && buildings.length===0 && <p>No buildings or sections recorded yet.</p>}
    {owner && <form onSubmit={async e=>{
      e.preventDefault();const form=e.currentTarget;const f=new FormData(form);setBusy(true);setMessage('');setError('')
      const {error}=await supabase!.rpc('create_property_location',{p_property_id:propertyId,p_id:requestId.current,p_label:String(f.get('location-label')).trim(),p_building_id:kind==='unit'?String(f.get('building-id')):null})
      if(error)setError('Save could not be confirmed. Keep the same details when retrying; duplicate labels and cross-property links are rejected.')
      else {requestId.current=crypto.randomUUID();form.reset();setMessage('Location saved without occupancy or billing rules.');await load()}
      setBusy(false)
    }}><label htmlFor="location-kind">Location type</label><select id="location-kind" value={kind} onChange={e=>setKind(e.target.value)}><option value="building">Building or section</option><option value="unit">Unit within a building/section</option></select>
      {kind==='unit'&&<><label htmlFor="building-id">Parent building or section</label><select id="building-id" name="building-id" required><option value="">Choose a building/section</option>{buildings.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}</select></>}
      <label htmlFor="location-label">Location label</label><input id="location-label" name="location-label" maxLength={200} required /><Button disabled={busy}>{busy?'Saving…':'Create location'}</Button>
    </form>}
  </section>
}
