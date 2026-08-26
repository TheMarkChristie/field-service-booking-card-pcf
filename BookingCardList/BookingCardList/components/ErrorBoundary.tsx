import * as React from "react";
import { tokens } from "@fluentui/react-components";

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
          role="alert"
          style={{
            padding: 12,
            margin: 12,
            color: tokens.colorStatusDangerForeground1,
            background: tokens.colorStatusDangerBackground1,
            borderRadius: 4,
            fontFamily: tokens.fontFamilyBase,
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
