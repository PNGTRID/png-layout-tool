import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary — catches render errors to prevent white-screen crashes.
 * Displays a user-friendly recovery UI with a reload button.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-gray-50 p-8">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-lg font-semibold text-gray-800">应用出现了意外错误</h1>
          <p className="max-w-md text-center text-sm text-gray-500">
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            onClick={this.handleReload}
            className="mt-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white shadow-sm
                       transition-all hover:bg-blue-700 active:scale-[0.97]"
          >
            重新加载
          </button>
          <p className="text-xs text-gray-400">如反复出现，请重启应用</p>
        </div>
      );
    }
    return this.props.children;
  }
}
