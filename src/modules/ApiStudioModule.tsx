import { Download, Loader2, Network, Plus, Send, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import { executeApiProxy } from '../lib/titanApi.ts';

interface SavedEndpoint {
  id: string;
  name: string;
  method: string;
  url: string;
}

export function ApiStudioModule() {
  const { notify } = useTitan();
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('https://jsonplaceholder.typicode.com/todos/1');
  const [headersText, setHeadersText] = useState('{\n  "Accept": "application/json"\n}');
  const [bearerToken, setBearerToken] = useState('');
  const [requestBody, setRequestBody] = useState('{\n  "title": "TITAN Task",\n  "completed": false\n}');
  const [loading, setLoading] = useState(false);
  const [responseState, setResponseState] = useState<{
    status: number;
    statusText: string;
    latencyMs: number;
    headers: Record<string, string>;
    body: string;
  } | null>(null);

  const [endpoints, setEndpoints] = useState<SavedEndpoint[]>([
    { id: 'ep1', name: 'JSONPlaceholder Todo', method: 'GET', url: 'https://jsonplaceholder.typicode.com/todos/1' },
    { id: 'ep2', name: 'Create Post', method: 'POST', url: 'https://jsonplaceholder.typicode.com/posts' },
  ]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    let parsedHeaders: Record<string, string> = {};
    try {
      parsedHeaders = JSON.parse(headersText || '{}') as Record<string, string>;
    } catch {
      notify('error', 'Headers inválidos', 'O campo Headers deve ser um JSON válido.');
      return;
    }

    if (bearerToken.trim()) {
      parsedHeaders.Authorization = `Bearer ${bearerToken.trim()}`;
    }
    if (!['GET', 'HEAD'].includes(method) && !parsedHeaders['Content-Type']) {
      parsedHeaders['Content-Type'] = 'application/json';
    }

    setLoading(true);
    try {
      const res = await executeApiProxy({
        url: url.trim(),
        method,
        headers: parsedHeaders,
        requestBody: ['GET', 'HEAD'].includes(method) ? undefined : requestBody,
      });
      setResponseState(res);
    } catch (err) {
      notify('error', 'Falha na requisição', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEndpoint = () => {
    const id = `ep_${Date.now()}`;
    setEndpoints((prev) => [{ id, name: `${method} ${new URL(url).pathname}`, method, url }, ...prev]);
    notify('success', 'Endpoint salvo', 'Adicionado à coleção do API Studio.');
  };

  const handleExportOpenApi = () => {
    const paths: Record<string, Record<string, unknown>> = {};
    for (const ep of endpoints) {
      try {
        const u = new URL(ep.url);
        if (!paths[u.pathname]) paths[u.pathname] = {};
        paths[u.pathname][ep.method.toLowerCase()] = {
          summary: ep.name,
          responses: { '200': { description: 'OK' } },
        };
      } catch {
        // skip invalid
      }
    }
    const spec = {
      openapi: '3.0.3',
      info: { title: 'TITAN CODE API Collection', version: '1.0.0' },
      paths,
    };
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'openapi-spec.json';
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <Network className="w-5 h-5 text-red-500" />
              TITAN API Studio
            </h2>
            <p className="text-xs text-zinc-400">
              Cliente REST real via proxy protegido contra SSRF, gerenciador de endpoints, medição de latência e exportação OpenAPI 3.0.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveEndpoint}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Salvar Endpoint
            </button>
            <button
              type="button"
              onClick={handleExportOpenApi}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar OpenAPI
            </button>
          </div>
        </div>

        <form onSubmit={handleSend} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="px-3 py-2.5 bg-[#070709] border border-zinc-800 rounded-lg text-sm font-mono font-semibold text-red-400 focus:outline-none focus:border-red-600"
            >
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://api.exemplo.com/v1/recurso"
              className="flex-1 px-3.5 py-2.5 bg-[#070709] border border-zinc-800 rounded-lg text-sm font-mono text-zinc-100 focus:outline-none focus:border-red-600"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>Enviar</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-400">Bearer Token (opcional)</label>
              <input
                type="password"
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
                placeholder="Token de autorização..."
                className="w-full px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 focus:outline-none focus:border-red-600"
              />
              <label className="block text-xs font-medium text-zinc-400 pt-1">Headers (JSON)</label>
              <textarea
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
                rows={4}
                className="w-full p-3 bg-[#070709] border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 focus:outline-none focus:border-red-600"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-400">Body (JSON)</label>
              <textarea
                value={requestBody}
                onChange={(e) => setRequestBody(e.target.value)}
                rows={7}
                disabled={['GET', 'HEAD'].includes(method)}
                className="w-full p-3 bg-[#070709] border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 disabled:opacity-40 focus:outline-none focus:border-red-600"
              />
            </div>
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Saved Collection */}
        <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-zinc-300">Coleção de Endpoints</h3>
          <div className="space-y-1.5">
            {endpoints.map((ep) => (
              <div key={ep.id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => {
                    setMethod(ep.method);
                    setUrl(ep.url);
                  }}
                  className="text-left min-w-0 flex-1 cursor-pointer"
                >
                  <span className="font-mono text-[11px] font-semibold text-red-400 mr-2">{ep.method}</span>
                  <span className="text-xs text-zinc-200 truncate">{ep.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEndpoints((prev) => prev.filter((item) => item.id !== ep.id))}
                  className="text-zinc-600 hover:text-red-400 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Response Viewer */}
        <div className="lg:col-span-2 bg-[#0C0C10] border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 bg-[#101016] flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-300">Resposta HTTP</span>
            {responseState && (
              <div className="flex items-center gap-3 font-mono tabular-nums">
                <span className={responseState.status < 400 ? 'text-emerald-400' : 'text-red-400'}>
                  {responseState.status} {responseState.statusText}
                </span>
                <span className="text-zinc-400">{responseState.latencyMs}ms</span>
              </div>
            )}
          </div>
          {responseState ? (
            <pre className="p-4 text-xs font-mono text-zinc-200 overflow-x-auto max-h-[380px] bg-[#070709] whitespace-pre-wrap break-words">
              {formatPossibleJson(responseState.body)}
            </pre>
          ) : (
            <div className="p-10 text-center text-xs text-zinc-500">
              Envie uma requisição para inspecionar status, latência e corpo da resposta.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatPossibleJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
