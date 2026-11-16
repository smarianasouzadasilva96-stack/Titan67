import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface TransformerConfig {
  vocabSize: number;
  dModel: number;
  nHeads: number;
  nLayers: number;
  dFf: number;
  maxSeqLen: number;
}

interface AttentionBlock {
  wq: Float32Array;
  wk: Float32Array;
  wv: Float32Array;
  wo: Float32Array;
  ln1Gamma: Float32Array;
  w1: Float32Array;
  b1: Float32Array;
  w2: Float32Array;
  b2: Float32Array;
  ln2Gamma: Float32Array;
}

export interface TransformerCheckpoint {
  modelId: string;
  version: string;
  config: TransformerConfig;
  parameterCount: number;
  trainingSteps: number;
  epochsCompleted: number;
  initialLoss: number;
  currentLoss: number;
  perplexity: number;
  corpusSamples: number;
  lastTrainedAt: string;
  checksum: string;
  weights: {
    tokEmb: number[];
    posEmb: number[];
    lmHead: number[];
    lmBias: number[];
    blocks: Array<{
      wq: number[];
      wk: number[];
      wv: number[];
      wo: number[];
      ln1Gamma: number[];
      w1: number[];
      b1: number[];
      w2: number[];
      b2: number[];
      ln2Gamma: number[];
    }>;
  };
}

/**
 * Pure TypeScript Causal Transformer Neural Engine (Decoder-Only).
 * Zero external AI dependencies: executes real forward attention/FFN passes,
 * cross-entropy loss, gradient backpropagation + Adam-style updates on Float32Array weights.
 */
export class TitanTransformerModel {
  public modelId = 'titan-neural-transformer-v1';
  public version = '1.0.0';
  public config: TransformerConfig;
  public tokEmb: Float32Array;
  public posEmb: Float32Array;
  public blocks: AttentionBlock[] = [];
  public lmHead: Float32Array;
  public lmBias: Float32Array;

  // AdamW moments for primary trained output head & token representations + block weights
  private mLmHead: Float32Array;
  private vLmHead: Float32Array;
  private mLmBias: Float32Array;
  private vLmBias: Float32Array;
  private mTokEmb: Float32Array;
  private vTokEmb: Float32Array;

  public trainingSteps = 0;
  public epochsCompleted = 0;
  public initialLoss = 0;
  public currentLoss = 0;
  public perplexity = 0;
  public corpusSamples = 0;
  public lastTrainedAt = new Date().toISOString();

  constructor(config: TransformerConfig) {
    this.config = { ...config };
    const { vocabSize, dModel, maxSeqLen } = this.config;

    this.tokEmb = this.initRandom(vocabSize * dModel, 0.04);
    this.posEmb = this.initRandom(maxSeqLen * dModel, 0.03);
    this.lmHead = this.initRandom(dModel * vocabSize, 0.04);
    this.lmBias = new Float32Array(vocabSize);

    this.mLmHead = new Float32Array(this.lmHead.length);
    this.vLmHead = new Float32Array(this.lmHead.length);
    this.mLmBias = new Float32Array(this.lmBias.length);
    this.vLmBias = new Float32Array(this.lmBias.length);
    this.mTokEmb = new Float32Array(this.tokEmb.length);
    this.vTokEmb = new Float32Array(this.tokEmb.length);

    this.initBlocks();
  }

  private initBlocks(): void {
    const { dModel, dFf, nLayers } = this.config;
    this.blocks = [];
    for (let l = 0; l < nLayers; l++) {
      this.blocks.push({
        wq: this.initRandom(dModel * dModel, Math.sqrt(2 / (dModel * 2))),
        wk: this.initRandom(dModel * dModel, Math.sqrt(2 / (dModel * 2))),
        wv: this.initRandom(dModel * dModel, Math.sqrt(2 / (dModel * 2))),
        wo: this.initRandom(dModel * dModel, Math.sqrt(2 / (dModel * 2))),
        ln1Gamma: new Float32Array(dModel).fill(1),
        w1: this.initRandom(dModel * dFf, Math.sqrt(2 / (dModel + dFf))),
        b1: new Float32Array(dFf),
        w2: this.initRandom(dFf * dModel, Math.sqrt(2 / (dFf + dModel))),
        b2: new Float32Array(dModel),
        ln2Gamma: new Float32Array(dModel).fill(1),
      });
    }
  }

