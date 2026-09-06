import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Short description of what failed, e.g. "the map view". */
  label?: string;
  /** Render your own fallback instead of the default card. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Without a boundary, any thrown error during render unmounts the entire React
 * root and the user just sees a blank white page. This catches it and shows
 * something actionable instead.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    const { children, fallback, label } = this.props;

    if (!error) return children;
    if (fallback) return fallback(error, this.reset);

    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-red-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h3 className="font-serif text-xl font-semibold text-[#5a5a40]">
          Something went wrong{label ? ` loading ${label}` : ''}
        </h3>
        <p className="max-w-md text-sm text-[#3d3d3d]">
          Your journal data is safe - this is a display error. Try again, and if it keeps
          happening the details below will help track it down.
        </p>
        <code className="max-w-md overflow-x-auto rounded-lg border border-[#e5e0d8] bg-[#f5f2ed] px-3 py-2 text-left font-mono text-[11px] text-[#8c8579]">
          {error.message || String(error)}
        </code>
        <button
          type="button"
          onClick={this.reset}
          className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#5a5a40] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4a4a35]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Try again</span>
        </button>
      </div>
    );
  }
}
