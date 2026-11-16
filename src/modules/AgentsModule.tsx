import { Bot, Loader2, Play, Workflow } from 'lucide-react';
import React, { useState } from 'react';
import { useTitan } from '../contexts/TitanContext.tsx';
import { sendAiChat } from '../lib/titanApi.ts';
import { writeAuditLog } from '../lib/workspaceService.ts';

interface AgentDef {
  id: string;
  name: string;
  objective: string;
  tools: string[];
  permissions: string;
  instructions: string;
}

const SPECIALIZED_AGENTS: AgentDef[] = [
  {
    id: 'project-agent',
    name: 'Project Agent',
    objective: 'Planejar arquitetura modular, diretórios, contratos e dependências.',
    tools: ['Workspace Inspector', 'Dependency Graph'],
    permissions: 'Leitura de projeto + geração de especificação',
    instructions: 'Defina estrutura completa de pastas, responsabilidades e critérios de aceitação sem código vazio.',
  },
  {
    id: 'code-agent',
    name: 'Code Agent',
    objective: 'Implementar módulos completos na linguagem exata solicitada.',
    tools: ['Script Engine', 'Syntax Checker'],
    permissions: 'Geração de código completo',
    instructions: 'Escreva implementação real e auto-contida respeitando a linguagem e APIs oficiais do ambiente.',
  },
  {
    id: 'debug-agent',
    name: 'Debug Agent',
    objective: 'Localizar causa raiz de bugs, exceções e regressões.',
    tools: ['Static Analyzer', 'Isolated Sandbox'],
    permissions: 'Diagnóstico e patch de correção',
    instructions: 'Identifique exatamente a linha/causa do erro e forneça o patch corrigido.',
  },
  {
    id: 'build-agent',
    name: 'Build Agent',
    objective: 'Preparar manifestos, scripts Gradle/npm/tsconfig e empacotamento.',
    tools: ['Manifest Validator', 'Build Inspector'],
    permissions: 'Configuração de build',
    instructions: 'Garanta configurações válidas e reporte honestamente dependências ausentes no ambiente.',
  },
  {
    id: 'security-agent',
    name: 'Security Agent',
    objective: 'Auditar XSS, SQLi, SSRF, segredos expostos e controle de acesso.',
    tools: ['Security Scanner', 'Rules Auditor'],
    permissions: 'Auditoria somente leitura + recomendações',
    instructions: 'Classifique riscos por severidade e apresente correções concretas.',
  },
  {
    id: 'design-agent',
    name: 'Design Agent',
    objective: 'Projetar interfaces acessíveis, responsivas e consistentes.',
    tools: ['Layout Grid Spec', 'Contrast Checker'],
    permissions: 'Especificação UI/UX',
    instructions: 'Aplique hierarquia tipográfica, contraste WCAG AA e design responsivo mobile-first.',
  },
  {
    id: 'test-agent',
    name: 'Test Agent',
    objective: 'Criar suítes de testes unitários, de integração e casos de borda.',
    tools: ['Python/JS Sandbox', 'Assertion Builder'],
    permissions: 'Execução em sandbox isolado',
    instructions: 'Crie testes executáveis com casos positivos, negativos e limites.',
  },
  {
    id: 'documentation-agent',
    name: 'Documentation Agent',
    objective: 'Gerar documentação técnica, guias de uso e referência de API.',
    tools: ['Markdown Generator', 'OpenAPI Builder'],
    permissions: 'Geração de documentos',
    instructions: 'Escreva READMEs técnicos reais descrevendo arquitetura, instalação e uso.',
  },
  {
    id: 'research-agent',
    name: 'Research Agent',
    objective: 'Avaliar trade-offs técnicos, bibliotecas e padrões de engenharia.',
    tools: ['Capability Inspector', 'Architecture Matrix'],
    permissions: 'Pesquisa técnica',
    instructions: 'Compare alternativas com critérios objetivos de performance, manutenção e segurança.',
  },
  {
    id: 'deployment-agent',
    name: 'Deployment Agent',
    objective: 'Configurar pipelines Docker, Render, Vercel, Netlify, Railway, DNS/TLS e estratégia de rollback.',
    tools: ['Deploy Bundle Analyzer', 'DNS/TLS Probe'],
    permissions: 'Geração de manifestos de deploy',
    instructions: 'Valide variáveis de ambiente, portas, healthchecks (/api/health), HTTPS e plano de rollback seguro.',
  },
];

