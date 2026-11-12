import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  failed: boolean
}

/** Last line of defence: a rendering bug shows a way out, not a blank page. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Wayfarer failed to render', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="notice notice-error crash" role="alert">
        <h2>This page hit a problem</h2>
        <p>Your saved trips are safe. Reload to carry on.</p>
        <button className="button" onClick={() => location.assign(location.pathname)}>
          Reload Wayfarer
        </button>
      </div>
    )
  }
}
