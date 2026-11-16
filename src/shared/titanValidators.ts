import type {
  DeliveryMode,
  GeneratedFileItem,
  ProjectType,
  TaskState,
  ValidatorResult,
} from './titanTypes.ts';

export const SUPPORTED_LANGUAGES = [
  'Luau',
  'Lua',
  'Python',
  'JavaScript',
  'TypeScript',
  'TSX',
  'JSX',
  'Kotlin',
  'Java',
  'C',
  'C++',
  'C#',
  'Go',
  'Rust',
  'PHP',
  'Ruby',
  'Swift',
  'Dart',
  'R',
  'Perl',
  'Scala',
  'Haskell',
  'Assembly',
  'SQL',
  'HTML',
  'CSS',
  'SCSS',
  'Vue',
  'Svelte',
  'Shell',
  'Bash',
  'PowerShell',
  'JSON',
  'YAML',
  'TOML',
  'XML',
  'Markdown',
  'GraphQL',
  'Protobuf',
] as const;

export interface LanguageDetection {
  language: string;
  environment: string;
  projectType: ProjectType;
  ambiguous: boolean;
  confidence: 'high' | 'medium' | 'low';
}

const SINGLE_FILE_PATTERNS: RegExp[] = [
  /\b(em um [úu]nico (script|arquivo|bloco))\b/i,
  /\b(tudo em um ([úu]nico )?arquivo)\b/i,
  /\b(n[ãa]o divida|sem dividir|sem m[óo]dulos externos)\b/i,
  /\b(arquivo [úu]nico|single[- ]file|one[- ]file|all[- ]in[- ]one)\b/i,
  /\b(quero copiar e executar|copy and run|c[óo]digo completo em um)\b/i,
];

const MULTI_FILE_PATTERNS: RegExp[] = [
  /\b(v[áa]rios arquivos|m[úu]ltiplos arquivos|multi[- ]file|projeto completo|estrutura completa)\b/i,
  /\b(android|apk|kotlin|gradle|fullstack|backend e frontend|api completa)\b/i,
];

export function detectSingleFileIntent(
  prompt: string,
  overrideMode: DeliveryMode = 'auto',
): { singleFile: boolean; reason: string } {
  if (overrideMode === 'single-file') {
    return { singleFile: true, reason: 'Modo Arquivo Único selecionado explicitamente.' };
  }
  if (overrideMode === 'multi-file') {
    return { singleFile: false, reason: 'Modo Múltiplos Arquivos selecionado explicitamente.' };
  }
  for (const pattern of SINGLE_FILE_PATTERNS) {
    const match = prompt.match(pattern);
    if (match) {
      return {
        singleFile: true,
        reason: `Single-File Intelligence ativada pela frase "${match[0]}".`,
      };
    }
  }
  for (const pattern of MULTI_FILE_PATTERNS) {
    const match = prompt.match(pattern);
    if (match) {
      return {
        singleFile: false,
        reason: `Arquitetura multi-arquivo detectada para "${match[0]}".`,
      };
    }
  }
  return {
    singleFile: true,
    reason: 'Script único auto-contido padrão para execução direta.',
  };
}

