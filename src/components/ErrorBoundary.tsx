import React from 'react';

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg p-8 space-y-4">
            <h1 className="text-2xl font-bold text-red-600">Something went wrong</h1>
            <p className="text-gray-700 text-sm font-mono bg-gray-100 rounded-xl p-4 overflow-auto max-h-60">
              {this.state.error?.message}
            </p>
            <p className="text-gray-500 text-xs font-mono bg-gray-100 rounded-xl p-4 overflow-auto max-h-40 whitespace-pre-wrap">
              {this.state.error?.stack}
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