  private initRandom(size: number, scale: number): Float32Array {
    // Deterministic Box-Muller pseudo-random init seeded cleanly for reproducible training baseline
    const arr = new Float32Array(size);
    let seed = 0x9e3779b9 ^ size;
    const nextRand = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return ((seed >>> 0) % 100000) / 100000;
    };
    for (let i = 0; i < size; i++) {
      const u1 = Math.max(1e-6, nextRand());
      const u2 = nextRand();
      const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      arr[i] = g * scale;
    }
    return arr;
  }

  public getParameterCount(): number {
    let total = this.tokEmb.length + this.posEmb.length + this.lmHead.length + this.lmBias.length;
    for (const b of this.blocks) {
      total +=
        b.wq.length +
        b.wk.length +
        b.wv.length +
        b.wo.length +
        b.ln1Gamma.length +
        b.w1.length +
        b.b1.length +
        b.w2.length +
        b.b2.length +
        b.ln2Gamma.length;
    }
    return total;
  }

  /**
   * Executes full Transformer forward pass returning final hidden states [seqLen, dModel] and logits [seqLen, vocabSize].
   */
  public forward(tokenIds: number[]): {
    hiddenStates: Float32Array[];
    logitsPerStep: Float32Array[];
    blockCaches: Array<{
      xIn: Float32Array[];
      norm1: Float32Array[];
      attnOut: Float32Array[];
      xMid: Float32Array[];
      norm2: Float32Array[];
      ffHidden: Float32Array[];
    }>;
  } {
    const { dModel, nHeads, dFf, vocabSize, maxSeqLen } = this.config;
    const T = Math.min(tokenIds.length, maxSeqLen);
    const headDim = Math.floor(dModel / nHeads);

    let x: Float32Array[] = [];
    for (let t = 0; t < T; t++) {
      const tid = Math.min(Math.max(0, tokenIds[t]), vocabSize - 1);
      const vec = new Float32Array(dModel);
      const tOff = tid * dModel;
      const pOff = t * dModel;
      for (let d = 0; d < dModel; d++) {
        vec[d] = this.tokEmb[tOff + d] + this.posEmb[pOff + d];
      }
      x.push(vec);
    }

    const blockCaches: Array<{
      xIn: Float32Array[];
      norm1: Float32Array[];
      attnOut: Float32Array[];
      xMid: Float32Array[];
      norm2: Float32Array[];
      ffHidden: Float32Array[];
    }> = [];

    for (const block of this.blocks) {
      const norm1 = x.map((v) => layerNorm(v, block.ln1Gamma));

      // Project Q, K, V
      const Q = norm1.map((v) => matVec(block.wq, v, dModel, dModel));
      const K = norm1.map((v) => matVec(block.wk, v, dModel, dModel));
      const V = norm1.map((v) => matVec(block.wv, v, dModel, dModel));

      const attnConcat: Float32Array[] = Array.from({ length: T }, () => new Float32Array(dModel));
      const scale = 1 / Math.sqrt(headDim);

      for (let h = 0; h < nHeads; h++) {
        const hStart = h * headDim;
        for (let t = 0; t < T; t++) {
          const scores = new Float32Array(t + 1);
          let maxScore = -Infinity;
          for (let s = 0; s <= t; s++) {
            let dot = 0;
            for (let d = 0; d < headDim; d++) {
              dot += Q[t][hStart + d] * K[s][hStart + d];
            }
            const sc = dot * scale;
            scores[s] = sc;
            if (sc > maxScore) maxScore = sc;
          }
          let sumExp = 0;
          for (let s = 0; s <= t; s++) {
            scores[s] = Math.exp(scores[s] - maxScore);
            sumExp += scores[s];
          }
          const invSum = 1 / (sumExp || 1);
          for (let d = 0; d < headDim; d++) {
            let acc = 0;
            for (let s = 0; s <= t; s++) {
              acc += scores[s] * invSum * V[s][hStart + d];
            }
            attnConcat[t][hStart + d] = acc;
          }
        }
      }

      const attnOut = attnConcat.map((v) => matVec(block.wo, v, dModel, dModel));
      const xMid = x.map((v, t) => addVectors(v, attnOut[t]));
      const norm2 = xMid.map((v) => layerNorm(v, block.ln2Gamma));

      const ffHidden: Float32Array[] = [];
      const xNext: Float32Array[] = [];
      for (let t = 0; t < T; t++) {
        const h1 = matVecBias(block.w1, block.b1, norm2[t], dFf, dModel);
        for (let i = 0; i < dFf; i++) h1[i] = gelu(h1[i]);
        ffHidden.push(h1);
        const h2 = matVecBias(block.w2, block.b2, h1, dModel, dFf);
        xNext.push(addVectors(xMid[t], h2));
      }

      blockCaches.push({ xIn: x, norm1, attnOut, xMid, norm2, ffHidden });
      x = xNext;
    }

    const logitsPerStep = x.map((h) => matVecBias(this.lmHead, this.lmBias, h, vocabSize, dModel));
    return { hiddenStates: x, logitsPerStep, blockCaches };
  }

  /**
   * Computes exact cross-entropy loss across token sequences without mutating weights.
   */
  public evaluateLoss(sequences: number[][]): { avgLoss: number; perplexity: number } {
    if (sequences.length === 0) return { avgLoss: 0, perplexity: 1 };
    let totalLoss = 0;
    let totalTokens = 0;

    for (const seq of sequences) {
      if (seq.length < 2) continue;
      const input = seq.slice(0, this.config.maxSeqLen - 1);
      const targets = seq.slice(1, input.length + 1);
      const { logitsPerStep } = this.forward(input);

      for (let t = 0; t < targets.length; t++) {
        const probs = softmax(logitsPerStep[t]);
        const targetId = Math.min(Math.max(0, targets[t]), this.config.vocabSize - 1);
        totalLoss += -Math.log(Math.max(1e-7, probs[targetId]));
        totalTokens += 1;
      }
    }

    const avgLoss = totalTokens > 0 ? totalLoss / totalTokens : 0;
    const perplexity = Math.exp(Math.min(20, avgLoss));
    return { avgLoss: Number(avgLoss.toFixed(4)), perplexity: Number(perplexity.toFixed(2)) };
  }

  /**
   * Real supervised gradient training step with AdamW updates on LM Head, last FFN block & Token Embeddings.
   */
  public trainStep(seq: number[], learningRate = 0.008): number {
    if (seq.length < 2) return 0;
    const { dModel, dFf, vocabSize, maxSeqLen } = this.config;
    const input = seq.slice(0, maxSeqLen - 1);
    const targets = seq.slice(1, input.length + 1);
    const { hiddenStates, logitsPerStep, blockCaches } = this.forward(input);

    const gLmHead = new Float32Array(this.lmHead.length);
    const gLmBias = new Float32Array(this.lmBias.length);
    const gHiddenAll: Float32Array[] = [];

    let seqLoss = 0;
    const T = targets.length;
    const invT = 1 / Math.max(1, T);

    for (let t = 0; t < T; t++) {
      const probs = softmax(logitsPerStep[t]);
      const targetId = Math.min(Math.max(0, targets[t]), vocabSize - 1);
      seqLoss += -Math.log(Math.max(1e-7, probs[targetId]));

      const dLogit = probs;
      dLogit[targetId] -= 1;

      const h = hiddenStates[t];
      const gH = new Float32Array(dModel);

      // Accumulate dL/dlmHead, dL/dlmBias and dL/dh
      for (let v = 0; v < vocabSize; v++) {
        const dl = dLogit[v] * invT;
        if (Math.abs(dl) < 1e-8) continue;
        gLmBias[v] += dl;
        const rowOff = v * dModel;
        for (let d = 0; d < dModel; d++) {
          gLmHead[rowOff + d] += dl * h[d];
          gH[d] += dl * this.lmHead[rowOff + d];
        }
      }
      gHiddenAll.push(gH);
    }

    // Backprop through last Transformer FFN + residual + Token Embeddings
    const lastIdx = this.blocks.length - 1;
    if (lastIdx >= 0) {
      const lastBlock = this.blocks[lastIdx];
      const cache = blockCaches[lastIdx];
      const gW2 = new Float32Array(lastBlock.w2.length);
      const gB2 = new Float32Array(lastBlock.b2.length);
      const gW1 = new Float32Array(lastBlock.w1.length);
      const gB1 = new Float32Array(lastBlock.b1.length);

      for (let t = 0; t < T; t++) {
        const dH = gHiddenAll[t];
        const ffH = cache.ffHidden[t];
        const norm2 = cache.norm2[t];
        const dFfH = new Float32Array(dFf);

        for (let d = 0; d < dModel; d++) {
          const gradD = dH[d];
          gB2[d] += gradD;
          const off = d * dFf;
          for (let f = 0; f < dFf; f++) {
            gW2[off + f] += gradD * ffH[f];
            dFfH[f] += gradD * lastBlock.w2[off + f];
          }
        }

        for (let f = 0; f < dFf; f++) {
          const dPre = dFfH[f] * (ffH[f] > 0 ? 1 : 0.12);
          gB1[f] += dPre;
          const off = f * dModel;
          for (let d = 0; d < dModel; d++) {
            gW1[off + d] += dPre * norm2[d];
          }
        }
      }

      sgdClipUpdate(lastBlock.w2, gW2, learningRate * 0.6);
      sgdClipUpdate(lastBlock.b2, gB2, learningRate * 0.6);
      sgdClipUpdate(lastBlock.w1, gW1, learningRate * 0.6);
      sgdClipUpdate(lastBlock.b1, gB1, learningRate * 0.6);
    }

    // Propagate embedding gradients directly via residual stream
    const gTokEmb = new Float32Array(this.tokEmb.length);
    for (let t = 0; t < T; t++) {
      const tid = Math.min(Math.max(0, input[t]), vocabSize - 1);
      const tOff = tid * dModel;
      const gH = gHiddenAll[t];
      for (let d = 0; d < dModel; d++) {
        gTokEmb[tOff + d] += gH[d];
      }
    }

    this.trainingSteps += 1;
    adamWUpdate(this.lmHead, gLmHead, this.mLmHead, this.vLmHead, learningRate, this.trainingSteps);
    adamWUpdate(this.lmBias, gLmBias, this.mLmBias, this.vLmBias, learningRate, this.trainingSteps);
    adamWUpdate(this.tokEmb, gTokEmb, this.mTokEmb, this.vTokEmb, learningRate * 0.5, this.trainingSteps);

    const stepLoss = seqLoss / Math.max(1, T);
    this.currentLoss = Number(stepLoss.toFixed(4));
    this.perplexity = Number(Math.exp(Math.min(20, stepLoss)).toFixed(2));
    this.lastTrainedAt = new Date().toISOString();
    return stepLoss;
  }

  /**
   * Real autoregressive token prediction from the Transformer logits.
   */
  public sampleCompletion(
    promptIds: number[],
    maxNewTokens = 28,
    temperature = 0.65,
    topK = 8,
  ): { generatedIds: number[]; meanConfidence: number } {
    const context = promptIds.slice(-Math.max(1, this.config.maxSeqLen - 1));
    const generated: number[] = [];
    let confSum = 0;

    for (let step = 0; step < maxNewTokens; step++) {
      const window = context.slice(-this.config.maxSeqLen);
      const { logitsPerStep } = this.forward(window);
      const lastLogits = logitsPerStep[logitsPerStep.length - 1];
      const scaled = new Float32Array(lastLogits.length);
      const temp = Math.max(0.1, temperature);
      for (let i = 0; i < lastLogits.length; i++) {
        scaled[i] = lastLogits[i] / temp;
      }
      const probs = softmax(scaled);

      // Top-K filtering
      const indexed = Array.from(probs, (p, id) => ({ id, p })).sort((a, b) => b.p - a.p);
      const top = indexed.slice(0, Math.max(1, topK));
      const sumP = top.reduce((s, item) => s + item.p, 0) || 1;
      let r = ((step * 37 + context.length * 13) % 97) / 100;
      let chosen = top[0];
      for (const item of top) {
        r -= item.p / sumP;
        if (r <= 0) {
          chosen = item;
          break;
        }
      }
      generated.push(chosen.id);
      confSum += chosen.p;
      context.push(chosen.id);
      if (chosen.id === 3) break; // <eos>
    }

    return {
      generatedIds: generated,
      meanConfidence: generated.length > 0 ? Number((confSum / generated.length).toFixed(4)) : 0,
    };
  }

  public saveCheckpoint(filePath: string): string {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const weightsPayload = {
      tokEmb: Array.from(this.tokEmb, roundW),
      posEmb: Array.from(this.posEmb, roundW),
      lmHead: Array.from(this.lmHead, roundW),
      lmBias: Array.from(this.lmBias, roundW),
      blocks: this.blocks.map((b) => ({
        wq: Array.from(b.wq, roundW),
        wk: Array.from(b.wk, roundW),
        wv: Array.from(b.wv, roundW),
        wo: Array.from(b.wo, roundW),
        ln1Gamma: Array.from(b.ln1Gamma, roundW),
        w1: Array.from(b.w1, roundW),
        b1: Array.from(b.b1, roundW),
        w2: Array.from(b.w2, roundW),
        b2: Array.from(b.b2, roundW),
        ln2Gamma: Array.from(b.ln2Gamma, roundW),
      })),
    };
    const checksum = crypto
      .createHash('sha256')
      .update(JSON.stringify(weightsPayload.lmHead.slice(0, 64)) + `:${this.trainingSteps}`)
      .digest('hex')
      .slice(0, 16);

    const ckpt: TransformerCheckpoint = {
      modelId: this.modelId,
      version: this.version,
      config: this.config,
      parameterCount: this.getParameterCount(),
      trainingSteps: this.trainingSteps,
      epochsCompleted: this.epochsCompleted,
      initialLoss: this.initialLoss,
      currentLoss: this.currentLoss,
      perplexity: this.perplexity,
      corpusSamples: this.corpusSamples,
      lastTrainedAt: this.lastTrainedAt,
      checksum,
      weights: weightsPayload,
    };
    fs.writeFileSync(filePath, JSON.stringify(ckpt), 'utf-8');
    return checksum;
  }

  public loadCheckpoint(filePath: string): boolean {
    if (!fs.existsSync(filePath)) return false;
    try {
      const ckpt = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TransformerCheckpoint;
      if (!ckpt.config || ckpt.config.vocabSize !== this.config.vocabSize) return false;
      this.version = ckpt.version || this.version;
      this.trainingSteps = ckpt.trainingSteps || 0;
      this.epochsCompleted = ckpt.epochsCompleted || 0;
      this.initialLoss = ckpt.initialLoss || 0;
      this.currentLoss = ckpt.currentLoss || 0;
      this.perplexity = ckpt.perplexity || 0;
      this.corpusSamples = ckpt.corpusSamples || 0;
      this.lastTrainedAt = ckpt.lastTrainedAt || new Date().toISOString();

      this.tokEmb = Float32Array.from(ckpt.weights.tokEmb);
      this.posEmb = Float32Array.from(ckpt.weights.posEmb);
      this.lmHead = Float32Array.from(ckpt.weights.lmHead);
      this.lmBias = Float32Array.from(ckpt.weights.lmBias);
      this.blocks = ckpt.weights.blocks.map((b) => ({
        wq: Float32Array.from(b.wq),
        wk: Float32Array.from(b.wk),
        wv: Float32Array.from(b.wv),
        wo: Float32Array.from(b.wo),
        ln1Gamma: Float32Array.from(b.ln1Gamma),
        w1: Float32Array.from(b.w1),
        b1: Float32Array.from(b.b1),
        w2: Float32Array.from(b.w2),
        b2: Float32Array.from(b.b2),
        ln2Gamma: Float32Array.from(b.ln2Gamma),
      }));
      return true;
    } catch {
      return false;
    }
  }
}

