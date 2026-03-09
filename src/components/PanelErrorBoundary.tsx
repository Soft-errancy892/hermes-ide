import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  panelName?: string;
}
interface State { hasError: boolean; error?: Error; }

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="panel-error-boundary">
          <p>{this.props.panelName || "Panel"} encountered an error</p>
          <button onClick={() => this.setState({ hasError: false, error: undefined })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
