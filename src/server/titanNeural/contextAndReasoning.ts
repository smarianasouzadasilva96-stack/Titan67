import { detectLanguageAndEnvironment, normalizeLanguageName } from '../../shared/titanValidators.ts';
import { getSystemCapabilities } from '../sandboxRunner.ts';
import { titanNeuralCore } from './datasetAndTrainer.ts';

export interface UnifiedDiffResult {
  diff: string;
  changedLines: number;
}

export function computeUnifiedDiff(before: string, after: string, label = 'script'): UnifiedDiffResult {
  const aLines = before.replace(/\r\n/g, '\n').split('\n');
  const bLines = after.replace(/\r\n/g, '\n').split('\n');
  const maxLen = Math.max(aLines.length, bLines.length);
  const out: string[] = [`--- a/${label}`, `+++ b/${label}`];
  let changedLines = 0;

  for (let i = 0; i < maxLen; i++) {
    const a = aLines[i];
    const b = bLines[i];
    if (a === b) {
      if (a !== undefined) out.push(`  ${a}`);
    } else {
      if (a !== undefined) {
        out.push(`- ${a}`);
        changedLines += 1;
      }
      if (b !== undefined) {
        out.push(`+ ${b}`);
        changedLines += 1;
      }
    }
  }

  return { diff: out.join('\n'), changedLines };
}

