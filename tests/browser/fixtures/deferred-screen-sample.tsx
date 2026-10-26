// Fictional stand-in for a deferred workspace screen; used only by scripts/check-deferred-screen.mjs.
export function SampleScreen({ label }: { label: string }) {
  if ((window as { failSampleRender?: boolean }).failSampleRender) throw new Error('Sample render failure')
  return <section aria-labelledby="sample-screen-heading"><h2 id="sample-screen-heading">{label}</h2></section>
}
