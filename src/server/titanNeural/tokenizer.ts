import fs from 'fs';
import path from 'path';

export interface BpeMerge {
  left: string;
  right: string;
  merged: string;
}

export interface SerializedTokenizer {
  version: string;
  vocab: string[];
  merges: BpeMerge[];
  trainedOnSamples: number;
  createdAt: string;
}

export const SPECIAL_TOKENS = [
  '<pad>',
  '<unk>',
  '<bos>',
  '<eos>',
  '<code:start>',
  '<code:end>',
  '<newline>',
  '<indent>',
  '<lang:python>',
  '<lang:luau>',
  '<lang:typescript>',
  '<lang:javascript>',
  '<lang:kotlin>',
  '<lang:cpp>',
  '<lang:php>',
  '<lang:go>',
  '<lang:sql>',
  '<lang:json>',
  '<lang:html>',
  '<lang:rust>',
] as const;

const CODE_SEED_TOKENS = [
  'function', 'local', 'return', 'const', 'let', 'var', 'def', 'class', 'import', 'from', 'export',
  'interface', 'type', 'async', 'await', 'try', 'catch', 'except', 'raise', 'throw', 'if', 'else',
  'elif', 'for', 'while', 'end', 'then', 'do', 'package', 'main', 'func', 'struct', 'impl', 'pub',
  'fn', 'fun', 'val', 'public', 'private', 'void', 'int', 'string', 'bool', 'boolean', 'number',
  'SELECT', 'FROM', 'WHERE', 'CREATE', 'TABLE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'DELETE',
  'game:GetService', 'Players', 'RunService', 'UserInputService', 'LinearVelocity', 'AlignOrientation',
  'print', 'console.log', 'fmt.Println', 'std::cout', 'echo', 'json_encode', 'app.get', 'app.post',
  'assert', 'ZeroDivisionError', 'ValueError', 'Error', 'nil', 'null', 'None', 'true', 'false',
  '(', ')', '{', '}', '[', ']', ';', ':', ',', '.', '=', '==', '!=', '=>', '->', '::', '+', '-', '*', '/',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ' ', '  ', '    ',
];

export class TitanTokenizerEngine {
  public vocab: string[] = [];
  public tokenToId: Map<string, number> = new Map();
  public merges: BpeMerge[] = [];
  public trainedOnSamples = 0;
  public version = 'titan-bpe-v1';

  constructor() {
    this.resetBaseVocab();
  }

  private resetBaseVocab(): void {
    this.vocab = [];
    this.tokenToId.clear();
    for (const tok of SPECIAL_TOKENS) this.addToken(tok);
    for (const tok of CODE_SEED_TOKENS) this.addToken(tok);
    // Single ASCII printable characters as guaranteed fallback alphabet
    for (let code = 32; code <= 126; code++) {
      this.addToken(String.fromCharCode(code));
    }
    this.addToken('\n');
    this.addToken('\t');
  }

  private addToken(tok: string): void {
    if (!this.tokenToId.has(tok)) {
      this.tokenToId.set(tok, this.vocab.length);
      this.vocab.push(tok);
    }
  }

  public get padId(): number {
    return this.tokenToId.get('<pad>') ?? 0;
  }
  public get unkId(): number {
    return this.tokenToId.get('<unk>') ?? 1;
  }
  public get bosId(): number {
    return this.tokenToId.get('<bos>') ?? 2;
  }
  public get eosId(): number {
    return this.tokenToId.get('<eos>') ?? 3;
  }

  /**
   * Code-aware pre-tokenization preserving identifiers, operators, whitespace/newlines, and special tags.
   */
  public preTokenize(text: string): string[] {
    const pattern = /<lang:[a-z0-9+_-]+>|<code:start>|<code:end>|<bos>|<eos>|<pad>|<newline>|<indent>|[A-Za-z_][A-Za-z0-9_:]*|[0-9]+(?:\.[0-9]+)?|=>|->|::|==|!=|<=|>=|\r?\n|[ \t]+|[^\sA-Za-z0-9_]/g;
    const matches = text.match(pattern);
    return matches ? matches : [];
  }

