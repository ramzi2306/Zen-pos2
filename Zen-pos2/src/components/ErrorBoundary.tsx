import React from 'react';

interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode; fallback?: React.ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[200px] p-8 text-center">
          <span className="material-symbols-outlined text-5xl text-error mb-4">error</span>
          <p className="text-sm font-bold uppercase tracking-widest text-on-surface mb-2">Something went wrong</p>
          <p className="text-[11px] text-on-surface-variant mb-6 max-w-xs">{this.state.error?.message || 'An unexpected error occurred in this view.'}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-primary text-on-primary rounded text-[10px] font-bold uppercase tracking-widest hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
