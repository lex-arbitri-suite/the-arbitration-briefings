import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = "An unexpected error occurred.";
      let errorDetails = "";

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error) {
            errorMessage = "A security or connection error occurred.";
            errorDetails = parsed.error;
          }
        }
      } catch (e) {
        // Not a JSON error
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-paper flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-border rounded-sm p-8 shadow-xl text-center">
            <div className="w-16 h-16 rounded-full bg-[#fdf2f2] flex items-center justify-center text-burgundy mx-auto mb-6">
              <AlertTriangle size={32} />
            </div>
            <h2 className="font-serif text-2xl font-medium text-ink mb-4">System Interruption</h2>
            <p className="text-sm text-muted mb-6 leading-relaxed">
              {errorMessage}
            </p>
            {errorDetails && (
              <div className="mb-8 p-4 bg-paper-dim border border-border rounded-sm text-left">
                <p className="text-[10px] font-bold uppercase tracking-widest text-burgundy mb-2">Technical Details</p>
                <p className="text-[10px] font-mono text-gray-600 break-all">{errorDetails}</p>
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-burgundy text-white rounded-sm text-xs font-bold uppercase tracking-widest hover:bg-burgundy-deep transition-colors"
            >
              <RotateCcw size={16} />
              <span>Restart Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