  /**
   * Real BPE merge training over corpus texts up to targetVocabSize.
   */
  public trainVocabulary(texts: string[], targetVocabSize = 640): void {
    this.resetBaseVocab();
    this.merges = [];
    this.trainedOnSamples = texts.length;

    const wordFreq = new Map<string, number>();
    for (const text of texts) {
      const pieces = this.preTokenize(text);
      for (const piece of pieces) {
        if (this.tokenToId.has(piece)) {
          wordFreq.set(piece, (wordFreq.get(piece) || 0) + 1);
          continue;
        }
        if (/^[A-Za-z_][A-Za-z0-9_]{1,24}$/.test(piece)) {
          wordFreq.set(piece, (wordFreq.get(piece) || 0) + 1);
        }
      }
    }

    // First register frequent code identifiers directly so compact Transformer covers full syntax keywords
    const sortedWords = [...wordFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(0, Math.floor((targetVocabSize - this.vocab.length) * 0.65)));

    for (const [w] of sortedWords) {
      if (this.vocab.length >= targetVocabSize) break;
      this.addToken(w);
    }

    // Next perform BPE pair merges on remaining subword sequences
    let sequences: string[][] = texts.slice(0, 80).map((t) =>
      this.preTokenize(t).flatMap((p) => (this.tokenToId.has(p) ? [p] : [...p])),
    );

    while (this.vocab.length < targetVocabSize) {
      const pairCounts = new Map<string, number>();
      for (const seq of sequences) {
        for (let i = 0; i < seq.length - 1; i++) {
          const a = seq[i];
          const b = seq[i + 1];
          if (a.includes('<') || b.includes('<') || a === '\n' || b === '\n') continue;
          const key = `${a}\u0000${b}`;
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
      }

      let bestKey = '';
      let bestCount = 1;
      for (const [k, count] of pairCounts.entries()) {
        if (count > bestCount) {
          bestCount = count;
          bestKey = k;
        }
      }
      if (!bestKey) break;

      const [left, right] = bestKey.split('\u0000');
      const merged = `${left}${right}`;
      this.merges.push({ left, right, merged });
      this.addToken(merged);

      sequences = sequences.map((seq) => {
        const next: string[] = [];
        for (let i = 0; i < seq.length; i++) {
          if (i < seq.length - 1 && seq[i] === left && seq[i + 1] === right) {
            next.push(merged);
            i += 1;
          } else {
            next.push(seq[i]);
          }
        }
        return next;
      });
    }
  }

  public encode(text: string, addSpecialBounds = false): number[] {
    const ids: number[] = [];
    if (addSpecialBounds) ids.push(this.bosId);

    const rawPieces = this.preTokenize(text);
    for (const piece of rawPieces) {
      const normalized = piece === '\r\n' ? '\n' : piece;
      const directId = this.tokenToId.get(normalized);
      if (directId !== undefined) {
        ids.push(directId);
        continue;
      }

      // Break unknown multi-char piece into chars then apply learned BPE merges
      let sub = [...normalized];
      for (const m of this.merges) {
        const next: string[] = [];
        for (let i = 0; i < sub.length; i++) {
          if (i < sub.length - 1 && sub[i] === m.left && sub[i + 1] === m.right) {
            next.push(m.merged);
            i += 1;
          } else {
            next.push(sub[i]);
          }
        }
        sub = next;
      }

      for (const s of sub) {
        ids.push(this.tokenToId.get(s) ?? this.unkId);
      }
    }

    if (addSpecialBounds) ids.push(this.eosId);
    return ids;
  }

  public decode(ids: number[], skipSpecial = true): string {
    const parts: string[] = [];
    for (const id of ids) {
      const tok = this.vocab[id];
      if (!tok) continue;
      if (skipSpecial && (tok === '<pad>' || tok === '<bos>' || tok === '<eos>')) continue;
      if (tok === '<newline>') {
        parts.push('\n');
        continue;
      }
      if (tok === '<indent>') {
        parts.push('  ');
        continue;
      }
      if (skipSpecial && tok.startsWith('<lang:')) continue;
      if (skipSpecial && (tok === '<code:start>' || tok === '<code:end>')) continue;
      parts.push(tok);
    }
    return parts.join('');
  }

  public saveToFile(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const payload: SerializedTokenizer = {
      version: this.version,
      vocab: this.vocab,
      merges: this.merges,
      trainedOnSamples: this.trainedOnSamples,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  public loadFromFile(filePath: string): boolean {
    if (!fs.existsSync(filePath)) return false;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SerializedTokenizer;
      if (!Array.isArray(raw.vocab) || raw.vocab.length < 20) return false;
      this.version = raw.version || 'titan-bpe-v1';
      this.vocab = raw.vocab;
      this.merges = Array.isArray(raw.merges) ? raw.merges : [];
      this.trainedOnSamples = raw.trainedOnSamples || 0;
      this.tokenToId.clear();
      this.vocab.forEach((tok, idx) => this.tokenToId.set(tok, idx));
      return true;
    } catch {
      return false;
    }
  }
}
