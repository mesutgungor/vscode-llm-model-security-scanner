import * as vscode from 'vscode';
import { ModelScanSummary } from './models';
import { ScannerBridge } from './scannerBridge';

export interface DetectedRemoteModel {
  modelId: string;
  range: vscode.Range;
  line: number;
}

export class RemoteModelDetector {
  private cache: Map<string, ModelScanSummary> = new Map();
  private inFlightScans: Map<string, Promise<ModelScanSummary>> = new Map();

  // Pattern matches from_pretrained("org/model"), model="org/model", or SentenceTransformer("org/model")
  private readonly modelRegex =
    /(?:from_pretrained\s*\(\s*(?:pretrained_model_name_or_path\s*=\s*)?["'](?<m1>[a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.]+|[a-zA-Z0-9_\-]+)["']|model\s*=\s*["'](?<m2>[a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.]+)["']|SentenceTransformer\s*\(\s*["'](?<m3>[a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.]+)["'])/g;

  /**
   * Scans document text to extract all Hugging Face model references.
   */
  public detectModels(document: vscode.TextDocument): DetectedRemoteModel[] {
    const results: DetectedRemoteModel[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/);

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const lineText = lines[lineIdx];
      // Quick check to skip irrelevant lines
      if (
        !lineText.includes('from_pretrained') &&
        !lineText.includes('model=') &&
        !lineText.includes('SentenceTransformer')
      ) {
        continue;
      }

      this.modelRegex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = this.modelRegex.exec(lineText)) !== null) {
        const modelId = match.groups?.m1 || match.groups?.m2 || match.groups?.m3;
        if (!modelId) {
          continue;
        }

        // Avoid common false positives and local file paths
        if (
          modelId === 'self' ||
          modelId === 'None' ||
          modelId.startsWith('/') ||
          modelId.startsWith('.') ||
          modelId.length < 3
        ) {
          continue;
        }

        const matchStr = match[0];
        const quoteChar = matchStr.includes('"') ? '"' : "'";
        const startOffset = matchStr.indexOf(quoteChar + modelId + quoteChar);
        const colStart =
          startOffset !== -1
            ? match.index + startOffset + 1
            : match.index + matchStr.indexOf(modelId);
        const colEnd = colStart + modelId.length;

        const range = new vscode.Range(lineIdx, colStart, lineIdx, colEnd);

        results.push({
          modelId,
          range,
          line: lineIdx,
        });
      }
    }

    return results;
  }

  /**
   * Checks if a repository identifier is valid and complete for Hugging Face.
   */
  public isValidRepoId(modelId: string): boolean {
    if (!modelId || modelId.length < 3) {
      return false;
    }
    // Standard Hub repo: owner/repo
    if (/^[a-zA-Z0-9_\-\.]{2,}\/[a-zA-Z0-9_\-\.]{2,}$/.test(modelId)) {
      return true;
    }
    // Official root models without slash, e.g. bert-base-uncased, gpt2, t5-small
    if (
      /^[a-zA-Z0-9_\-]{3,}$/.test(modelId) &&
      !['model', 'none', 'self', 'test'].includes(modelId.toLowerCase())
    ) {
      return true;
    }
    return false;
  }

  public isInFlight(modelId: string): boolean {
    return this.inFlightScans.has(modelId);
  }

  public hasAudit(modelId: string): boolean {
    return this.cache.has(modelId) || this.inFlightScans.has(modelId);
  }

  /**
   * Returns a cached scan report if available.
   */
  public getCached(modelId: string): ModelScanSummary | undefined {
    return this.cache.get(modelId);
  }

  /**
   * Audits a remote model over the Hugging Face API with deduplication.
   */
  public async auditModel(
    modelId: string,
    bridge: ScannerBridge
  ): Promise<ModelScanSummary> {
    const cached = this.cache.get(modelId);
    if (cached) {
      return cached;
    }

    const existingPromise = this.inFlightScans.get(modelId);
    if (existingPromise) {
      return await existingPromise;
    }

    const scanPromise = (async () => {
      try {
        const summary = await bridge.scanTarget(modelId, { isRemote: true });
        this.cache.set(modelId, summary);
        return summary;
      } finally {
        this.inFlightScans.delete(modelId);
      }
    })();

    this.inFlightScans.set(modelId, scanPromise);
    return await scanPromise;
  }

  public clearCache(): void {
    this.cache.clear();
    this.inFlightScans.clear();
  }
}