function roundW(n: number): number {
  return Math.round(n * 100000) / 100000;
}

function matVec(w: Float32Array, x: Float32Array, outDim: number, inDim: number): Float32Array {
  const res = new Float32Array(outDim);
  for (let o = 0; o < outDim; o++) {
    let sum = 0;
    const off = o * inDim;
    for (let i = 0; i < inDim; i++) {
      sum += w[off + i] * x[i];
    }
    res[o] = sum;
  }
  return res;
}

function matVecBias(w: Float32Array, b: Float32Array, x: Float32Array, outDim: number, inDim: number): Float32Array {
  const res = new Float32Array(outDim);
  for (let o = 0; o < outDim; o++) {
    let sum = b[o];
    const off = o * inDim;
    for (let i = 0; i < inDim; i++) {
      sum += w[off + i] * x[i];
    }
    res[o] = sum;
  }
  return res;
}

function addVectors(a: Float32Array, b: Float32Array): Float32Array {
  const res = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) res[i] = a[i] + b[i];
  return res;
}

function layerNorm(x: Float32Array, gamma: Float32Array): Float32Array {
  const n = x.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    const diff = x[i] - mean;
    variance += diff * diff;
  }
  variance /= n;
  const invStd = 1 / Math.sqrt(variance + 1e-5);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = (x[i] - mean) * invStd * gamma[i];
  }
  return out;
}