export async function runAutonomousReasoningChat(params: {
  mode: 'core-ai' | 'admin-ai' | 'agent';
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  workspaceContext?: string;
  adminKnowledge?: Array<{ title: string; category: string; content: string }>;
  agentProfile?: { id: string; name: string; objective: string; instructions: string };
  systemMetricsSummary?: string;
}): Promise<{
  reply: string;
  modelUsed: string;
  providerId: string;
  neuralTelemetry: {
    loss: number;
    perplexity: number;
    parameterCount: number;
    retrievedCount: number;
  };
}> {
  titanNeuralCore.ensureInitialized();
  const status = titanNeuralCore.getStatus();
  const detection = detectLanguageAndEnvironment(params.message);
  const lower = params.message.toLowerCase();
  const telemetry = titanNeuralCore.inferCompletionTelemetry(params.message, detection.language);
  const memStatus = titanNeuralCore.memory.getStatus();
  const caps = await getSystemCapabilities();

  const sections: string[] = [];

  if (params.mode === 'admin-ai') {
    const matchedKb = (params.adminKnowledge || []).filter((k) => {
      const hay = `${k.title} ${k.category} ${k.content}`.toLowerCase();
      return lower.split(/\s+/).some((w) => w.length > 3 && hay.includes(w));
    });

    sections.push(`**TITAN ADMIN AI (Núcleo Neural Autônomo · ${status.version})**`);
    sections.push(
      `Diagnóstico operacional consultando métricas reais do servidor (sem dependência de IAs externas):\n` +
        `- **Neural Core**: ${status.parameterCount.toLocaleString('en-US')} parâmetros treináveis | Loss=${status.currentLoss} | Perplexity=${status.perplexity} | Steps=${status.trainingSteps}\n` +
        `- **Runtimes no Servidor**: Node ${caps.nodeVersion}, Python=${caps.pythonAvailable ? caps.pythonVersion : 'Ausente'}, SQL WASM=Ativo, Bash=${caps.bashAvailable ? 'Ativo' : 'Ausente'}, Android SDK=${caps.androidSdkAvailable ? 'Presente' : 'Ausente (somente código fonte)'}\n` +
        `- **Memória Persistente**: v${memStatus.currentVersion} (${memStatus.entries.length} padrões/regras validadas, ${memStatus.errorFixes.length} reparos aprendidos, ${memStatus.snapshots.length} snapshots para rollback)` +
        (params.systemMetricsSummary ? `\n- **Resumo da Plataforma**: ${params.systemMetricsSummary}` : ''),
    );

    if (matchedKb.length > 0) {
      sections.push(
        `**Procedimentos Administrativos Aplicáveis (${matchedKb.length}):**\n` +
          matchedKb.map((k) => `- **[${k.category}] ${k.title}**: ${k.content}`).join('\n'),
      );
    } else if (params.adminKnowledge && params.adminKnowledge.length > 0) {
      sections.push(
        `**Base Administrativa Ativa:** ${params.adminKnowledge.length} procedimento(s) registrado(s) e disponível(is) para auditoria.`,
      );
    }

    if (/(relat[óo]rio|report|sa[úu]de|status|metrica|erro|log|trein)/i.test(lower)) {
      const recentAudit = memStatus.auditTrail.slice(0, 5).map((a) => `  • [${a.action}] ${a.detail}`).join('\n');
      sections.push(`**Últimos Eventos do Núcleo Neural & Memória:**\n${recentAudit}`);
    }

    if (/(apagar|deletar|reset|excluir|remover|drop|limpar)/i.test(lower)) {
      sections.push(
        `⚠️ **Política de Segurança Admin**: Operações potencialmente destrutivas ou reversões de estado exigem confirmação explícita do administrador autenticado antes de execução.`,
      );
    }
  } else if (params.mode === 'agent') {
    const agent = params.agentProfile;
    sections.push(`**Agente Especializado: ${agent?.name || 'TITAN Code Agent'}**`);
    sections.push(`Objetivo ativo: ${agent?.objective || 'Engenharia de software autônoma e verificável.'}`);
  } else {
    sections.push(`**TITAN CORE AI · Motor Neural Próprio (${status.modelId})**`);
  }

  // If user is asking for code generation or technical solution in a specific language, synthesize verified code via TITAN Engine!
  const asksForCode =
    /(crie|gere|fa[çc]a|escreva|implemente|build|create|code|script|fun[çc][ãa]o|api|classe|calculadora|fly|crud|leitor|componente|query|sql)/i.test(
      lower,
    ) || !detection.ambiguous;

  if (asksForCode && params.message.trim().length > 6) {
    const { runUniversalPipeline } = await import('../titanEngine/universalGenerator.ts');
    const gen = await runUniversalPipeline({
      module: 'script-studio',
      prompt: params.message,
      explicitLanguage: detection.ambiguous ? 'Auto' : normalizeLanguageName(detection.language),
      deliveryMode: /(projeto|multi|android|apk|fullstack)/i.test(lower) ? 'multi-file' : 'single-file',
    });

    if (gen.files.length > 0) {
      const primary = gen.files[0];
      const ext = primary.path.split('.').pop() || detection.language.toLowerCase();
      sections.push(
        `### Plano de Engenharia (${gen.plan.language} · ${gen.plan.environment})\n` +
          `- **Arquitetura**: ${gen.plan.architecture}\n` +
          `- **Validadores**: ${gen.validators.filter((v) => v.passed).length}/${gen.validators.length} aprovados (${gen.status})` +
          (gen.executionEvidence?.executed
            ? `\n- **Evidência de Execução**: \`${gen.executionEvidence.runtime}\` -> exit ${gen.executionEvidence.exitCode}`
            : ''),
      );
      sections.push(`\`\`\`${ext}\n${primary.content}\n\`\`\``);
      if (gen.files.length > 1) {
        sections.push(
          `**Arquivos adicionais gerados na estrutura (${gen.files.length} total):** ` +
            gen.files.map((f) => `\`${f.path}\``).join(', '),
        );
      }
    }
  } else {
    // Reasoning & architectural guidance grounded in retrieved persistent memory
    if (telemetry.retrievedMemories.length > 0) {
      sections.push(
        `### Conhecimento Recuperado da Memória TITAN\n` +
          telemetry.retrievedMemories.map((m) => `- **[${m.language}] ${m.title}**: ${m.content}`).join('\n'),
      );
    }

    if (params.workspaceContext) {
      sections.push(`### Contexto do Workspace Analisado\n${params.workspaceContext}`);
    }

    sections.push(
      `### Orientação Técnica\n` +
        `1. Utilize o **Script Studio 2.0** para geração completa em 39 linguagens com Explicação, Correção (Diff), Otimização e Conversão.\n` +
        `2. Toda alteração sugerida pelo TITAN passa pelos 10 validadores independentes (linguagem, completude, dependências e sintaxe) antes da entrega.\n` +
        `3. Histórico considerado: ${params.history.length} mensagem(ns) anterior(es) na sessão atual.`,
    );
  }

  return {
    reply: sections.join('\n\n'),
    modelUsed: `${status.modelId} (${status.parameterCount} params)`,
    providerId: 'titan-neural-core',
    neuralTelemetry: {
      loss: status.currentLoss,
      perplexity: status.perplexity,
      parameterCount: status.parameterCount,
      retrievedCount: telemetry.retrievedMemories.length,
    },
  };
}
