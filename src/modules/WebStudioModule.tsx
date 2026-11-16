import JSZip from 'jszip';
import { Download, FolderPlus, Globe, Loader2, Play, Sparkles, Terminal } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import { generateWithPipeline } from '../lib/titanApi.ts';
import { saveProjectToWorkspace } from '../lib/workspaceService.ts';

const INITIAL_HTML = `<main class="app">
  <header class="header">
    <h1>Conversor de Engenharia</h1>
    <p>Preview ao vivo conectado ao console do Web Studio.</p>
  </header>
  <section class="card">
    <label for="meters">Valor em Metros (m)</label>
    <div class="row">
      <input id="meters" type="number" value="100" step="any" />
      <button id="convertBtn" type="button">Converter</button>
    </div>
    <div id="output" class="output"></div>
  </section>
</main>`;

const INITIAL_CSS = `* { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
body { margin: 0; padding: 24px; background: #09090b; color: #f4f4f5; }
.app { max-width: 560px; margin: 0 auto; display: grid; gap: 16px; }
.header h1 { margin: 0 0 4px; font-size: 1.5rem; }
.header p { margin: 0; color: #a1a1aa; font-size: 0.9rem; }
.card { background: #111116; border: 1px solid #27272a; border-radius: 10px; padding: 20px; display: grid; gap: 12px; }
label { font-size: 0.85rem; color: #d4d4d8; }
.row { display: flex; gap: 10px; }
input { flex: 1; padding: 10px 12px; border-radius: 8px; border: 1px solid #3f3f46; background: #09090b; color: #fff; }
button { padding: 10px 18px; border-radius: 8px; border: 0; background: #dc2626; color: #fff; font-weight: 600; cursor: pointer; }
button:hover { background: #ef4444; }
.output { font-family: ui-monospace, monospace; font-size: 0.9rem; color: #34d399; padding-top: 6px; }`;

const INITIAL_JS = `const input = document.getElementById('meters');
const btn = document.getElementById('convertBtn');
const output = document.getElementById('output');

function convert() {
  const m = Number(input.value);
  if (!Number.isFinite(m)) {
    console.error('Entrada numérica inválida');
    output.textContent = 'Valor inválido.';
    return;
  }
  const km = (m / 1000).toFixed(4);
  const ft = (m * 3.28084).toFixed(2);
  output.textContent = m + ' m = ' + km + ' km | ' + ft + ' ft';
  console.log('Conversão executada:', { meters: m, km, ft });
}

btn.addEventListener('click', convert);
convert();`;

