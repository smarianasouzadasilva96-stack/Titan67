import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { MemoryKnowledgeItem, MemorySnapshotSummary } from '../../shared/titanTypes.ts';

export const CORE_DATA_DIR = path.resolve(process.cwd(), '.titan-core-data');
const MEMORY_FILE = path.join(CORE_DATA_DIR, 'memory-store.json');

export interface ErrorFixRecord {
  id: string;
  language: string;
  errorSignature: string;
  rootCause: string;
  fixDescription: string;
  beforeSnippet: string;
  afterSnippet: string;
  verifiedCount: number;
  createdAt: string;
}

export interface EvaluationRecord {
  id: string;
  modelVersion: string;
  loss: number;
  perplexity: number;
  syntaxPassRate: number;
  testedCases: number;
  evaluatedAt: string;
}

interface MemorySnapshot {
  versionId: string;
  reason: string;
  modelVersion: string;
  createdAt: string;
  entries: MemoryKnowledgeItem[];
  errorFixes: ErrorFixRecord[];
}

interface PersistedMemoryStore {
  currentVersion: number;
  modelVersion: string;
  entries: MemoryKnowledgeItem[];
  errorFixes: ErrorFixRecord[];
  evaluations: EvaluationRecord[];
  snapshots: MemorySnapshot[];
  auditTrail: Array<{
    id: string;
    action: string;
    detail: string;
    timestamp: string;
  }>;
}

const DEFAULT_KNOWLEDGE: MemoryKnowledgeItem[] = [
  {
    id: 'mem_luau_fly_v1',
    kind: 'language-spec',
    language: 'Luau',
    title: 'Luau Roblox LocalScript Fly Architecture',
    content: 'Use Players.LocalPlayer, UserInputService, RunService.RenderStepped, Workspace.CurrentCamera, LinearVelocity (fallback BodyVelocity), and AlignOrientation. Clean connections on CharacterAdded/Humanoid.Died.',
    tags: ['luau', 'roblox', 'fly', 'localscript', 'wasd'],
    validated: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mem_py_calc_v1',
    kind: 'pattern',
    language: 'Python',
    title: 'Python Typed Calculator with ZeroDivisionError Guard',
    content: 'Define typed functions add, subtract, multiply, divide, power, handle ZeroDivisionError and ValueError cleanly, include assert self-tests in __main__.',
    tags: ['python', 'calculator', 'assert', 'error-handling'],
    validated: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mem_ts_rest_v1',
    kind: 'pattern',
    language: 'TypeScript',
    title: 'TypeScript Express REST API Pattern',
    content: 'Use express.Router / express(), strict TypeScript interfaces, input validation helper, CRUD Map/store, HTTP 201/400/404 status codes, and /health endpoint.',
    tags: ['typescript', 'rest', 'api', 'express', 'crud'],
    validated: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mem_kotlin_android_v1',
    kind: 'language-spec',
    language: 'Kotlin',
    title: 'Android Jetpack Compose / Activity Complete Structure',
    content: 'Include settings.gradle.kts, build.gradle.kts, app/build.gradle.kts, AndroidManifest.xml, MainActivity.kt with setContent/UI state, strings.xml, and architecture README.md.',
    tags: ['kotlin', 'android', 'apk', 'compose', 'mainactivity'],
    validated: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mem_cpp_cli_v1',
    kind: 'pattern',
    language: 'C++',
    title: 'Modern C++17 CLI Application Pattern',
    content: 'Include <iostream>, <vector>, <string>, <stdexcept>, RAII class encapsulation, command parsing loop/flags, and deterministic test assertions.',
    tags: ['c++', 'cpp', 'cli', 'main'],
    validated: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mem_php_crud_v1',
    kind: 'pattern',
    language: 'PHP',
    title: 'PHP 8 PDO Prepared Statement CRUD Pattern',
    content: 'Use <?php declare(strict_types=1);, PDO SQLite/MySQL with ERRMODE_EXCEPTION, prepared statements against SQL injection, and JSON HTTP response helpers.',
    tags: ['php', 'crud', 'pdo', 'api'],
    validated: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mem_go_file_v1',
    kind: 'pattern',
    language: 'Go',
    title: 'Go Idiomatic File Reader with bufio.Scanner',
    content: 'Use package main, os.Open, defer file.Close(), bufio.NewScanner, line statistics, and explicit error returns.',
    tags: ['go', 'golang', 'file', 'reader', 'scanner'],
    validated: true,
    version: 1,
    createdAt: new Date().toISOString(),
  },
];

