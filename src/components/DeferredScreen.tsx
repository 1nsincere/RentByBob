import { Component, createRef, lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { Button, LoadingSkeleton, type SkeletonShape } from './atoms'
import type { Language } from '../i18n'

// React.lazy keeps a rejected import for the lifetime of the lazy component, so retrying needs a new one.
export function deferredScreen<P extends object>(load: () => Promise<ComponentType<P>>) {
  const create = () => lazy(async () => ({ default: await load() }))
  let Loaded = create()
  function Screen(props: P) { return <Loaded {...props} /> }
  return { Screen, reset: () => { Loaded = create() } }
}

type DeferredBoundaryProps = { children: ReactNode; loadingLabel: string; rows?: number; shape?: SkeletonShape; language: Language; reset: () => void }

// One failed screen (download or render) shows a recoverable message instead of unmounting every workspace section.
export class DeferredBoundary extends Component<DeferredBoundaryProps, { failed: boolean }> {
  state = { failed: false }
  private message = createRef<HTMLDivElement>()

  static getDerivedStateFromError() { return { failed: true } }

  componentDidUpdate(_: DeferredBoundaryProps, previous: { failed: boolean }) {
    if (this.state.failed && !previous.failed) this.message.current?.focus()
  }

  private tryAgain = () => {
    this.message.current?.closest<HTMLElement>('.workspace-section')?.focus({ preventScroll: true })
    this.props.reset()
    this.setState({ failed: false })
  }

  render() {
    const { children, loadingLabel, rows, shape, language } = this.props
    if (!this.state.failed) return <Suspense fallback={<LoadingSkeleton label={loadingLabel} rows={rows} shape={shape} />}>{children}</Suspense>
    const translate = (english: string, bisaya: string) => language === 'fil' ? bisaya : english
    return <div ref={this.message} tabIndex={-1} role="alert" className="notice notice--error deferred-failure">
      <p><strong>{translate('This section did not open.', 'Hindi mabuksan ang bahaging ito.')}</strong></p>
      <p>{translate(
        'It may not have downloaded because the internet connection is weak or the app was updated. Your other sections are still open. Check your connection, then choose Try again.',
        'Maaaring hindi na-download dahil mabagal ang internet o na-update ang app. Bukas pa rin ang ibang bahagi. Suriin ang iyong koneksyon, saka piliin ang Subukan ulit.',
      )}</p>
      <div className="deferred-failure__actions">
        <Button type="button" onClick={this.tryAgain}>{translate('Try again', 'Subukan ulit')}</Button>
        <Button type="button" className="secondary-button" onClick={() => window.location.reload()}>{translate('Reload page', 'I-reload ang pahina')}</Button>
      </div>
      <p>{translate(
        'Reload page only if Try again does not work. Reloading clears anything you typed but have not saved in other sections.',
        'I-reload lang ang pahina kung hindi gumana ang Subukan ulit. Buburahin ng pag-reload ang anumang na-type mo pero hindi pa na-save sa ibang bahagi.',
      )}</p>
    </div>
  }
}
