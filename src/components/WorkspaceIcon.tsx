export function WorkspaceIcon({ kind }: { kind: 'people' | 'building' | 'add' }) {
  return <svg className="workspace-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'people' ? <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 5v3" /></> : kind === 'building' ? <><path d="M4 21V4l10-2v19M14 9h6v12M2 21h20M8 6h2M8 10h2M8 14h2M8 18h2M17 13h1M17 17h1" /></> : <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M12 8v8M8 12h8" /></>}
  </svg>
}
