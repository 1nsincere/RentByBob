export function WorkspaceIcon({ kind }: { kind: 'home' | 'people' | 'building' | 'payments' | 'add' }) {
  return <svg className="workspace-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'home' ? <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1Z" /></>
      : kind === 'people' ? <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 5v3" /></>
        : kind === 'building' ? <><path d="M4 21V4l10-2v19M14 9h6v12M2 21h20M8 6h2M8 10h2M8 14h2M8 18h2M17 13h1M17 17h1" /></>
          : kind === 'payments' ? <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M3 9h18M7 15h4" /><circle cx="17" cy="14" r="2" /></>
            : <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M12 8v8M8 12h8" /></>}
  </svg>
}
