import * as React from "react";

interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  error?: Error;
}

/** Catches render-time errors so a single bad card can't blank the whole control. */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[BookingCardList] Render error", error, info);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 12,
            margin: 12,
            color: "#a4262c",
            background: "#fde7e9",
            borderRadius: 4,
            fontFamily: "Segoe UI, sans-serif",
            fontSize: 13,
            whiteSpace: "pre-wrap",
          }}
        >
          {`Control error: ${this.state.error.message}`}
        </div>
      );
    }
    return this.props.children;
  }
}
