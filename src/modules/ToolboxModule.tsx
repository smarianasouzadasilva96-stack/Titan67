import * as yaml from 'js-yaml';
import { CheckCircle2, Copy, Download, Plus, Trash2, Wrench } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';

type ToolTab = 'dev' | 'create' | 'org';

interface SnippetItem {
  id: string;
  title: string;
  language: string;
  code: string;
}

export function ToolboxModule() {
  const { notify } = useTitan();
  const [tab, setTab] = useState<ToolTab>('dev');

  // Dev Tools: JSON / YAML / XML + Regex
  const [dataInput, setDataInput] = useState('{\n  "platform": "TITAN CODE",\n  "version": "2.0",\n  "modules": ["Script Studio", "Project Builder", "Luau Lab"]\n}');
  const [dataOutput, setDataOutput] = useState('');
  const [dataStatus, setDataStatus] = useState<string | null>(null);

  const [regexPattern, setRegexPattern] = useState('([A-Z]+)-(\\d{3,5})');
  const [regexFlags, setRegexFlags] = useState('g');
  const [regexText, setRegexText] = useState('Builds: TITAN-1042, CORE-998 e LUAU-404.');

  // Creation Tools: SVG Icon Maker & Contrast Checker
  const [iconShape, setIconShape] = useState<'shield' | 'hex' | 'blade'>('shield');
  const [iconBg, setIconBg] = useState('#0B0B0F');
  const [iconAccent, setIconAccent] = useState('#DC2626');
  const [iconStroke, setIconStroke] = useState('#E4E4E7');
  const [fgColor, setFgColor] = useState('#F4F4F5');
  const [bgColor, setBgColor] = useState('#070709');

  // Organization Tools: Snippets & Notes
  const [snippets, setSnippets] = useState<SnippetItem[]>([
    {
      id: 'snip_1',
      title: 'Luau Safe RemoteEvent Handler',
      language: 'Luau',
      code: 'local ReplicatedStorage = game:GetService("ReplicatedStorage")\nlocal remote = ReplicatedStorage:WaitForChild("ActionEvent")\nremote.OnServerEvent:Connect(function(player, payload)\n\tif typeof(payload) ~= "table" then return end\nend)',
    },
  ]);
  const [newSnipTitle, setNewSnipTitle] = useState('');
  const [newSnipLang, setNewSnipLang] = useState('Python');
  const [newSnipCode, setNewSnipCode] = useState('');
  const [notes, setNotes] = useState('Notas de arquitetura TITAN CODE:\n- Validar sempre linguagem alvo antes da entrega.\n- Garantir testes reais em Python/JS.');

  const regexMatches = useMemo(() => {
    try {
      const re = new RegExp(regexPattern, regexFlags);
      const list: Array<{ match: string; index: number; groups: string[] }> = [];
      if (regexFlags.includes('g')) {
        for (const m of regexText.matchAll(re)) {
          list.push({
            match: m[0],
            index: m.index ?? 0,
            groups: m.slice(1).map((g) => g ?? ''),
          });
          if (list.length > 50) break;
        }
      } else {
        const m = regexText.match(re);
        if (m) {
          list.push({
            match: m[0],
            index: m.index ?? 0,
            groups: m.slice(1).map((g) => g ?? ''),
          });
        }
      }
      return { error: null, list };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err), list: [] };
    }
  }, [regexPattern, regexFlags, regexText]);

  const contrastRatio = useMemo(() => computeContrastRatio(fgColor, bgColor), [fgColor, bgColor]);

  const svgMarkup = useMemo(() => {
    const inner =
      iconShape === 'shield'
        ? `<path d="M50 12 L84 26 V52 C84 72 68 84 50 90 C32 84 16 72 16 52 V26 Z" fill="none" stroke="${iconStroke}" stroke-width="5"/><path d="M36 40 L64 68 M64 40 L36 68" stroke="${iconAccent}" stroke-width="6" stroke-linecap="round"/>`
        : iconShape === 'hex'
        ? `<polygon points="50,10 85,30 85,70 50,90 15,70 15,30" fill="none" stroke="${iconStroke}" stroke-width="5"/><polygon points="50,28 68,50 50,72 32,50" fill="${iconAccent}"/>`
        : `<path d="M22 78 L50 14 L78 78 L50 62 Z" fill="none" stroke="${iconStroke}" stroke-width="5"/><circle cx="50" cy="48" r="9" fill="${iconAccent}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="256" height="256"><rect width="100" height="100" rx="18" fill="${iconBg}"/>${inner}</svg>`;
  }, [iconShape, iconBg, iconAccent, iconStroke]);

  const handleFormatJson = () => {
    try {
      setDataOutput(JSON.stringify(JSON.parse(dataInput), null, 2));
      setDataStatus('JSON válido e formatado.');
    } catch (err) {
      setDataStatus(`Erro JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleMinifyJson = () => {
    try {
      setDataOutput(JSON.stringify(JSON.parse(dataInput)));
      setDataStatus('JSON minificado com sucesso.');
    } catch (err) {
      setDataStatus(`Erro JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleJsonToYaml = () => {
    try {
      const obj = JSON.parse(dataInput);
      setDataOutput(yaml.dump(obj));
      setDataStatus('Convertido de JSON para YAML.');
    } catch (err) {
      setDataStatus(`Erro conversão: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleYamlToJson = () => {
    try {
      const obj = yaml.load(dataInput);
      setDataOutput(JSON.stringify(obj, null, 2));
      setDataStatus('Convertido de YAML para JSON.');
    } catch (err) {
      setDataStatus(`Erro YAML: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleValidateXml = () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(dataInput, 'application/xml');
    const errNode = doc.querySelector('parsererror');
    if (errNode) {
      setDataStatus(`XML inválido: ${errNode.textContent || 'Erro sintático'}`);
    } else {
      setDataOutput(new XMLSerializer().serializeToString(doc));
      setDataStatus('XML válido.');
    }
  };

  const handleDownloadSvg = () => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `titan-${iconShape}-icon.svg`;
    a.click();
  };

  const handleAddSnippet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSnipTitle.trim() || !newSnipCode.trim()) return;
    setSnippets((prev) => [
      { id: `snip_${Date.now()}`, title: newSnipTitle.trim(), language: newSnipLang, code: newSnipCode },
      ...prev,
    ]);
    setNewSnipTitle('');
    setNewSnipCode('');
    notify('success', 'Snippet salvo', 'Adicionado ao Snippet Manager.');
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
            <Wrench className="w-5 h-5 text-red-500" />
            TITAN Toolbox
          </h2>
          <p className="text-xs text-zinc-400">
            Utilitários reais de desenvolvimento, criação vetorial/cores e organização técnica.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#070709] border border-zinc-800 rounded-lg">
          {(
            [
              { id: 'dev', label: 'Desenvolvimento' },
              { id: 'create', label: 'Criação' },
              { id: 'org', label: 'Organização' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                tab === item.id
                  ? 'bg-red-600 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'dev' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* JSON / YAML / XML Formatter & Converter */}
          <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-white">
              Editor & Conversor JSON / YAML / XML
            </h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleFormatJson} className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs rounded-md cursor-pointer">
                Formatar JSON
              </button>
              <button type="button" onClick={handleMinifyJson} className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs rounded-md cursor-pointer">
                Minificar JSON
              </button>
              <button type="button" onClick={handleJsonToYaml} className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs rounded-md cursor-pointer">
                JSON → YAML
              </button>
              <button type="button" onClick={handleYamlToJson} className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs rounded-md cursor-pointer">
                YAML → JSON
              </button>
              <button type="button" onClick={handleValidateXml} className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs rounded-md cursor-pointer">
                Validar XML
              </button>
            </div>
            <textarea
              value={dataInput}
              onChange={(e) => setDataInput(e.target.value)}
              rows={7}
              className="w-full p-3 bg-[#070709] border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100 focus:outline-none focus:border-red-600"
            />
            {dataStatus && <p className="text-xs text-zinc-300">{dataStatus}</p>}
            {dataOutput && (
              <pre className="p-3 bg-[#070709] border border-zinc-800 rounded-lg text-xs font-mono text-emerald-300 overflow-x-auto max-h-48">
                {dataOutput}
              </pre>
            )}
          </div>

          {/* Regex Tester */}
          <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-white">
              Regex Tester em Tempo Real
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={regexPattern}
                onChange={(e) => setRegexPattern(e.target.value)}
                placeholder="Expressão regular"
                className="flex-1 px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100"
              />
              <input
                type="text"
                value={regexFlags}
                onChange={(e) => setRegexFlags(e.target.value)}
                placeholder="flags"
                className="w-20 px-3 py-2 bg-[#070709] border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100"
              />
            </div>
            <textarea
              value={regexText}
              onChange={(e) => setRegexText(e.target.value)}
              rows={4}
              className="w-full p-3 bg-[#070709] border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100"
            />
            {regexMatches.error ? (
              <p className="text-xs text-red-400 font-mono">Erro Regex: {regexMatches.error}</p>
            ) : (
              <div className="space-y-1.5 text-xs">
                <p className="text-zinc-400 tabular-nums">
                  {regexMatches.list.length} correspondência(s) encontrada(s):
                </p>
                {regexMatches.list.map((m, i) => (
                  <div key={i} className="p-2 bg-[#070709] border border-zinc-800 rounded font-mono flex justify-between gap-2">
                    <span className="text-emerald-400">"{m.match}"</span>
                    <span className="text-zinc-500">
                      idx {m.index} {m.groups.length > 0 ? `· grupos: [${m.groups.join(', ')}]` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* SVG Logo & Icon Maker */}
          <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-white">
                Icon & Logo Maker (SVG)
              </h3>
              <button
                type="button"
                onClick={handleDownloadSvg}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar SVG
              </button>
            </div>
            <div className="flex items-center gap-6">
              <div
                className="w-28 h-28 rounded-xl border border-zinc-800 flex items-center justify-center overflow-hidden shrink-0"
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
              <div className="grid grid-cols-2 gap-3 flex-1 text-xs">
                <label className="space-y-1">
                  <span className="text-zinc-400 block">Forma</span>
                  <select
                    value={iconShape}
                    onChange={(e) => setIconShape(e.target.value as 'shield' | 'hex' | 'blade')}
                    className="w-full px-2.5 py-1.5 bg-[#070709] border border-zinc-800 rounded text-zinc-200"
                  >
                    <option value="shield">Escudo</option>
                    <option value="hex">Hexágono</option>
                    <option value="blade">Lâmina</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400 block">Destaque</span>
                  <input type="color" value={iconAccent} onChange={(e) => setIconAccent(e.target.value)} className="w-full h-8 bg-transparent" />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400 block">Traço</span>
                  <input type="color" value={iconStroke} onChange={(e) => setIconStroke(e.target.value)} className="w-full h-8 bg-transparent" />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400 block">Fundo</span>
                  <input type="color" value={iconBg} onChange={(e) => setIconBg(e.target.value)} className="w-full h-8 bg-transparent" />
                </label>
              </div>
            </div>
          </div>

          {/* Color Palette & WCAG Contrast Checker */}
          <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-white">
              Paleta & Verificador de Contraste WCAG
            </h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <label className="space-y-1">
                <span className="text-zinc-400 block">Texto (Foreground)</span>
                <div className="flex items-center gap-2">
                  <input type="color" value={fgColor} onChange={(e) => setFgColor(e.target.value)} className="h-9 w-12 bg-transparent" />
                  <span className="font-mono text-zinc-200">{fgColor.toUpperCase()}</span>
                </div>
              </label>
              <label className="space-y-1">
                <span className="text-zinc-400 block">Fundo (Background)</span>
                <div className="flex items-center gap-2">
                  <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-9 w-12 bg-transparent" />
                  <span className="font-mono text-zinc-200">{bgColor.toUpperCase()}</span>
                </div>
              </label>
            </div>
            <div
              style={{ backgroundColor: bgColor, color: fgColor }}
              className="p-4 rounded-lg border border-zinc-800 space-y-1"
            >
              <p className="font-display text-base font-semibold">Prévia de Legibilidade TITAN CODE</p>
              <p className="text-xs opacity-90">Texto de interface padrão com contraste calculado em tempo real.</p>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono tabular-nums text-zinc-200">
                Razão de Contraste: {contrastRatio.toFixed(2)}:1
              </span>
              <span className={contrastRatio >= 4.5 ? 'text-emerald-400 inline-flex items-center gap-1' : 'text-amber-400'}>
                {contrastRatio >= 7 ? 'AAA Excelente' : contrastRatio >= 4.5 ? <><CheckCircle2 className="w-3.5 h-3.5" /> AA Aprovado</> : 'Abaixo de AA (4.5:1)'}
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === 'org' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Snippet Manager */}
          <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-white">Snippet Manager</h3>
            <form onSubmit={handleAddSnippet} className="space-y-2.5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSnipTitle}
                  onChange={(e) => setNewSnipTitle(e.target.value)}
                  placeholder="Título do snippet"
                  className="flex-1 px-3 py-1.5 bg-[#070709] border border-zinc-800 rounded-md text-xs text-zinc-100"
                />
                <input
                  type="text"
                  value={newSnipLang}
                  onChange={(e) => setNewSnipLang(e.target.value)}
                  placeholder="Linguagem"
                  className="w-28 px-3 py-1.5 bg-[#070709] border border-zinc-800 rounded-md text-xs text-zinc-100"
                />
              </div>
              <textarea
                value={newSnipCode}
                onChange={(e) => setNewSnipCode(e.target.value)}
                rows={3}
                placeholder="Cole o código do snippet..."
                className="w-full p-2.5 bg-[#070709] border border-zinc-800 rounded-md text-xs font-mono text-zinc-100"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Snippet
              </button>
            </form>

            <div className="space-y-2 pt-2">
              {snippets.map((s) => (
                <div key={s.id} className="p-3 bg-[#070709] border border-zinc-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-200">
                      {s.title} <span className="text-zinc-500">· {s.language}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(s.code);
                          notify('success', 'Copiado', s.title);
                        }}
                        className="text-zinc-400 hover:text-white cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSnippets((prev) => prev.filter((item) => item.id !== s.id))}
                        className="text-zinc-500 hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <pre className="text-[11px] font-mono text-zinc-400 overflow-x-auto">{s.code}</pre>
                </div>
              ))}
            </div>
          </div>

          {/* Engineering Notes */}
          <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-3">
            <h3 className="font-display text-base font-semibold text-white">Bloco de Notas Técnicas</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={13}
              className="w-full p-3.5 bg-[#070709] border border-zinc-800 rounded-lg text-xs sm:text-sm text-zinc-200 focus:outline-none focus:border-red-600"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function computeContrastRatio(fg: string, bg: string): number {
  const l1 = luminance(hexToRgb(fg));
  const l2 = luminance(hexToRgb(bg));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