export function detectLanguageAndEnvironment(
  prompt: string,
  explicitLanguage?: string,
  explicitEnvironment?: string,
): LanguageDetection {
  const lower = prompt.toLowerCase();

  if (explicitLanguage && explicitLanguage !== 'Auto') {
    const normalizedExplicit = normalizeLanguageName(explicitLanguage);
    const env =
      explicitEnvironment && explicitEnvironment !== 'Auto'
        ? explicitEnvironment
        : inferEnvironmentFromLanguage(normalizedExplicit, lower);
    return {
      language: normalizedExplicit,
      environment: env,
      projectType: inferProjectType(normalizedExplicit, env, lower),
      ambiguous: false,
      confidence: 'high',
    };
  }

  const rules: Array<{
    regex: RegExp;
    language: string;
    environment: string;
    projectType: ProjectType;
  }> = [
    { regex: /\b(luau|roblox|localscript|modulescript|remoteevent|datastore|bodyvelocity|linearvelocity|alignorientation|userinputservice)\b/i, language: 'Luau', environment: 'Roblox', projectType: 'luau' },
    { regex: /\b(lua)\b/i, language: 'Lua', environment: 'Lua Runtime', projectType: 'script' },
    { regex: /\b(android|apk|mainactivity|gradle|jetpack compose|xml layout)\b/i, language: 'Kotlin', environment: 'Android', projectType: 'android' },
    { regex: /\b(kotlin|\.kt)\b/i, language: 'Kotlin', environment: 'JVM / Android', projectType: 'android' },
    { regex: /\b(tsx)\b|componente\s+react.*\btypescript\b|\breact\s+tsx\b/i, language: 'TSX', environment: 'React / Browser', projectType: 'web' },
    { regex: /\b(jsx)\b|componente\s+react(?!.*typescript)/i, language: 'JSX', environment: 'React / Browser', projectType: 'web' },
    { regex: /\b(react)\b/i, language: 'TSX', environment: 'React / Browser', projectType: 'web' },
    { regex: /\b(vue|\.vue|nuxt)\b/i, language: 'Vue', environment: 'Vue / Browser', projectType: 'web' },
    { regex: /\b(svelte|\.svelte|sveltekit)\b/i, language: 'Svelte', environment: 'Svelte / Browser', projectType: 'web' },
    { regex: /\b(python|py|flask|fastapi|django|tkinter|pandas|numpy|pytest)\b/i, language: 'Python', environment: 'Python 3', projectType: 'script' },
    { regex: /\b(typescript|\.ts\b)\b/i, language: 'TypeScript', environment: 'Node.js / Web', projectType: 'script' },
    { regex: /\b(scss|sass)\b/i, language: 'SCSS', environment: 'Web Stylesheet', projectType: 'web' },
    { regex: /\b(css|stylesheet|folha de estilo)\b/i, language: 'CSS', environment: 'Browser Web', projectType: 'web' },
    { regex: /\b(html|landing page|p[áa]gina web|website|frontend)\b/i, language: 'HTML', environment: 'Browser Web', projectType: 'web' },
    { regex: /\b(javascript|js|node\.?js|express)\b/i, language: 'JavaScript', environment: 'Node.js / Browser', projectType: 'script' },
    { regex: /\b(sql|postgres|sqlite|mysql|select\s+.*from|create\s+table)\b/i, language: 'SQL', environment: 'Relational Database', projectType: 'script' },
    { regex: /\b(java|spring boot|maven)\b/i, language: 'Java', environment: 'JVM', projectType: 'script' },
    { regex: /(c\+\+|\bcpp\b|std::|iostream)/i, language: 'C++', environment: 'Native C++', projectType: 'script' },
    { regex: /(c#|\bcsharp\b|\bdotnet\b|\.net\b)/i, language: 'C#', environment: '.NET', projectType: 'script' },
    { regex: /\b(\bc\b|gcc|clang|stdio\.h|linguagem c)\b/i, language: 'C', environment: 'Native C', projectType: 'script' },
    { regex: /\b(golang|\bgo\b|\.go\b)\b/i, language: 'Go', environment: 'Go Runtime', projectType: 'api' },
    { regex: /\b(rust|cargo|\.rs\b)\b/i, language: 'Rust', environment: 'Rust Cargo', projectType: 'script' },
    { regex: /\b(php|laravel|pdo|\.php\b)\b/i, language: 'PHP', environment: 'PHP Server', projectType: 'web' },
    { regex: /\b(ruby|rails|\.rb\b)\b/i, language: 'Ruby', environment: 'Ruby Runtime', projectType: 'script' },
    { regex: /\b(swift|swiftui|ios|\.swift\b)\b/i, language: 'Swift', environment: 'Apple iOS/macOS', projectType: 'script' },
    { regex: /\b(dart|flutter|\.dart\b)\b/i, language: 'Dart', environment: 'Flutter / Dart', projectType: 'script' },
    { regex: /\b(linguagem r|rstats|ggplot2|dataframe|cran|\.r\b)\b/i, language: 'R', environment: 'R Runtime', projectType: 'script' },
    { regex: /\b(perl|\.pl\b)\b/i, language: 'Perl', environment: 'Perl Runtime', projectType: 'script' },
    { regex: /\b(scala|akka|\.scala\b)\b/i, language: 'Scala', environment: 'JVM Scala', projectType: 'script' },
    { regex: /\b(haskell|ghci|cabal|\.hs\b)\b/i, language: 'Haskell', environment: 'GHC Haskell', projectType: 'script' },
    { regex: /\b(assembly|nasm|x86_64|x64|syscall|\.asm\b)\b/i, language: 'Assembly', environment: 'x86_64 Linux NASM', projectType: 'script' },
    { regex: /\b(powershell|\.ps1\b|cmdlet)\b/i, language: 'PowerShell', environment: 'PowerShell', projectType: 'script' },
    { regex: /\b(bash|\.sh\b)\b/i, language: 'Bash', environment: 'Linux Shell', projectType: 'script' },
    { regex: /\b(shell|shellscript)\b/i, language: 'Shell', environment: 'POSIX Shell', projectType: 'script' },
    { regex: /\b(graphql|gql)\b/i, language: 'GraphQL', environment: 'GraphQL API', projectType: 'api' },
    { regex: /\b(protobuf|proto3|\.proto\b|grpc)\b/i, language: 'Protobuf', environment: 'gRPC / Protobuf', projectType: 'api' },
    { regex: /\b(toml|cargo\.toml|pyproject\.toml)\b/i, language: 'TOML', environment: 'TOML Config', projectType: 'script' },
    { regex: /\b(yaml|yml|docker-compose|kubernetes)\b/i, language: 'YAML', environment: 'Config / CI', projectType: 'script' },
    { regex: /\b(xml|svg|plist)\b/i, language: 'XML', environment: 'Markup / Config', projectType: 'script' },
    { regex: /\b(json|schema json|package\.json)\b/i, language: 'JSON', environment: 'Data Schema', projectType: 'script' },
    { regex: /\b(markdown|readme|\.md\b)\b/i, language: 'Markdown', environment: 'Documentation', projectType: 'script' },
  ];

  for (const rule of rules) {
    if (rule.regex.test(lower)) {
      return {
        language: rule.language,
        environment: explicitEnvironment && explicitEnvironment !== 'Auto' ? explicitEnvironment : rule.environment,
        projectType: rule.projectType,
        ambiguous: false,
        confidence: 'high',
      };
    }
  }

  return {
    language: 'Python',
    environment: explicitEnvironment && explicitEnvironment !== 'Auto' ? explicitEnvironment : 'Python 3',
    projectType: 'script',
    ambiguous: true,
    confidence: 'low',
  };
}

export function normalizeLanguageName(lang?: string): string {
  const clean = (lang || 'TypeScript').trim().toLowerCase();
  const map: Record<string, string> = {
    py: 'Python',
    python: 'Python',
    python3: 'Python',
    js: 'JavaScript',
    javascript: 'JavaScript',
    node: 'JavaScript',
    ts: 'TypeScript',
    typescript: 'TypeScript',
    tsx: 'TSX',
    jsx: 'JSX',
    react: 'TSX',
    luau: 'Luau',
    roblox: 'Luau',
    lua: 'Lua',
    kt: 'Kotlin',
    kotlin: 'Kotlin',
    java: 'Java',
    c: 'C',
    'c++': 'C++',
    cpp: 'C++',
    'c#': 'C#',
    csharp: 'C#',
    go: 'Go',
    golang: 'Go',
    rs: 'Rust',
    rust: 'Rust',
    php: 'PHP',
    rb: 'Ruby',
    ruby: 'Ruby',
    swift: 'Swift',
    dart: 'Dart',
    r: 'R',
    pl: 'Perl',
    perl: 'Perl',
    scala: 'Scala',
    hs: 'Haskell',
    haskell: 'Haskell',
    asm: 'Assembly',
    assembly: 'Assembly',
    sql: 'SQL',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    vue: 'Vue',
    svelte: 'Svelte',
    sh: 'Shell',
    shell: 'Shell',
    bash: 'Bash',
    ps1: 'PowerShell',
    powershell: 'PowerShell',
    json: 'JSON',
    yml: 'YAML',
    yaml: 'YAML',
    toml: 'TOML',
    xml: 'XML',
    md: 'Markdown',
    markdown: 'Markdown',
    gql: 'GraphQL',
    graphql: 'GraphQL',
    proto: 'Protobuf',
    protobuf: 'Protobuf',
  };
  if (map[clean]) return map[clean];
  const exact = SUPPORTED_LANGUAGES.find((l) => l.toLowerCase() === clean);
  return exact || (lang || 'TypeScript').trim();
}

function inferEnvironmentFromLanguage(language: string, promptLower: string): string {
  switch (language) {
    case 'Luau':
      return 'Roblox';
    case 'Kotlin':
      return promptLower.includes('android') || promptLower.includes('apk') ? 'Android' : 'Android / JVM';
    case 'Python':
      return 'Python 3';
    case 'HTML':
    case 'CSS':
    case 'SCSS':
    case 'Vue':
    case 'Svelte':
      return 'Browser Web';
    case 'TSX':
    case 'JSX':
      return 'React / Browser';
    case 'TypeScript':
    case 'JavaScript':
      return promptLower.includes('browser') || promptLower.includes('dom') || promptLower.includes('web')
        ? 'Browser Web'
        : 'Node.js';
    case 'SQL':
      return 'SQLite / SQL';
    case 'C++':
      return 'Native C++';
    case 'C':
      return 'Native C';
    case 'C#':
      return '.NET';
    case 'Go':
      return 'Go Runtime';
    case 'Rust':
      return 'Rust Cargo';
    case 'PHP':
      return 'PHP Server';
    case 'Bash':
    case 'Shell':
      return 'Linux Shell';
    case 'JSON':
    case 'YAML':
    case 'TOML':
    case 'XML':
      return 'Data / Config';
    default:
      return `${language} Runtime`;
  }
}

function inferProjectType(language: string, env: string, promptLower: string): ProjectType {
  if (language === 'Luau') return 'luau';
  if (env === 'Android' || promptLower.includes('apk') || promptLower.includes('android')) return 'android';
  if (['HTML', 'CSS', 'SCSS', 'TSX', 'JSX', 'Vue', 'Svelte'].includes(language) || env === 'Browser Web') return 'web';
  if (promptLower.includes('api') || promptLower.includes('rest')) return 'api';
  if (promptLower.includes('fullstack')) return 'fullstack';
  return 'script';
}

const BANNED_STUB_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  { regex: /\bExecutionPayload\b/, reason: 'Detectada estrutura substituta proibida "ExecutionPayload".' },
  { regex: /\bfunction\s+runTask\s*\(/, reason: 'Detectada função substituta genérica "runTask()".' },
  { regex: /Processado:\s*\$\{input/, reason: 'Detectado placeholder genérico de processamento de texto.' },
  { regex: /\bTODO:\s*implement/i, reason: 'Detectado marcador TODO não implementado.' },
  { regex: /\bFIXME\b/i, reason: 'Detectado marcador FIXME pendente.' },
  { regex: /\/\/\s*\.\.\.\s*rest of/i, reason: 'Detectada omissão de código ("...rest of").' },
  { regex: /#\s*\.\.\.\s*rest of/i, reason: 'Detectada omissão de código ("...rest of").' },
  { regex: /--\s*\.\.\.\s*rest of/i, reason: 'Detectada omissão de código ("...rest of").' },
  { regex: /pass\s*#\s*placeholder/i, reason: 'Detectado placeholder Python "pass".' },
];

export function validateLanguageMatch(
  expectedLanguage: string,
  expectedEnvironment: string,
  files: GeneratedFileItem[],
): ValidatorResult {
  if (files.length === 0) {
    return {
      name: 'LanguageMatchValidator',
      executed: true,
      passed: false,
      severity: 'error',
      message: 'Nenhum arquivo gerado para validar linguagem.',
    };
  }

  const primary = files[0];
  const combined = files.map((f) => f.content).join('\n');
  const norm = normalizeLanguageName(expectedLanguage).toLowerCase();
  const details: string[] = [];

  if (norm === 'luau' || norm === 'lua') {
    const hasTsLeak =
      /\bexport\s+(interface|type|function|const)\b/.test(combined) ||
      /\bimport\s+.*\s+from\s+['"]/.test(combined) ||
      /\bconsole\.log\s*\(/.test(combined);
    const hasLuauTokens =
      /\blocal\s+[a-zA-Z_]/.test(combined) ||
      /\bfunction\b/.test(combined) ||
      /\bend\b/.test(combined);

    if (hasTsLeak) {
      details.push('Código contém sintaxe TypeScript/JavaScript em vez de Luau.');
    }
    if (!hasLuauTokens) {
      details.push('Código não apresenta construtos válidos de Luau/Lua (local, function, end).');
    }
    if (expectedEnvironment.toLowerCase().includes('roblox')) {
      const hasRobloxApi = /game:GetService|script\.Parent|Instance\.new|workspace|Players|RunService|UserInputService|ReplicatedStorage/i.test(
        combined,
      );
      if (!hasRobloxApi) {
        details.push('Ambiente Roblox especificado, mas nenhuma API Roblox padrão foi encontrada.');
      }
    }
  } else if (norm === 'python') {
    const hasJsLeak = /\bexport\s+(interface|function|const)\b/.test(combined) || /\bconsole\.log\s*\(/.test(combined);
    const hasPyTokens = /\bdef\s+\w+\s*\(|\bimport\s+\w+|\bfrom\s+\w+\s+import\b|\bclass\s+\w+|\bprint\s*\(/.test(combined);
    if (hasJsLeak) details.push('Detectado código JavaScript/TypeScript em solicitação Python.');
    if (!hasPyTokens) details.push('Não foram detectadas definições ou instruções Python válidas.');
  } else if (norm === 'kotlin') {
    const hasKotlin = /\b(package|fun|class|val|var|import|object|data\s+class)\b/.test(combined);
    if (!hasKotlin) details.push('Código Kotlin não contém declarações package/fun/class/val válidas.');
  } else if (norm === 'java') {
    const hasJava = /\b(public\s+class|class\s+\w+|public\s+static\s+void\s+main|package\s+[\w.]+;)\b/.test(combined);
    if (!hasJava) details.push('Código Java não contém classe ou assinatura Java válida.');
  } else if (norm === 'c++') {
    const hasCpp = /#include\s*<|std::|\bint\s+main\s*\(/.test(combined);
    if (!hasCpp) details.push('Código C++ não contém #include, std:: ou int main() válidos.');
  } else if (norm === 'c') {
    const hasC = /#include\s*<stdio\.h>|#include\s*<|\bint\s+main\s*\(/.test(combined);
    if (!hasC) details.push('Código C não contém #include ou int main() válidos.');
  } else if (norm === 'c#') {
    const hasCs = /\b(using\s+System|namespace\s+|class\s+\w+|static\s+void\s+Main)\b/.test(combined);
    if (!hasCs) details.push('Código C# não contém using/namespace/class válidos.');
  } else if (norm === 'go') {
    const hasGo = /\bpackage\s+\w+\b/.test(combined) && /\bfunc\s+\w+\s*\(/.test(combined);
    if (!hasGo) details.push('Código Go não contém package e func válidos.');
  } else if (norm === 'rust') {
    const hasRust = /\bfn\s+\w+\s*\(/.test(combined);
    if (!hasRust) details.push('Código Rust não contém declarações fn válidas.');
  } else if (norm === 'php') {
    const hasPhp = /<\?php|\$[a-zA-Z_]\w*\s*=|\bfunction\s+\w+\s*\(/.test(combined);
    if (!hasPhp) details.push('Código PHP não contém tag <?php ou construtos PHP válidos.');
  } else if (norm === 'ruby') {
    const hasRuby = /\bdef\s+\w+/.test(combined) && /\bend\b/.test(combined);
    if (!hasRuby) details.push('Código Ruby não contém blocos def ... end.');
  } else if (norm === 'swift') {
    const hasSwift = /\b(import\s+Foundation|import\s+SwiftUI|func\s+\w+|struct\s+\w+|let\s+\w+)\b/.test(combined);
    if (!hasSwift) details.push('Código Swift não contém declarações Swift válidas.');
  } else if (norm === 'dart') {
    const hasDart = /\b(void\s+main\s*\(|import\s+['"]dart:|import\s+['"]package:flutter|class\s+\w+)\b/.test(combined);
    if (!hasDart) details.push('Código Dart não contém void main() ou construtos Dart/Flutter válidos.');
  } else if (norm === 'r') {
    const hasR = /(<-|\bfunction\s*\(|\bprint\s*\(|\bsummary\s*\()/.test(combined);
    if (!hasR) details.push('Código R não contém atribuições ou funções R válidas.');
  } else if (norm === 'perl') {
    const hasPerl = /\b(use\s+strict|use\s+warnings|my\s+[$@%]|sub\s+\w+)\b/.test(combined);
    if (!hasPerl) details.push('Código Perl não contém use strict / my / sub válidos.');
  } else if (norm === 'scala') {
    const hasScala = /\b(object\s+\w+|case\s+class\s+\w+|def\s+\w+|@main)\b/.test(combined);
    if (!hasScala) details.push('Código Scala não contém object / case class / def.');
  } else if (norm === 'haskell') {
    const hasHs = /\b(module\s+|main\s*::|::\s*\w+\s*->|\bdata\s+\w+)\b/.test(combined);
    if (!hasHs) details.push('Código Haskell não contém assinaturas de tipo ou main :: IO ().');
  } else if (norm === 'assembly') {
    const hasAsm = /\b(section\s+\.\w+|global\s+_start|mov\s+|syscall|ret)\b/i.test(combined);
    if (!hasAsm) details.push('Código Assembly não contém seções ou instruções Assembly válidas.');
  } else if (norm === 'sql') {
    const hasSql = /\b(SELECT|CREATE\s+TABLE|INSERT\s+INTO|UPDATE|DELETE|WITH)\b/i.test(combined);
    if (!hasSql) details.push('Código SQL não contém comandos SQL válidos.');
  } else if (norm === 'html') {
    const hasHtml = /<!doctype html|<html|<body|<div|<main|<section/i.test(combined);
    if (!hasHtml) details.push('Projeto Web HTML não contém estrutura HTML válida.');
  } else if (norm === 'css' || norm === 'scss') {
    const hasCss = /[.#@a-zA-Z0-9:_-]+\s*\{[^}]*\}/.test(combined);
    if (!hasCss) details.push(`Arquivo ${expectedLanguage} não contém regras de estilo válidas.`);
  } else if (norm === 'vue') {
    const hasVue = /<template>[\s\S]*<\/template>/i.test(combined) && /<script/i.test(combined);
    if (!hasVue) details.push('Componente Vue deve conter blocos <template> e <script>.');
  } else if (norm === 'svelte') {
    const hasSvelte = /<script/i.test(combined) || /<[a-z]+[\s>]/.test(combined);
    if (!hasSvelte) details.push('Componente Svelte não possui marcação ou bloco <script>.');
  } else if (norm === 'tsx' || norm === 'jsx') {
    const hasReact = /(import\s+React|function\s+[A-Z]\w*|export\s+(default\s+)?function|return\s*\(\s*<|<[A-Za-z]+)/.test(combined);
    if (!hasReact) details.push(`Componente ${expectedLanguage} não contém JSX ou função de componente React.`);
  } else if (norm === 'javascript' || norm === 'typescript') {
    const hasPyLeak = /^\s*def\s+\w+\s*\(.*\):/m.test(combined);
    if (hasPyLeak) details.push('Detectada sintaxe Python em saída JavaScript/TypeScript.');
    if (norm === 'typescript' && !/\b(interface|type|function|const|let|class|export|import|:\s*(string|number|boolean|void|Promise|Record))\b/.test(combined)) {
      details.push('Código TypeScript não contém declarações JS/TS reconhecíveis.');
    }
  } else if (norm === 'bash' || norm === 'shell') {
    const hasSh = /^#!\/bin\/(ba)?sh|\becho\b|\bfunction\b|\bif\b|\bfi\b/m.test(combined);
    if (!hasSh) details.push('Script Shell/Bash não contém shebang ou instruções shell válidas.');
  } else if (norm === 'powershell') {
    const hasPs = /\$(?:[a-zA-Z_]\w*)|function\s+[A-Za-z-]+|Write-Output|param\s*\(/i.test(combined);
    if (!hasPs) details.push('Script PowerShell não contém variáveis ou cmdlets PowerShell.');
  } else if (norm === 'json') {
    try {
      JSON.parse(primary.content);
    } catch {
      details.push('Saída JSON não é JSON sintaticamente válido.');
    }
  } else if (norm === 'yaml') {
    if (!/^[a-zA-Z0-9_"-]+\s*:/m.test(combined)) {
      details.push('Saída YAML não contém chaves chave:valor válidas.');
    }
  } else if (norm === 'toml') {
    if (!/(\[[a-zA-Z0-9_.-]+\]|^[a-zA-Z0-9_-]+\s*=)/m.test(combined)) {
      details.push('Saída TOML não contém seções [table] ou pares chave = valor.');
    }
  } else if (norm === 'xml') {
    if (!/<[a-zA-Z_][\w:-]*[\s>]/.test(combined)) {
      details.push('Saída XML não contém tags XML válidas.');
    }
  } else if (norm === 'graphql') {
    if (!/\b(type|query|mutation|input|schema|enum)\s+\w+/i.test(combined)) {
      details.push('Schema GraphQL não contém definições type/query/mutation.');
    }
  } else if (norm === 'protobuf') {
    if (!/syntax\s*=\s*["']proto[23]["']\s*;|\bmessage\s+\w+\s*\{/.test(combined)) {
      details.push('Arquivo Protobuf não contém syntax = "proto3" ou message.');
    }
  } else if (norm === 'markdown') {
    if (!/^#\s+.+/m.test(combined)) {
      details.push('Documento Markdown deve conter ao menos um cabeçalho #.');
    }
  }

  return {
    name: 'LanguageMatchValidator',
    executed: true,
    passed: details.length === 0,
    severity: details.length === 0 ? 'pass' : 'error',
    message:
      details.length === 0
        ? `Linguagem validada: ${expectedLanguage} (${expectedEnvironment}).`
        : `Falha de correspondência para ${expectedLanguage}.`,
    details,
  };
}

export function validateRequirementMatch(
  prompt: string,
  files: GeneratedFileItem[],
): ValidatorResult {
  const lower = prompt.toLowerCase();
  const combined = files.map((f) => f.content).join('\n');
  const details: string[] = [];

  if (/\bfly\b|\bvoo\b|\bvoar\b/i.test(lower)) {
    const hasFlightMechanics =
      /LinearVelocity|BodyVelocity|BodyGyro|AlignOrientation|VectorForce|Humanoid|AssemblyLinearVelocity|Camera\.CFrame/i.test(
        combined,
      );
    const hasInputOrLoop = /UserInputService|RunService|RenderStepped|Heartbeat|ContextActionService/i.test(combined);
    if (!hasFlightMechanics) {
      details.push('Script de voo não implementa física/velocidade real de movimento (ex: LinearVelocity/BodyVelocity/AssemblyLinearVelocity).');
    }
    if (!hasInputOrLoop) {
      details.push('Script de voo não conecta controles de entrada ou loop de atualização (UserInputService/RunService).');
    }
  }

  if (/\bcalculadora\b|\bcalculator\b/i.test(lower)) {
    const hasOps = /(\+|\-|\*|\/)/.test(combined) && /(def|function|match|if|elif|switch|add|subtract|multiply|divide|soma|divis)/i.test(combined);
    const hasErrorHandling = /(ZeroDivisionError|try|except|catch|throw|ValueError|NaN|isFinite)/i.test(combined);
    if (!hasOps) details.push('Calculadora não implementa operações matemáticas reais.');
    if (!hasErrorHandling) details.push('Calculadora não trata erros como divisão por zero ou entrada inválida.');
  }

  if (/\bandroid\b|\bapk\b/i.test(lower)) {
    const hasMainActivity = files.some((f) => f.path.endsWith('MainActivity.kt') || f.path.endsWith('MainActivity.java'));
    if (!hasMainActivity) {
      details.push('Projeto Android não possui MainActivity implementada.');
    }
  }

  return {
    name: 'RequirementMatchValidator',
    executed: true,
    passed: details.length === 0,
    severity: details.length === 0 ? 'pass' : 'error',
    message:
      details.length === 0
        ? 'Implementação atende aos requisitos funcionais identificados.'
        : 'Requisitos funcionais incompletos no código gerado.',
    details,
  };
}

export function validateCodeCompleteness(files: GeneratedFileItem[]): ValidatorResult {
  const details: string[] = [];

  for (const file of files) {
    const trimmed = file.content.trim();
    if (trimmed.length < 25) {
      details.push(`Arquivo "${file.path}" está vazio ou excessivamente curto (${trimmed.length} caracteres).`);
    }
    for (const banned of BANNED_STUB_PATTERNS) {
      if (banned.regex.test(file.content)) {
        details.push(`[${file.path}] ${banned.reason}`);
      }
    }
    if (/fun\s+onCreate\s*\([^)]*\)\s*\{\s*(super\.onCreate\([^)]*\)\s*)?\}/s.test(file.content)) {
      details.push(`[${file.path}] MainActivity.onCreate() está vazia (sem interface ou comportamento real).`);
    }
  }

  return {
    name: 'CodeCompletenessValidator',
    executed: true,
    passed: details.length === 0,
    severity: details.length === 0 ? 'pass' : 'error',
    message:
      details.length === 0
        ? 'Nenhuma função vazia, stub genérico ou placeholder detectado.'
        : 'Detectados stubs, omissões ou funções vazias.',
    details,
  };
}

export function validateSingleFile(
  singleFileRequired: boolean,
  files: GeneratedFileItem[],
): ValidatorResult {
  if (!singleFileRequired) {
    return {
      name: 'SingleFileValidator',
      executed: true,
      passed: true,
      severity: 'pass',
      message: 'Modo multi-arquivo ativo; consolidação em arquivo único não exigida.',
    };
  }

  const details: string[] = [];
  if (files.length !== 1) {
    details.push(`Single-File Mode exigia exatamente 1 arquivo, mas foram gerados ${files.length}.`);
  }

  const file = files[0];
  if (file) {
    if (/require\s*\(\s*script\.Parent|from\s+['"]\.\.?\/|import\s+['"]\.\.?\//.test(file.content)) {
      details.push('Código em arquivo único referencia módulos externos locais (./, ../ ou script.Parent).');
    }
    if (file.content.trim().length < 60) {
      details.push('Arquivo único não possui implementação substancial completa.');
    }
  }

  return {
    name: 'SingleFileValidator',
    executed: true,
    passed: details.length === 0,
    severity: details.length === 0 ? 'pass' : 'error',
    message:
      details.length === 0
        ? 'Código consolidado em um único arquivo auto-contido sem dependências internas quebradas.'
        : 'Violação de integridade do Single-File Mode.',
    details,
  };
}

export function validateProjectCompleteness(
  projectType: ProjectType,
  singleFileRequired: boolean,
  prompt: string,
  files: GeneratedFileItem[],
): ValidatorResult {
  if (singleFileRequired) {
    return {
      name: 'ProjectCompletenessValidator',
      executed: true,
      passed: true,
      severity: 'pass',
      message: 'Projeto validado em modo arquivo único.',
    };
  }

  const details: string[] = [];
  const paths = files.map((f) => f.path.toLowerCase());

  if (projectType === 'android') {
    const requiredChecks = [
      { check: paths.some((p) => p.endsWith('androidmanifest.xml')), label: 'AndroidManifest.xml' },
      { check: paths.some((p) => p.endsWith('build.gradle.kts') || p.endsWith('build.gradle')), label: 'build.gradle.kts' },
      { check: paths.some((p) => p.endsWith('mainactivity.kt') || p.endsWith('mainactivity.java')), label: 'MainActivity.kt' },
      { check: paths.some((p) => p.endsWith('strings.xml') || p.endsWith('.xml')), label: 'Recursos XML (strings.xml / layout)' },
      { check: paths.some((p) => p.endsWith('readme.md')), label: 'README.md' },
    ];
    for (const req of requiredChecks) {
      if (!req.check) details.push(`Arquivo essencial Android ausente: ${req.label}.`);
    }

    const mainAct = files.find((f) => f.path.toLowerCase().endsWith('mainactivity.kt'));
    if (mainAct && !/setContent|setContentView|ComponentActivity|AppCompatActivity/.test(mainAct.content)) {
      details.push('MainActivity.kt não inicializa interface real (setContent / setContentView).');
    }
  }

  if (projectType === 'web') {
    const hasHtml = paths.some((p) => p.endsWith('.html'));
    if (!hasHtml) details.push('Projeto Web não possui arquivo .html.');
  }

  const readme = files.find((f) => f.path.toLowerCase().endsWith('readme.md'));
  if (readme && prompt.trim().length > 20 && readme.content.trim() === prompt.trim()) {
    details.push('README.md apenas repete o prompt original sem documentação real.');
  }

  return {
    name: 'ProjectCompletenessValidator',
    executed: true,
    passed: details.length === 0,
    severity: details.length === 0 ? 'pass' : 'error',
    message:
      details.length === 0
        ? `Estrutura completa verificada (${files.length} arquivos implementados).`
        : 'Projeto multi-arquivo incompleto.',
    details,
  };
}

export function validateDependencies(files: GeneratedFileItem[]): ValidatorResult {
  const details: string[] = [];
  const filePaths = new Set(files.map((f) => f.path.replace(/^\.\//, '')));

  for (const file of files) {
    const relImports = [...file.content.matchAll(/from\s+['"](\.[^'"]+)['"]/g)];
    for (const match of relImports) {
      const imp = match[1];
      const baseDir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
      const resolved = normalizeRelativePath(baseDir, imp);
      const candidates = [
        resolved,
        `${resolved}.ts`,
        `${resolved}.tsx`,
        `${resolved}.js`,
        `${resolved}.jsx`,
        `${resolved}/index.ts`,
        `${resolved}/index.js`,
      ];
      if (!candidates.some((c) => filePaths.has(c))) {
        details.push(`[${file.path}] Import relativo aponta para arquivo inexistente: "${imp}".`);
      }
    }
  }

  return {
    name: 'DependencyValidator',
    executed: true,
    passed: details.length === 0,
    severity: details.length === 0 ? 'pass' : 'error',
    message:
      details.length === 0
        ? 'Dependências e referências internas consistentes.'
        : 'Referências ou dependências quebradas detectadas.',
    details,
  };
}

function normalizeRelativePath(baseDir: string, rel: string): string {
  const parts = baseDir ? baseDir.split('/') : [];
  for (const seg of rel.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

export function validateSyntaxStatic(files: GeneratedFileItem[]): ValidatorResult {
  const details: string[] = [];

  for (const file of files) {
    const ext = file.path.split('.').pop()?.toLowerCase() ?? '';
    const lang = normalizeLanguageName(file.language).toLowerCase();

    if (lang === 'json' || ext === 'json') {
      try {
        JSON.parse(file.content);
      } catch (err) {
        details.push(`[${file.path}] JSON inválido: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (lang === 'luau' || lang === 'lua' || ext === 'luau' || ext === 'lua') {
      const cleaned = file.content
        .replace(/--\[\[[\s\S]*?\]\]/g, '')
        .replace(/--.*$/gm, '')
        .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\[\[[\s\S]*?\]\]/g, '""');
      const openers = (cleaned.match(/\b(function|if|for|while|repeat)\b/g) || []).length;
      const closers = (cleaned.match(/\b(end|until)\b/g) || []).length;
      if (Math.abs(openers - closers) > 1) {
        details.push(`[${file.path}] Possível desbalanceamento de blocos Luau (aberturas: ${openers}, fechamentos: ${closers}).`);
      }
    }

    // Balanced braces/parens check for brace languages
    if (
      [
        'javascript',
        'typescript',
        'tsx',
        'jsx',
        'kotlin',
        'java',
        'c',
        'c++',
        'c#',
        'go',
        'rust',
        'css',
        'scss',
        'php',
        'swift',
        'dart',
        'scala',
        'graphql',
        'protobuf',
        'perl',
      ].includes(lang)
    ) {
      const braceError = checkBalancedDelimiters(file.content, lang);
      if (braceError) {
        details.push(`[${file.path}] ${braceError}`);
      }
    }

    if (lang === 'python' || ext === 'py') {
      const pyCleaned = file.content
        .replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '""')
        .replace(/#.*$/gm, '')
        .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
      let paren = 0;
      let bracket = 0;
      for (const ch of pyCleaned) {
        if (ch === '(') paren++;
        else if (ch === ')') paren--;
        else if (ch === '[') bracket++;
        else if (ch === ']') bracket--;
        if (paren < 0 || bracket < 0) {
          details.push(`[${file.path}] Parêntese ou colchete de fechamento inesperado em Python.`);
          break;
        }
      }
      if (paren !== 0 || bracket !== 0) {
        details.push(`[${file.path}] Parênteses/colchetes Python desbalanceados ((:${paren}, [:${bracket}).`);
      }
    }

    if (lang === 'bash' || lang === 'shell' || ext === 'sh') {
      const cleaned = file.content.replace(/^\s*#.*$/gm, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
      const ifs = (cleaned.match(/\bif\b/g) || []).length;
      const fis = (cleaned.match(/\bfi\b/g) || []).length;
      if (ifs !== fis) {
        details.push(`[${file.path}] Blocos if/fi Bash desbalanceados (if: ${ifs}, fi: ${fis}).`);
      }
    }

    if (lang === 'yaml' || ext === 'yml' || ext === 'yaml') {
      if (/\t/.test(file.content)) {
        details.push(`[${file.path}] YAML contém tabulação (\t), utilize espaços.`);
      }
    }

    if (lang === 'xml' || ext === 'xml') {
      const xmlClean = file.content.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
      const openTags = (xmlClean.match(/<([a-zA-Z0-9_:-]+)(?=[\s>])(?![^>]*\/>)/g) || []).length;
      const closeTags = (xmlClean.match(/<\/([a-zA-Z0-9_:-]+)>/g) || []).length;
      if (openTags !== closeTags) {
        details.push(`[${file.path}] Tags XML desbalanceadas (abertas: ${openTags}, fechadas: ${closeTags}).`);
      }
    }
  }

  return {
    name: 'SyntaxValidator',
    executed: true,
    passed: details.length === 0,
    severity: details.length === 0 ? 'pass' : 'error',
    message:
      details.length === 0
        ? 'Verificação sintática estática aprovada.'
        : 'Erros sintáticos ou estruturais detectados.',
    details,
  };
}

function checkBalancedDelimiters(code: string, lang = ''): string | null {
  let cleaned = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  if (lang === 'php' || lang === 'perl') {
    cleaned = cleaned.replace(/^\s*#.*$/gm, '');
  }
  const stripped = cleaned.replace(/`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
  let curly = 0;
  let paren = 0;
  let bracket = 0;
  for (const ch of stripped) {
    if (ch === '{') curly++;
    else if (ch === '}') curly--;
    else if (ch === '(') paren++;
    else if (ch === ')') paren--;
    else if (ch === '[') bracket++;
    else if (ch === ']') bracket--;
    if (curly < 0 || paren < 0 || bracket < 0) {
      return 'Delimitador de fechamento inesperado ({, (, [).';
    }
  }
  if (curly !== 0 || paren !== 0 || bracket !== 0) {
    return `Delimitadores desbalanceados (chaves: ${curly}, parênteses: ${paren}, colchetes: ${bracket}).`;
  }
  return null;
}

export function computeFinalDelivery(
  validators: ValidatorResult[],
): { status: TaskState; summaryValidator: ValidatorResult } {
  const hardFailures = validators.filter((v) => !v.passed && v.severity === 'error');
  const blocked = validators.filter((v) => v.severity === 'blocked');

  if (hardFailures.length > 0) {
    const summaryValidator: ValidatorResult = {
      name: 'FinalDeliveryValidator',
      executed: true,
      passed: false,
      severity: 'error',
      message: `${hardFailures.length} validador(es) reprovado(s). Correção necessária antes da entrega.`,
      details: hardFailures.map((f) => `${f.name}: ${f.message}`),
    };
    return { status: 'NEEDS_CORRECTION', summaryValidator };
  }

  if (blocked.length > 0) {
    const summaryValidator: ValidatorResult = {
      name: 'FinalDeliveryValidator',
      executed: true,
      passed: true,
      severity: 'warning',
      message: 'Código validado estaticamente, com etapas de compilação/runtime externo sinalizadas como pendentes de infraestrutura.',
      details: blocked.map((b) => `${b.name}: ${b.message}`),
    };
    return { status: 'COMPLETED', summaryValidator };
  }

  return {
    status: 'COMPLETED',
    summaryValidator: {
      name: 'FinalDeliveryValidator',
      executed: true,
      passed: true,
      severity: 'pass',
      message: 'Todos os validadores aplicáveis aprovados com evidência verificável.',
    },
  };
}
