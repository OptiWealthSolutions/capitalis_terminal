"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 bg-bg-secondary border border-bg-border rounded text-center">
          <AlertTriangle size={24} className="text-accent-orange" />
          <div>
            <div className="text-text-primary font-medium mb-1">
              {this.props.fallbackLabel ?? "MODULE RENDER ERROR"}
            </div>
            <div className="text-text-secondary text-xs">
              {this.state.error?.message ?? "Unknown error"}
            </div>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 px-3 py-1.5 text-xs bg-bg-tertiary border border-bg-border text-text-secondary hover:text-text-primary hover:border-accent-blue transition-colors"
          >
            <RefreshCw size={12} />
            RETRY
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Functional wrapper for query errors
export function QueryError({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry?: () => void;
}) {
  const msg = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ?? error?.message
    ?? "Unknown error";

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-6 bg-bg-secondary border border-bg-border rounded">
      <AlertTriangle size={20} className="text-accent-red" />
      <div className="text-text-secondary text-xs text-center">{msg}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary border border-bg-border hover:border-accent-blue hover:text-text-primary transition-colors"
        >
          <RefreshCw size={11} />
          RETRY
        </button>
      )}
    </div>
  );
}
