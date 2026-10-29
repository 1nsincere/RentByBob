import { Component, createRef, lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { Button, LoadingSkeleton } from './atoms'
import type { Language } from '../i18n'

// React.lazy keeps a rejected import for the lifetime of the lazy component, so retrying needs a new one.
export function deferredScreen<P extends object>(load: () => Promise<ComponentType<P>>) {
  const create = () => lazy(async () => ({ default: await load() }))
  let Loaded = create()
  function Screen(props: P) { return <Loaded {...props} /> }
  return { Screen, reset: () => { Loaded = create() } }
}

type DeferredBoundaryProps = { children: ReactNode; loadingLabel: string; rows?: number; language: Language; reset: () => void }

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
    const { children, loadingLabel, rows, language } = this.props
    if (!this.state.failed) return <Suspense fallback={<LoadingSkeleton label={loadingLabel} rows={rows} />}>{children}</Suspense>
    const translate = (english: string, bisaya: string) => language === 'ceb' ? bisaya : english
    return <div ref={this.message} tabIndex={-1} role="alert" className="notice notice--error deferred-failure">
      <p><strong>{translate('This section did not open.', 'Wala maablihi kini nga bahin.')}</strong></p>
      <p>{translate(
        'It may not have downloaded because the internet connection is weak or the app was updated. Your other sections are still open. Check your connection, then choose Try again.',
        'Basin wala ma-download tungod kay hinay ang internet o na-update ang app. Bukas gihapon ang ubang mga bahin. Susiha ang imong koneksyon, dayon pilia ang Sulayi pag-usab.',
      )}</p>
      <div className="deferred-failure__actions">
        <Button type="button" onClick={this.tryAgain}>{translate('Try again', 'Sulayi pag-usab')}</Button>
        <Button type="button" className="secondary-button" onClick={() => window.location.reload()}>{translate('Reload page', 'I-reload ang panid')}</Button>
      </div>
      <p>{translate(
        'Reload page only if Try again does not work. Reloading clears anything you typed but have not saved in other sections.',
        'I-reload lang ang panid kung dili molihok ang Sulayi pag-usab. Ang pag-reload mopapas sa bisan unsa nga imong gi-type apan wala pa ma-save sa ubang mga bahin.',
      )}</p>
    </div>
  }
}
