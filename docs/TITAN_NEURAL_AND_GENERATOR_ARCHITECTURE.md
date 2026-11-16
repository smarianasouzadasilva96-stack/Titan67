# TITAN CODE — Arquitetura Neural Própria & Motor Universal de Código

## 1. Visão Geral (Zero Dependência de IAs Externas)
O núcleo de inteligência e geração de código do **TITAN CODE** opera de forma 100% independente no servidor Node.js/TypeScript, sem uso de APIs comerciais ou provedores externos (`OpenAI`, `Google Gemini`, `Anthropic`, `DeepSeek`, `Groq`, `OpenRouter`, `HuggingFace`).

## 2. Componentes do TITAN NEURAL CORE (`src/server/titanNeural/`)
1. **Tokenizer Engine (`tokenizer.ts`)**: Tokenizador léxico + BPE (Byte-Pair Encoding) treinado sobre o corpus de código com tokens especiais (`<pad>`, `<unk>`, `<bos>`, `<eos>`, `<code:start>`, `<code:end>`, `<lang:*>`), com persistência em `.titan-core-data/tokenizer.json`.
2. **Neural Engine (`transformerModel.ts`)**: Transformer Causal Decoder-Only implementado em TypeScript puro (`Float32Array`), com Embeddings de Token + Posicional, Multi-Head Causal Self-Attention, LayerNorm, FFN GELU residual, perda Cross-Entropy, backpropagation e otimizador AdamW, com checkpoints persistidos em `.titan-core-data/checkpoints/titan-core-v1.json`.
   - *Divulgação técnica honesta*: Trata-se de um modelo neural compacto executado em CPU para pontuação, representação e aprendizado controlado local, atuando em conjunto com o Memory Engine e o Language Adapter System.
3. **Memory & Controlled Learning Engine (`memoryEngine.ts`)**: Memória versionada persistida em `.titan-core-data/memory-store.json` contendo padrões validados, pares `erro -> solução` verificados, regras administrativas e histórico de avaliações, com política estrita de Aprendizado Controlado (somente conhecimento validado pode entrar ou atualizar pesos) e suporte completo a snapshots/rollback.
4. **Learning & Evaluation (`datasetAndTrainer.ts`)**: Treinamento supervisionado por épocas, cálculo real de loss/perplexidade antes e depois, e fine-tuning controlado de correções aprovadas.
5. **Context, Reasoning, Code Intelligence & Response Engine (`contextAndReasoning.ts`)**: Construção de contexto de Workspace/Admin, plano técnico, cálculo de Diff unificado e streaming SSE nativo.

## 3. Motor Universal de Código (`src/server/titanEngine/`)
- **Language Registry & Adapter System (`languageRegistry.ts`)**: Suporte a **39 linguagens** (gerais, web e dados/configuração), formatadores, extratores de símbolos e validadores idiomáticos.
- **Universal Code Generator & Repair (`universalGenerator.ts`)**: Pipeline determinístico e modular (`Planejar -> Gerar -> Validar -> Testar -> Diagnosticar -> Corrigir -> Revalidar -> Entregar`) além das transformações do **Script Studio 2.0**: Explicar, Corrigir Erros com Diff, Otimizar, Formatar e Converter entre linguagens.

## 4. Como Adicionar Uma Nova Linguagem ou Expandir o Treinamento
1. Adicione o nome oficial em `SUPPORTED_LANGUAGES` e regras de detecção/validação em `src/shared/titanValidators.ts`.
2. Registre o adaptador correspondente em `src/server/titanEngine/languageRegistry.ts`.
3. Adicione builders idiomáticos em `buildFilesForTarget()` (`src/server/titanEngine/universalGenerator.ts`) e exemplos supervisionados em `TITAN_TRAINING_CORPUS` (`src/server/titanNeural/datasetAndTrainer.ts`).
4. Execute `POST /api/titan/neural/train` (Admin) para retreinar o vocabulário e atualizar os pesos do checkpoint.
