import React from 'react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'Erro inesperado na interface.',
    };
  }

  render() {
    if (this.state.hasError) {
      let readable = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage) as {
          error?: string;
          operationType?: string;
          path?: string;
        };
        if (parsed.error) {
          readable = `${parsed.error} (operação: ${parsed.operationType || 'unknown'}, caminho: ${parsed.path || 'n/a'})`;
        }
      } catch {
        // Keep plain string
      }

      return (
        <div className="min-h-screen bg-[#070709] text-zinc-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#0E0E13] border border-red-900/60 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-xl font-semibold text-red-400">
              Falha interceptada no TITAN CODE
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed font-mono break-words">
              {readable}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Recarregar plataforma
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
