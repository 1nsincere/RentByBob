import type { ButtonHTMLAttributes, ReactNode } from 'react'
export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={`button ${props.className ?? ''}`} /> }
export function Badge({ children }: { children: ReactNode }) { return <span className="badge">{children}</span> }
