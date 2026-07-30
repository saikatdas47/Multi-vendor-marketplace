import { Component } from 'react'

import { Button } from './ui'

/**
 * Stops one broken component from blanking the entire app.
 *
 * This exists because of a real incident: the admin inbox rendered an API field
 * that was an object rather than a string, React threw "Objects are not valid
 * as a React child", and with nothing to catch it the whole tree unmounted. The
 * page went white with no message — the hardest possible thing to diagnose from
 * the outside, because the server logs showed nothing but 200s.
 *
 * A class component because `componentDidCatch` has no hook equivalent; this is
 * the one case React still requires a class.
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Kept as console.error rather than swallowed: in development this is the
    // only place the component stack is visible.
    console.error('Unhandled render error:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold tracking-tight text-fg">
          This page hit an error
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          The rest of the app is still working. If it keeps happening, the
          details are in the browser console.
        </p>

        <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface-muted p-3 text-left text-xs text-fg-muted">
          {this.state.error?.message || String(this.state.error)}
        </pre>

        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={() => this.setState({ error: null })}>Try again</Button>
          <Button variant="secondary" onClick={() => window.location.assign('/')}>
            Go home
          </Button>
        </div>
      </div>
    )
  }
}
