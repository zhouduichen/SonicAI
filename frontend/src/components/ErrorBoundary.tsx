"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card-outer">
          <div className="card-inner p-8 text-center space-y-4">
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              出现了一些问题
            </p>
            <p className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
              {this.state.error?.message || "Unknown error"}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="btn-primary text-xs"
            >
              重新加载
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