export function WebStudioModule() {
  const { user, notify } = useTitan();
  const [activeTab, setActiveTab] = useState<'html' | 'css' | 'js'>('html');
  const [htmlCode, setHtmlCode] = useState(INITIAL_HTML);
  const [cssCode, setCssCode] = useState(INITIAL_CSS);
  const [jsCode, setJsCode] = useState(INITIAL_JS);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [consoleEntries, setConsoleEntries] = useState<Array<{ level: string; text: string }>>([]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.__titanWebConsole) {
        setConsoleEntries((prev) => [
          ...prev.slice(-49),
          { level: String(event.data.level), text: String(event.data.text) },
        ]);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const srcDoc = useMemo(() => {
    const consoleBridge = `<script>
(function(){
  const send = (level, args) => {
    try {
      const text = Array.from(args).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      parent.postMessage({ __titanWebConsole: true, level, text }, '*');
    } catch (_) {}
  };
  const origLog = console.log;
  const origWarn = console.warn;
  const origErr = console.error;
  console.log = function(){ send('log', arguments); origLog.apply(console, arguments); };
  console.warn = function(){ send('warn', arguments); origWarn.apply(console, arguments); };
  console.error = function(){ send('error', arguments); origErr.apply(console, arguments); };
  window.addEventListener('error', function(e){ send('error', [e.message]); });
})();
</script>`;

    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${cssCode}</style>
  ${consoleBridge}
</head>
<body>
  ${htmlCode}
  <script>${jsCode}</script>
</body>
</html>`;
  }, [htmlCode, cssCode, jsCode, refreshSeed]);

  const handleAiGenerateWeb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    setConsoleEntries([]);
    try {
      const res = await generateWithPipeline({
        module: 'project-builder',
        prompt: `Crie uma página web completa com index.html, styles.css e app.js para: ${aiPrompt.trim()}`,
        explicitLanguage: 'HTML',
        explicitEnvironment: 'Browser Web',
        deliveryMode: 'multi-file',
        projectTypeOverride: 'web',
      });
      const htmlF = res.files.find((f) => f.path.endsWith('.html'));
      const cssF = res.files.find((f) => f.path.endsWith('.css'));
      const jsF = res.files.find((f) => f.path.endsWith('.js'));

      if (htmlF) {
        const bodyMatch = htmlF.content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        setHtmlCode(bodyMatch ? bodyMatch[1].trim() : htmlF.content);
      }
      if (cssF) setCssCode(cssF.content);
      if (jsF) setJsCode(jsF.content);
      setRefreshSeed((s) => s + 1);
      notify('success', 'Web Studio atualizado', 'Arquivos HTML, CSS e JS carregados no preview ao vivo.');
    } catch (err) {
      notify('error', 'Erro ao gerar página', err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleExportZip = async () => {
    const zip = new JSZip();
    const fullHtml = `<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>TITAN Web Project</title>\n  <link rel="stylesheet" href="styles.css" />\n</head>\n<body>\n${htmlCode}\n<script src="app.js"></script>\n</body>\n</html>`;
    zip.file('index.html', fullHtml);
    zip.file('styles.css', cssCode);
    zip.file('app.js', jsCode);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'titan-web-project.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveWorkspace = async () => {
    if (!user) return;
    await saveProjectToWorkspace({
      ownerId: user.uid,
      name: 'Web Studio Project',
      description: 'Projeto Web HTML/CSS/JS criado no TITAN Web Studio',
      projectType: 'web',
      language: 'HTML',
      environment: 'Browser Web',
      status: 'COMPLETED',
      files: [
        { path: 'index.html', content: htmlCode, language: 'HTML', fileKind: 'Source' },
        { path: 'styles.css', content: cssCode, language: 'CSS', fileKind: 'Source' },
        { path: 'app.js', content: jsCode, language: 'JavaScript', fileKind: 'Source' },
      ],
    });
    notify('success', 'Salvo no Workspace', 'Projeto Web persistido no Firestore.');
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-red-500" />
              TITAN Web Studio
            </h2>
            <p className="text-xs text-zinc-400">
              Editor HTML, CSS e JavaScript com preview real em sandbox e console capturado.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setConsoleEntries([]);
                setRefreshSeed((s) => s + 1);
              }}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              Reiniciar Preview
            </button>
            <button
              type="button"
              onClick={() => void handleExportZip()}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar ZIP
            </button>
            <button
              type="button"
              onClick={() => void handleSaveWorkspace()}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-xs text-white font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              Salvar Projeto
            </button>
          </div>
        </div>

        <form onSubmit={handleAiGenerateWeb} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Gerar interface web com IA (ex: Painel de controle financeiro com gráfico e tabela)..."
            className="flex-1 px-3.5 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-red-600"
          />
          <button
            type="submit"
            disabled={generating}
            className="px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>{generating ? 'Gerando...' : 'Gerar Página Web'}</span>
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor Pane */}
        <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
          <div className="border-b border-zinc-800 px-3 py-2 flex items-center gap-1.5 bg-[#101016]">
            {(['html', 'css', 'js'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-md text-xs font-mono uppercase cursor-pointer ${
                  activeTab === tab
                    ? 'bg-red-600/20 text-white border border-red-600/40'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {tab === 'html' ? 'index.html' : tab === 'css' ? 'styles.css' : 'app.js'}
              </button>
            ))}
          </div>

          <textarea
            value={activeTab === 'html' ? htmlCode : activeTab === 'css' ? cssCode : jsCode}
            onChange={(e) => {
              if (activeTab === 'html') setHtmlCode(e.target.value);
              else if (activeTab === 'css') setCssCode(e.target.value);
              else setJsCode(e.target.value);
            }}
            spellCheck={false}
            className="w-full h-[460px] p-4 bg-[#070709] text-xs sm:text-sm font-mono text-zinc-200 focus:outline-none resize-none"
          />
        </div>

        {/* Live Preview & Console */}
        <div className="space-y-4">
          <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl overflow-hidden">
            <div className="border-b border-zinc-800 px-4 py-2.5 text-xs font-medium text-zinc-400 bg-[#101016]">
              Preview ao Vivo
            </div>
            <iframe
              key={refreshSeed}
              title="TITAN Web Studio Preview"
              sandbox="allow-scripts"
              srcDoc={srcDoc}
              className="w-full h-[320px] bg-white"
            />
          </div>

          <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl overflow-hidden">
            <div className="border-b border-zinc-800 px-4 py-2 flex items-center justify-between bg-[#101016]">
              <span className="text-xs font-medium text-zinc-300 inline-flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-red-500" />
                Console do Preview
              </span>
              <button
                type="button"
                onClick={() => setConsoleEntries([])}
                className="text-xs text-zinc-500 hover:text-zinc-200 cursor-pointer"
              >
                Limpar
              </button>
            </div>
            <div className="h-[115px] overflow-y-auto p-3 font-mono text-xs space-y-1 bg-[#070709]">
              {consoleEntries.length === 0 ? (
                <p className="text-zinc-600">Nenhuma saída no console ainda.</p>
              ) : (
                consoleEntries.map((entry, idx) => (
                  <div
                    key={idx}
                    className={
                      entry.level === 'error'
                        ? 'text-red-400'
                        : entry.level === 'warn'
                        ? 'text-amber-300'
                        : 'text-zinc-300'
                    }
                  >
                    [{entry.level}] {entry.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
