import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="grid min-h-dvh place-items-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-soft">
            <h1 className="text-xl font-black text-rose-700">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-600">{this.state.error.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-bold text-white"
            >
              Reload app
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