export class TitanMemoryEngine {
  private store: PersistedMemoryStore;

  constructor() {
    this.store = this.loadOrInitialize();
  }

  private loadOrInitialize(): PersistedMemoryStore {
    fs.mkdirSync(CORE_DATA_DIR, { recursive: true });
    if (fs.existsSync(MEMORY_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8')) as PersistedMemoryStore;
        if (parsed && Array.isArray(parsed.entries)) {
          return parsed;
        }
      } catch {
        // Recover cleanly to default seeded store if JSON corrupted
      }
    }

    const initial: PersistedMemoryStore = {
      currentVersion: 1,
      modelVersion: '1.0.0',
      entries: DEFAULT_KNOWLEDGE,
      errorFixes: [
        {
          id: 'fix_json_trailing_comma',
          language: 'JSON',
          errorSignature: 'Trailing comma or missing brace in JSON',
          rootCause: 'Vírgula sobrando antes de } ou ] ou bloco não fechado.',
          fixDescription: 'Remove vírgulas finais inválidas e balanceia chaves/colchetes.',
          beforeSnippet: '{"name": "titan",}',
          afterSnippet: '{\n  "name": "titan"\n}',
          verifiedCount: 1,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'fix_luau_ts_leak',
          language: 'Luau',
          errorSignature: 'export function / console.log inside Luau script',
          rootCause: 'Sintaxe TypeScript/JavaScript misturada com Luau.',
          fixDescription: 'Converte declarações export/console.log para construtos locais Luau e APIs Roblox.',
          beforeSnippet: 'console.log("Ready")',
          afterSnippet: 'print("Ready")',
          verifiedCount: 1,
          createdAt: new Date().toISOString(),
        },
      ],
      evaluations: [],
      snapshots: [],
      auditTrail: [
        {
          id: `aud_${crypto.randomUUID().slice(0, 6)}`,
          action: 'MEMORY_INIT',
          detail: 'Base persistente inicializada com padrões validados multi-linguagem.',
          timestamp: new Date().toISOString(),
        },
      ],
    };
    this.persistStore(initial);
    return initial;
  }

  private persistStore(data: PersistedMemoryStore = this.store): void {
    fs.mkdirSync(CORE_DATA_DIR, { recursive: true });
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }

  private createSnapshot(reason: string): void {
    const snap: MemorySnapshot = {
      versionId: `v${this.store.currentVersion}-${crypto.randomUUID().slice(0, 6)}`,
      reason,
      modelVersion: this.store.modelVersion,
      createdAt: new Date().toISOString(),
      entries: JSON.parse(JSON.stringify(this.store.entries)),
      errorFixes: JSON.parse(JSON.stringify(this.store.errorFixes)),
    };
    this.store.snapshots.unshift(snap);
    if (this.store.snapshots.length > 20) {
      this.store.snapshots.pop();
    }
  }

  private recordAudit(action: string, detail: string): void {
    this.store.auditTrail.unshift({
      id: `aud_${crypto.randomUUID().slice(0, 6)}`,
      action,
      detail,
      timestamp: new Date().toISOString(),
    });
    if (this.store.auditTrail.length > 100) {
      this.store.auditTrail.pop();
    }
  }

  /**
   * Controlled Learning Gate: only explicitly validated technical knowledge, passed repairs,
   * or admin-approved rules are committed into persistent TITAN Memory.
   */
  public recordValidatedEntry(params: {
    kind: MemoryKnowledgeItem['kind'];
    language: string;
    title: string;
    content: string;
    fixAfter?: string;
    tags: string[];
    validated: boolean;
  }): MemoryKnowledgeItem {
    if (!params.validated) {
      throw new Error('Política de Aprendizado Controlado: entradas não validadas não podem alterar a memória persistente do modelo.');
    }

    this.createSnapshot(`Pré-atualização: ${params.title}`);
    this.store.currentVersion += 1;

    const item: MemoryKnowledgeItem = {
      id: `mem_${crypto.randomUUID().slice(0, 8)}`,
      kind: params.kind,
      language: params.language,
      title: params.title.trim(),
      content: params.content.trim(),
      fixAfter: params.fixAfter,
      tags: params.tags.map((t) => t.toLowerCase()),
      validated: true,
      version: this.store.currentVersion,
      createdAt: new Date().toISOString(),
    };

    const existingIdx = this.store.entries.findIndex(
      (e) => e.title.toLowerCase() === item.title.toLowerCase() && e.language.toLowerCase() === item.language.toLowerCase(),
    );
    if (existingIdx >= 0) {
      this.store.entries[existingIdx] = item;
    } else {
      this.store.entries.unshift(item);
    }

    this.recordAudit('CONTROLLED_LEARN', `Registrado [${item.kind}] (${item.language}): ${item.title}`);
    this.persistStore();
    return item;
  }