export function AgentsModule() {
  const { user, notify } = useTitan();
  const [selectedAgentId, setSelectedAgentId] = useState(SPECIALIZED_AGENTS[0].id);
  const [taskInput, setTaskInput] = useState('');
  const [running, setRunning] = useState(false);
  const [orchestrating, setOrchestrating] = useState(false);
  const [outputs, setOutputs] = useState<Array<{ agent: string; reply: string }>>([]);

  const selectedAgent =
    SPECIALIZED_AGENTS.find((a) => a.id === selectedAgentId) || SPECIALIZED_AGENTS[0];

  const handleRunSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskInput.trim()) return;
    setRunning(true);
    try {
      const res = await sendAiChat({
        mode: 'agent',
        message: taskInput.trim(),
        history: [],
        agentProfile: {
          id: selectedAgent.id,
          name: selectedAgent.name,
          objective: selectedAgent.objective,
          instructions: selectedAgent.instructions,
        },
      });
      setOutputs([{ agent: selectedAgent.name, reply: res.reply }]);
      if (user) {
        await writeAuditLog({
          actorId: user.uid,
          module: 'agents',
          action: `run_${selectedAgent.id}`,
          severity: 'info',
          detail: `Agente ${selectedAgent.name} executado.`,
        });
      }
    } catch (err) {
      notify('error', 'Falha no agente', err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const handleCoordinatedPipeline = async () => {
    if (!taskInput.trim()) {
      notify('warning', 'Objetivo vazio', 'Descreva a tarefa para coordenar os agentes.');
      return;
    }
    setOrchestrating(true);
    setOutputs([]);
    const sequence = ['project-agent', 'code-agent', 'security-agent', 'test-agent'];
    let accumulatedContext = taskInput.trim();

    try {
      for (const agentId of sequence) {
        const agent = SPECIALIZED_AGENTS.find((a) => a.id === agentId)!;
        const res = await sendAiChat({
          mode: 'agent',
          message: `Tarefa original: ${taskInput.trim()}\n\nContexto acumulado dos agentes anteriores:\n${accumulatedContext}`,
          history: [],
          agentProfile: {
            id: agent.id,
            name: agent.name,
            objective: agent.objective,
            instructions: agent.instructions,
          },
        });
        setOutputs((prev) => [...prev, { agent: agent.name, reply: res.reply }]);
        accumulatedContext += `\n\n[${agent.name}]:\n${res.reply.slice(0, 2000)}`;
      }
      notify('success', 'Coordenação concluída', '4 agentes especializados executaram o fluxo sequencial.');
    } catch (err) {
      notify('error', 'Falha na coordenação', err instanceof Error ? err.message : String(err));
    } finally {
      setOrchestrating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-4 space-y-2">
          <h2 className="font-display text-base font-semibold text-white px-2 pb-1">
            Agentes Especializados ({SPECIALIZED_AGENTS.length})
          </h2>
          <div className="space-y-1">
            {SPECIALIZED_AGENTS.map((agent) => {
              const active = agent.id === selectedAgentId;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors cursor-pointer ${
                    active
                      ? 'bg-red-600/15 border border-red-600/40 text-white'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-transparent'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5 text-red-500" />
                    {agent.name}
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">{agent.objective}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="font-display text-lg font-bold text-white">
                {selectedAgent.name}
              </h3>
              <p className="text-sm text-zinc-300">{selectedAgent.objective}</p>
              <div className="text-xs text-zinc-500 flex flex-wrap gap-3 pt-1">
                <span>Ferramentas: {selectedAgent.tools.join(', ')}</span>
                <span aria-hidden="true">·</span>
                <span>Permissões: {selectedAgent.permissions}</span>
              </div>
            </div>

            <form onSubmit={handleRunSingle} className="space-y-3">
              <textarea
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                rows={4}
                placeholder="Descreva a tarefa de engenharia para o agente ou para o pipeline coordenado..."
                className="w-full px-4 py-3 bg-[#070709] border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-red-600"
              />
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => void handleCoordinatedPipeline()}
                  disabled={orchestrating || running}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-medium text-white rounded-lg inline-flex items-center gap-2 cursor-pointer"
                >
                  {orchestrating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Workflow className="w-3.5 h-3.5 text-red-500" />}
                  Coordenar Pipeline (Project → Code → Security → Test)
                </button>
                <button
                  type="submit"
                  disabled={running || orchestrating}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-medium text-white rounded-lg inline-flex items-center gap-2 cursor-pointer"
                >
                  {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Executar {selectedAgent.name}
                </button>
              </div>
            </form>
          </div>

          {outputs.map((out, idx) => (
            <div key={idx} className="bg-[#0C0C10] border border-zinc-800 rounded-xl p-5 space-y-2">
              <h4 className="font-display text-sm font-semibold text-red-400">
                {out.agent}
              </h4>
              <pre className="text-xs sm:text-sm text-zinc-200 whitespace-pre-wrap break-words font-sans leading-relaxed">
                {out.reply}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
