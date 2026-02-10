import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  state = { hasError: false, error: '' };
  static getDerivedStateFromError(e: Error) {
    return { hasError: true, error: e.message };
  }
  componentDidCatch(e: Error) {
    console.error('App error:', e);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', background: '#1e293b', color: '#f1f5f9', padding: 24, fontFamily: 'sans-serif' }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#94a3b8', marginBottom: 16 }}>{this.state.error}</p>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);