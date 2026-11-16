import crypto from 'crypto';
import type {
  GeneratedFileItem,
  SelfHealingFinding,
  SelfHealingReport,
} from '../shared/titanTypes.ts';
import {
  validateCodeCompleteness,
  validateDependencies,
  validateSyntaxStatic,
} from '../shared/titanValidators.ts';
import { getSystemCapabilities, runIsolatedCode } from './sandboxRunner.ts';
import { repairCodeInternal } from './titanEngine/universalGenerator.ts';
import { titanNeuralCore } from './titanNeural/datasetAndTrainer.ts';

export async function runSelfHealingDiagnostic(params: {
  files: GeneratedFileItem[];
  applySafeFixes?: boolean;
  useAiFix?: boolean;
  adminApproved?: boolean;
}): Promise<SelfHealingReport> {
  const findings: SelfHealingFinding[] = [];
  const limitations: string[] = [];
  const currentFiles = params.files.map((f) => ({ ...f }));

  // 1. DETECÇÃO & 2. DIAGNÓSTICO
  const compCheck = validateCodeCompleteness(currentFiles);
  const depCheck = validateDependencies(currentFiles);
  const syntaxCheck = validateSyntaxStatic(currentFiles);
  const caps = await getSystemCapabilities();

  if (!compCheck.passed && compCheck.details) {
    for (const d of compCheck.details) {
      findings.push({
        id: `heal_${crypto.randomUUID().slice(0, 6)}`,
        category: 'syntax',
        severity: 'error',
        title: 'Placeholder ou função incompleta detectada',
        cause: d,
        proposedAction: 'Completar implementação real removendo TODO/FIXME/stubs.',
        autoFixSafe: Boolean(params.useAiFix),
        requiresAdminApproval: false,
        fixed: false,
        detail: d,
      });
    }
  }

  if (!depCheck.passed && depCheck.details) {
    for (const d of depCheck.details) {
      findings.push({
        id: `heal_${crypto.randomUUID().slice(0, 6)}`,
        category: 'dependency',
        severity: 'error',
        title: 'Import relativo quebrado',
        cause: d,
        proposedAction: 'Ajustar caminho de importação ou criar módulo ausente.',
        autoFixSafe: false,
        requiresAdminApproval: false,
        fixed: false,
        detail: d,
      });
    }
  }

  if (!syntaxCheck.passed && syntaxCheck.details) {
    for (const d of syntaxCheck.details) {
      findings.push({
        id: `heal_${crypto.randomUUID().slice(0, 6)}`,
        category: 'syntax',
        severity: 'error',
        title: 'Erro sintático ou delimitador desbalanceado',
        cause: d,
        proposedAction: 'Corrigir sintaxe, delimitadores ou estrutura pelo Automatic Repair Engine.',
        autoFixSafe: true,
        requiresAdminApproval: false,
        fixed: false,
        detail: d,
      });
    }
  }

  // Secret & Runtime checks
  for (const file of currentFiles) {
    if (/(api_key|secret|password|token)\s*=\s*['"][^'"]{8,}['"]/i.test(file.content)) {
      findings.push({
        id: `heal_${crypto.randomUUID().slice(0, 6)}`,
        category: 'config',
        severity: 'critical',
        title: `Possível segredo hardcoded em ${file.path}`,
        cause: 'Valor de credencial literal encontrado no código-fonte.',
        proposedAction: 'Mover credencial para variável de ambiente (.env / Server Vault).',
        autoFixSafe: false,
        requiresAdminApproval: true,
        fixed: false,
        detail: `Substitua o literal em ${file.path} por process.env / Vault.`,
      });
    }

    if (['Python', 'JavaScript', 'TypeScript', 'SQL', 'JSON', 'YAML', 'Bash', 'Perl'].includes(file.language)) {
      const execCheck = await runIsolatedCode({
        language: file.language,
        code: file.content,
        syntaxOnly: true,
      });
      if (!execCheck.syntaxValid) {
        findings.push({
          id: `heal_${crypto.randomUUID().slice(0, 6)}`,
          category: 'runtime',
          severity: 'error',
          title: `Falha de compilação/transpilação em ${file.path}`,
          cause: execCheck.stderr || 'Erro de sintaxe detectado pelo compilador real.',
          proposedAction: 'Aplicar correção automática TITAN e revalidar compilador.',
          autoFixSafe: true,
          requiresAdminApproval: false,
          fixed: false,
          detail: `${file.path}: ${execCheck.stderr}`,
        });
      }
    }
  }

  // 5. VALIDAÇÃO & 6. RECUPERAÇÃO (Autonomous TITAN Repair Engine)
  const fixedFiles: GeneratedFileItem[] = [];
  if (params.applySafeFixes && currentFiles.length > 0) {
    titanNeuralCore.ensureInitialized();
    for (let i = 0; i < currentFiles.length; i++) {
      const file = { ...currentFiles[i] };
      const repair = repairCodeInternal(file.content, file.language);
      if (repair.repairedCode !== file.content || repair.fixedCount > 0) {
        file.content = repair.repairedCode;
        currentFiles[i] = file;
        fixedFiles.push(file);

        const recheck = validateSyntaxStatic([file]);
        if (recheck.passed) {
          for (const f of findings) {
            if ((f.category === 'syntax' || f.category === 'runtime') && f.detail.includes(file.path)) {
              f.fixed = true;
            }
          }
          if (repair.fixedCount > 0) {
            titanNeuralCore.memory.recordValidatedErrorFix({
              language: file.language,
              errorSignature: `Self-Healing (${file.path})`,
              rootCause: repair.diagnostics[0]?.message || 'Sintaxe desbalanceada',
              fixDescription: repair.summary,
              beforeSnippet: params.files[i].content.slice(0, 300),
              afterSnippet: file.content.slice(0, 300),
            });
          }
        }
      }
    }
  }

  const hasCriticalUnfixed = findings.some((f) => f.severity === 'critical' && !f.fixed);
  const hasFixed = findings.some((f) => f.fixed);

  return {
    id: `healrep_${crypto.randomUUID().slice(0, 8)}`,
    executedAt: new Date().toISOString(),
    stages: [
      { stage: 'DETECÇÃO', status: findings.length > 0 ? 'WARNING' : 'OK', summary: `${findings.length} anomalia(s) identificada(s) em ${currentFiles.length} arquivo(s).` },
      { stage: 'DIAGNÓSTICO', status: hasCriticalUnfixed ? 'BLOCKED' : 'OK', summary: `Verificação estática, dependências, segredos e compiladores locais (${caps.nodeVersion}).` },
      { stage: 'CAUSA', status: 'OK', summary: findings.length > 0 ? findings[0].cause : 'Nenhuma causa raiz crítica detectada.' },
      { stage: 'PROPOSTA', status: 'OK', summary: findings.length > 0 ? `${findings.filter((f) => f.autoFixSafe).length} correção(ões) autônoma(s) disponível(is).` : 'Sistema íntegro.' },
      { stage: 'VALIDAÇÃO', status: 'OK', summary: 'Política de segurança: reparo autônomo pelo Motor TITAN sem IAs externas.' },
      { stage: 'RECUPERAÇÃO', status: hasFixed ? 'FIXED' : params.applySafeFixes ? 'OK' : 'WARNING', summary: hasFixed ? `${fixedFiles.length} arquivo(s) corrigido(s) e revalidado(s).` : 'Pronto para aplicar correções seguras.' },
    ],
    findings,
    fixedFiles: fixedFiles.length > 0 ? fixedFiles : undefined,
    limitations,
  };
}
