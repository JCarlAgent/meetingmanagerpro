import React from 'react';

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error?: Error | null; info?: React.ErrorInfo | null };

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Always log full error to console for diagnostics
    // (Vercel/Aggregation systems will capture console.error output)
    // Do not change auth/session state here.
    // Keep message minimal for users but surface details for debugging.
    // eslint-disable-next-line no-console
    console.error('Uncaught render error in subtree:', error, info);
    this.setState({ hasError: true, error, info });
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message ?? 'Unknown error';
      const stack = this.state.info?.componentStack ?? '';
      return (
        <div style={{ background: '#fff', color: '#111', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <div style={{ maxWidth: 920 }}>
            <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ color: '#444', marginBottom: 12 }}>{message}</p>
            {stack ? (
              <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 12, borderRadius: 6, color: '#333' }}>{stack}</pre>
            ) : null}
            <p style={{ color: '#666', marginTop: 12 }}>The error has been logged to the console for debugging.</p>
          </div>
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}