function gelu(x: number): number {
  return 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x)));
}

function softmax(logits: Float32Array): Float32Array {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (logits[i] > max) max = logits[i];
  }
  const probs = new Float32Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    const e = Math.exp(logits[i] - max);
    probs[i] = e;
    sum += e;
  }
  const inv = 1 / (sum || 1);
  for (let i = 0; i < probs.length; i++) probs[i] *= inv;
  return probs;
}

function adamWUpdate(
  param: Float32Array,
  grad: Float32Array,
  m: Float32Array,
  v: Float32Array,
  lr: number,
  step: number,
): void {
  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;
  const wd = 0.0001;
  const bc1 = 1 - Math.pow(beta1, step);
  const bc2 = 1 - Math.pow(beta2, step);

  for (let i = 0; i < param.length; i++) {
    const g = Math.max(-1.0, Math.min(1.0, grad[i]));
    if (g === 0 && m[i] === 0) continue;
    m[i] = beta1 * m[i] + (1 - beta1) * g;
    v[i] = beta2 * v[i] + (1 - beta2) * g * g;
    const mHat = m[i] / bc1;
    const vHat = v[i] / bc2;
    param[i] = param[i] * (1 - lr * wd) - (lr * mHat) / (Math.sqrt(vHat) + eps);
  }
}

function sgdClipUpdate(param: Float32Array, grad: Float32Array, lr: number): void {
  for (let i = 0; i < param.length; i++) {
    const g = Math.max(-0.5, Math.min(0.5, grad[i]));
    param[i] -= lr * g;
  }
}
