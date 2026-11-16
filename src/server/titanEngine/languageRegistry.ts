import * as yaml from 'js-yaml';
import type { FileKind } from '../../shared/titanTypes.ts';
import { SUPPORTED_LANGUAGES, normalizeLanguageName } from '../../shared/titanValidators.ts';

export interface LanguageAdapterSpec {
  id: string;
  name: string;
  extension: string;
  defaultFilename: string;
  defaultFileKind: FileKind;
  category: 'general' | 'web' | 'data';
  defaultEnvironment: string;
  commentSingle: string;
  runtimeMode: 'sandbox-exec' | 'sandbox-syntax' | 'static-validated';
  formatCode: (code: string) => string;
  checkAdapterSyntax: (code: string) => string[];
  extractSymbols: (code: string) => string[];
}

function trimTrailingWhitespaceAndNormalizeNewlines(code: string): string {
  return (
    code
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.replace(/[ \t]+$/g, ''))
      .join('\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trimEnd() + '\n'
  );
}

function defaultBraceFormat(code: string): string {
  const lines = trimTrailingWhitespaceAndNormalizeNewlines(code).split('\n');
  let indent = 0;
  const formatted: string[] = [];
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      formatted.push('');
      continue;
    }
    if (trimmed.startsWith('}') || trimmed.startsWith(']') || trimmed.startsWith(')')) {
      indent = Math.max(0, indent - 1);
    }
    formatted.push(`${'  '.repeat(indent)}${trimmed}`);
    const opens = (trimmed.match(/\{$/g) || []).length;
    const closes = (trimmed.match(/^\}/g) || []).length;
    if (opens > closes && !trimmed.includes('}')) {
      indent += 1;
    }
  }
  return formatted.join('\n').trimEnd() + '\n';
}

function extractGenericSymbols(code: string): string[] {
  const matches = [
    ...code.matchAll(/\b(?:function|def|fn|func|fun|class|struct|interface|type|object|sub|module|CREATE\s+TABLE)\s+([A-Za-z_][A-Za-z0-9_]*)/gi),
  ];
  return Array.from(new Set(matches.map((m) => m[1]))).slice(0, 30);
}