  public recordValidatedErrorFix(params: {
    language: string;
    errorSignature: string;
    rootCause: string;
    fixDescription: string;
    beforeSnippet: string;
    afterSnippet: string;
  }): ErrorFixRecord {
    const existing = this.store.errorFixes.find(
      (f) => f.language.toLowerCase() === params.language.toLowerCase() && f.errorSignature === params.errorSignature,
    );
    if (existing) {
      existing.verifiedCount += 1;
      existing.afterSnippet = params.afterSnippet;
      this.recordAudit('REPAIR_REINFORCED', `Correção reforçada (${params.language}): ${params.errorSignature}`);
      this.persistStore();
      return existing;
    }

    const rec: ErrorFixRecord = {
      id: `fix_${crypto.randomUUID().slice(0, 8)}`,
      ...params,
      verifiedCount: 1,
      createdAt: new Date().toISOString(),
    };
    this.store.errorFixes.unshift(rec);
    if (this.store.errorFixes.length > 100) this.store.errorFixes.pop();
    this.recordAudit('REPAIR_LEARNED', `Novo par erro→solução validado em ${params.language}.`);
    this.persistStore();
    return rec;
  }

  public recordEvaluation(evalRec: Omit<EvaluationRecord, 'id' | 'evaluatedAt'>): EvaluationRecord {
    const rec: EvaluationRecord = {
      ...evalRec,
      id: `eval_${crypto.randomUUID().slice(0, 8)}`,
      evaluatedAt: new Date().toISOString(),
    };
    this.store.evaluations.unshift(rec);
    if (this.store.evaluations.length > 30) this.store.evaluations.pop();
    this.recordAudit('EVALUATION', `Loss=${rec.loss}, Perplexity=${rec.perplexity}, PassRate=${rec.syntaxPassRate}%`);
    this.persistStore();
    return rec;
  }

  public rollbackToVersion(versionId: string): { ok: boolean; restoredEntries: number; version: number } {
    const snap = this.store.snapshots.find((s) => s.versionId === versionId);
    if (!snap) {
      throw new Error(`Snapshot ${versionId} não encontrado.`);
    }
    this.createSnapshot(`Backup antes de rollback para ${versionId}`);
    this.store.currentVersion += 1;
    this.store.entries = JSON.parse(JSON.stringify(snap.entries));
    this.store.errorFixes = JSON.parse(JSON.stringify(snap.errorFixes));
    this.recordAudit('MEMORY_ROLLBACK', `Memória revertida para snapshot ${versionId} (${snap.reason}).`);
    this.persistStore();
    return {
      ok: true,
      restoredEntries: this.store.entries.length,
      version: this.store.currentVersion,
    };
  }

  public retrieveRelevant(query: string, language?: string, topK = 5): MemoryKnowledgeItem[] {
    const tokens = query
      .toLowerCase()
      .split(/[^a-z0-9_+.#-]+/)
      .filter((t) => t.length >= 2);
    const langLower = (language || '').toLowerCase();

    return this.store.entries
      .map((entry) => {
        let score = 0;
        if (langLower && entry.language.toLowerCase() === langLower) score += 6;
        const hay = `${entry.title} ${entry.content} ${entry.tags.join(' ')}`.toLowerCase();
        for (const tok of tokens) {
          if (entry.tags.includes(tok)) score += 3;
          else if (hay.includes(tok)) score += 1.5;
        }
        if (entry.kind === 'admin-rule') score += 2;
        return { entry, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((x) => x.entry);
  }

  public getStatus(): {
    currentVersion: number;
    entries: MemoryKnowledgeItem[];
    errorFixes: ErrorFixRecord[];
    evaluations: EvaluationRecord[];
    snapshots: MemorySnapshotSummary[];
    auditTrail: PersistedMemoryStore['auditTrail'];
  } {
    return {
      currentVersion: this.store.currentVersion,
      entries: this.store.entries,
      errorFixes: this.store.errorFixes,
      evaluations: this.store.evaluations,
      snapshots: this.store.snapshots.map((s) => ({
        versionId: s.versionId,
        reason: s.reason,
        entriesCount: s.entries.length,
        modelVersion: s.modelVersion,
        createdAt: s.createdAt,
      })),
      auditTrail: this.store.auditTrail.slice(0, 40),
    };
  }
}