const ADAPTERS: Record<string, LanguageAdapterSpec> = {
  Python: {
    id: 'python',
    name: 'Python',
    extension: 'py',
    defaultFilename: 'main.py',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'Python 3',
    commentSingle: '#',
    runtimeMode: 'sandbox-exec',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: (code) => {
      const errs: string[] = [];
      if (/^\s*def\s+\w+\([^)]*\)\s*$/m.test(code)) errs.push('Definição Python `def` sem dois-pontos `:` final.');
      if (/\t/.test(code) && /^    /m.test(code)) errs.push('Mistura de tabs e espaços na indentação Python.');
      return errs;
    },
    extractSymbols: extractGenericSymbols,
  },
  JavaScript: {
    id: 'javascript',
    name: 'JavaScript',
    extension: 'js',
    defaultFilename: 'index.js',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'Node.js',
    commentSingle: '//',
    runtimeMode: 'sandbox-exec',
    formatCode: defaultBraceFormat,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  TypeScript: {
    id: 'typescript',
    name: 'TypeScript',
    extension: 'ts',
    defaultFilename: 'index.ts',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'Node.js',
    commentSingle: '//',
    runtimeMode: 'sandbox-exec',
    formatCode: defaultBraceFormat,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  TSX: {
    id: 'tsx',
    name: 'TSX',
    extension: 'tsx',
    defaultFilename: 'AppComponent.tsx',
    defaultFileKind: 'Source',
    category: 'web',
    defaultEnvironment: 'React / Browser',
    commentSingle: '//',
    runtimeMode: 'sandbox-syntax',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  JSX: {
    id: 'jsx',
    name: 'JSX',
    extension: 'jsx',
    defaultFilename: 'AppComponent.jsx',
    defaultFileKind: 'Source',
    category: 'web',
    defaultEnvironment: 'React / Browser',
    commentSingle: '//',
    runtimeMode: 'sandbox-syntax',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  Luau: {
    id: 'luau',
    name: 'Luau',
    extension: 'luau',
    defaultFilename: 'StarterPlayerScripts/Controller.client.luau',
    defaultFileKind: 'LocalScript',
    category: 'general',
    defaultEnvironment: 'Roblox',
    commentSingle: '--',
    runtimeMode: 'static-validated',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: (code) => {
      const errs: string[] = [];
      if (/\bexport\s+(function|interface|const)\b/.test(code)) errs.push('Palavra-chave TypeScript `export` inválida em Luau.');
      return errs;
    },
    extractSymbols: extractGenericSymbols,
  },
  Lua: {
    id: 'lua',
    name: 'Lua',
    extension: 'lua',
    defaultFilename: 'main.lua',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'Lua Runtime',
    commentSingle: '--',
    runtimeMode: 'static-validated',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  Kotlin: {
    id: 'kotlin',
    name: 'Kotlin',
    extension: 'kt',
    defaultFilename: 'MainActivity.kt',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'Android',
    commentSingle: '//',
    runtimeMode: 'static-validated',
    formatCode: defaultBraceFormat,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  Java: {
    id: 'java',
    name: 'Java',
    extension: 'java',
    defaultFilename: 'Main.java',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'JVM',
    commentSingle: '//',
    runtimeMode: 'static-validated',
    formatCode: defaultBraceFormat,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  C: {
    id: 'c',
    name: 'C',
    extension: 'c',
    defaultFilename: 'main.c',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'Native C',
    commentSingle: '//',
    runtimeMode: 'static-validated',
    formatCode: defaultBraceFormat,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  'C++': {
    id: 'cpp',
    name: 'C++',
    extension: 'cpp',
    defaultFilename: 'main.cpp',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'Native C++',
    commentSingle: '//',
    runtimeMode: 'static-validated',
    formatCode: defaultBraceFormat,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  'C#': {
    id: 'csharp',
    name: 'C#',
    extension: 'cs',
    defaultFilename: 'Program.cs',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: '.NET',
    commentSingle: '//',
    runtimeMode: 'static-validated',
    formatCode: defaultBraceFormat,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  Go: {
    id: 'go',
    name: 'Go',
    extension: 'go',
    defaultFilename: 'main.go',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'Go Runtime',
    commentSingle: '//',
    runtimeMode: 'static-validated',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  Rust: {
    id: 'rust',
    name: 'Rust',
    extension: 'rs',
    defaultFilename: 'main.rs',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'Rust Cargo',
    commentSingle: '//',
    runtimeMode: 'static-validated',
    formatCode: defaultBraceFormat,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  PHP: {
    id: 'php',
    name: 'PHP',
    extension: 'php',
    defaultFilename: 'index.php',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'PHP Server',
    commentSingle: '//',
    runtimeMode: 'static-validated',
    formatCode: defaultBraceFormat,
    checkAdapterSyntax: (code) => (/<\?php/.test(code) ? [] : ['Arquivo PHP deve iniciar com `<?php`.']),
    extractSymbols: extractGenericSymbols,
  },
  Ruby: {
    id: 'ruby',
    name: 'Ruby',
    extension: 'rb',
    defaultFilename: 'app.rb',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'Ruby Runtime',
    commentSingle: '#',
    runtimeMode: 'static-validated',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  Swift: {
    id: 'swift',
    name: 'Swift',
    extension: 'swift',
    defaultFilename: 'main.swift',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'Apple iOS/macOS',
    commentSingle: '//',
    runtimeMode: 'static-validated',
    formatCode: defaultBraceFormat,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  Dart: {
    id: 'dart',
    name: 'Dart',
    extension: 'dart',
    defaultFilename: 'main.dart',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'Flutter / Dart',
    commentSingle: '//',
    runtimeMode: 'static-validated',
    formatCode: defaultBraceFormat,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  R: {
    id: 'r',
    name: 'R',
    extension: 'R',
    defaultFilename: 'analysis.R',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'R Runtime',
    commentSingle: '#',
    runtimeMode: 'static-validated',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  Perl: {
    id: 'perl',
    name: 'Perl',
    extension: 'pl',
    defaultFilename: 'script.pl',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'Perl Runtime',
    commentSingle: '#',
    runtimeMode: 'sandbox-syntax',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  Scala: {
    id: 'scala',
    name: 'Scala',
    extension: 'scala',
    defaultFilename: 'Main.scala',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'JVM Scala',
    commentSingle: '//',
    runtimeMode: 'static-validated',
    formatCode: defaultBraceFormat,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  Haskell: {
    id: 'haskell',
    name: 'Haskell',
    extension: 'hs',
    defaultFilename: 'Main.hs',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'GHC Haskell',
    commentSingle: '--',
    runtimeMode: 'static-validated',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  Assembly: {
    id: 'assembly',
    name: 'Assembly',
    extension: 'asm',
    defaultFilename: 'main.asm',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'x86_64 Linux NASM',
    commentSingle: ';',
    runtimeMode: 'static-validated',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: (code) => [...code.matchAll(/^([a-zA-Z_][a-zA-Z0-9_]*):/gm)].map((m) => m[1]),
  },
  PowerShell: {
    id: 'powershell',
    name: 'PowerShell',
    extension: 'ps1',
    defaultFilename: 'script.ps1',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'PowerShell',
    commentSingle: '#',
    runtimeMode: 'static-validated',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  Bash: {
    id: 'bash',
    name: 'Bash',
    extension: 'sh',
    defaultFilename: 'script.sh',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'Linux Shell',
    commentSingle: '#',
    runtimeMode: 'sandbox-syntax',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  Shell: {
    id: 'shell',
    name: 'Shell',
    extension: 'sh',
    defaultFilename: 'run.sh',
    defaultFileKind: 'Source',
    category: 'general',
    defaultEnvironment: 'POSIX Shell',
    commentSingle: '#',
    runtimeMode: 'sandbox-syntax',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  HTML: {
    id: 'html',
    name: 'HTML',
    extension: 'html',
    defaultFilename: 'index.html',
    defaultFileKind: 'Source',
    category: 'web',
    defaultEnvironment: 'Browser Web',
    commentSingle: '<!--',
    runtimeMode: 'static-validated',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: (code) => [...code.matchAll(/id=["']([^"']+)["']/g)].map((m) => m[1]),
  },
  CSS: {
    id: 'css',
    name: 'CSS',
    extension: 'css',
    defaultFilename: 'styles.css',
    defaultFileKind: 'Source',
    category: 'web',
    defaultEnvironment: 'Browser Web',
    commentSingle: '/*',
    runtimeMode: 'static-validated',
    formatCode: defaultBraceFormat,
    checkAdapterSyntax: () => [],
    extractSymbols: (code) => [...code.matchAll(/(\.[a-zA-Z_-][\w-]*|#[a-zA-Z_-][\w-]*)/g)].map((m) => m[1]).slice(0, 20),
  },
  SCSS: {
    id: 'scss',
    name: 'SCSS',
    extension: 'scss',
    defaultFilename: 'styles.scss',
    defaultFileKind: 'Source',
    category: 'web',
    defaultEnvironment: 'Web Stylesheet',
    commentSingle: '//',
    runtimeMode: 'static-validated',
    formatCode: defaultBraceFormat,
    checkAdapterSyntax: () => [],
    extractSymbols: (code) => [...code.matchAll(/(\$[a-zA-Z_-][\w-]*|\.[a-zA-Z_-][\w-]*)/g)].map((m) => m[1]).slice(0, 20),
  },
  Vue: {
    id: 'vue',
    name: 'Vue',
    extension: 'vue',
    defaultFilename: 'AppComponent.vue',
    defaultFileKind: 'Source',
    category: 'web',
    defaultEnvironment: 'Vue / Browser',
    commentSingle: '//',
    runtimeMode: 'static-validated',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: (code) => (/<template>[\s\S]*<\/template>/.test(code) ? [] : ['Bloco <template> ausente no SFC Vue.']),
    extractSymbols: extractGenericSymbols,
  },
  Svelte: {
    id: 'svelte',
    name: 'Svelte',
    extension: 'svelte',
    defaultFilename: 'AppComponent.svelte',
    defaultFileKind: 'Source',
    category: 'web',
    defaultEnvironment: 'Svelte / Browser',
    commentSingle: '//',
    runtimeMode: 'static-validated',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  SQL: {
    id: 'sql',
    name: 'SQL',
    extension: 'sql',
    defaultFilename: 'schema.sql',
    defaultFileKind: 'Source',
    category: 'data',
    defaultEnvironment: 'Relational Database',
    commentSingle: '--',
    runtimeMode: 'sandbox-exec',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  JSON: {
    id: 'json',
    name: 'JSON',
    extension: 'json',
    defaultFilename: 'config.json',
    defaultFileKind: 'Config',
    category: 'data',
    defaultEnvironment: 'Data Schema',
    commentSingle: '',
    runtimeMode: 'sandbox-exec',
    formatCode: (code) => {
      try {
        return JSON.stringify(JSON.parse(code), null, 2) + '\n';
      } catch {
        return trimTrailingWhitespaceAndNormalizeNewlines(code);
      }
    },
    checkAdapterSyntax: (code) => {
      try {
        JSON.parse(code);
        return [];
      } catch (e) {
        return [e instanceof Error ? e.message : String(e)];
      }
    },
    extractSymbols: (code) => {
      try {
        const obj = JSON.parse(code) as Record<string, unknown>;
        return obj && typeof obj === 'object' ? Object.keys(obj) : [];
      } catch {
        return [];
      }
    },
  },
  YAML: {
    id: 'yaml',
    name: 'YAML',
    extension: 'yaml',
    defaultFilename: 'config.yaml',
    defaultFileKind: 'Config',
    category: 'data',
    defaultEnvironment: 'Config / CI',
    commentSingle: '#',
    runtimeMode: 'sandbox-exec',
    formatCode: (code) => {
      try {
        const parsed = yaml.load(code);
        return yaml.dump(parsed, { indent: 2 });
      } catch {
        return trimTrailingWhitespaceAndNormalizeNewlines(code);
      }
    },
    checkAdapterSyntax: (code) => {
      try {
        yaml.loadAll(code);
        return [];
      } catch (e) {
        return [e instanceof Error ? e.message : String(e)];
      }
    },
    extractSymbols: (code) => [...code.matchAll(/^([a-zA-Z0-9_-]+):/gm)].map((m) => m[1]),
  },
  TOML: {
    id: 'toml',
    name: 'TOML',
    extension: 'toml',
    defaultFilename: 'config.toml',
    defaultFileKind: 'Config',
    category: 'data',
    defaultEnvironment: 'TOML Config',
    commentSingle: '#',
    runtimeMode: 'static-validated',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: (code) => [...code.matchAll(/^\[([^\]]+)\]/gm)].map((m) => m[1]),
  },
  XML: {
    id: 'xml',
    name: 'XML',
    extension: 'xml',
    defaultFilename: 'manifest.xml',
    defaultFileKind: 'Manifest',
    category: 'data',
    defaultEnvironment: 'Markup / Config',
    commentSingle: '<!--',
    runtimeMode: 'static-validated',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: (code) => [...code.matchAll(/<([a-zA-Z0-9_:-]+)[\s>]/g)].map((m) => m[1]).slice(0, 20),
  },
  GraphQL: {
    id: 'graphql',
    name: 'GraphQL',
    extension: 'graphql',
    defaultFilename: 'schema.graphql',
    defaultFileKind: 'Source',
    category: 'data',
    defaultEnvironment: 'GraphQL API',
    commentSingle: '#',
    runtimeMode: 'static-validated',
    formatCode: defaultBraceFormat,
    checkAdapterSyntax: () => [],
    extractSymbols: extractGenericSymbols,
  },
  Protobuf: {
    id: 'protobuf',
    name: 'Protobuf',
    extension: 'proto',
    defaultFilename: 'service.proto',
    defaultFileKind: 'Source',
    category: 'data',
    defaultEnvironment: 'gRPC / Protobuf',
    commentSingle: '//',
    runtimeMode: 'static-validated',
    formatCode: defaultBraceFormat,
    checkAdapterSyntax: (code) => (/syntax\s*=/.test(code) ? [] : ['Declaração syntax = "proto3"; ausente.']),
    extractSymbols: extractGenericSymbols,
  },
  Markdown: {
    id: 'markdown',
    name: 'Markdown',
    extension: 'md',
    defaultFilename: 'README.md',
    defaultFileKind: 'Doc',
    category: 'data',
    defaultEnvironment: 'Documentation',
    commentSingle: '',
    runtimeMode: 'static-validated',
    formatCode: trimTrailingWhitespaceAndNormalizeNewlines,
    checkAdapterSyntax: () => [],
    extractSymbols: (code) => [...code.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => m[1]),
  },
};

export function getLanguageAdapter(language: string): LanguageAdapterSpec {
  const normalized = normalizeLanguageName(language);
  return ADAPTERS[normalized] || ADAPTERS.Python;
}

export function listAllLanguageAdapters(): LanguageAdapterSpec[] {
  return SUPPORTED_LANGUAGES.map((lang) => ADAPTERS[lang]).filter(Boolean);
}
