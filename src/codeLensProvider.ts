import * as vscode from 'vscode';
import { RemoteModelDetector } from './remoteModelDetector';
import { SecurityVerdict } from './models';

export class RemoteModelCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> =
    this._onDidChangeCodeLenses.event;

  constructor(private detector: RemoteModelDetector) {}

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  public provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    if (document.languageId !== 'python') {
      return [];
    }

    const detected = this.detector.detectModels(document);
    const lenses: vscode.CodeLens[] = [];

    for (const item of detected) {
      if (this.detector.isInFlight(item.modelId)) {
        // In-flight scanning feedback
        const lens = new vscode.CodeLens(item.range, {
          title: `$(sync~spin) Auditing Remote Model: ${item.modelId}...`,
          command: '',
          tooltip: `Weightless security audit in progress via Hugging Face API...`,
        });
        lenses.push(lens);
        continue;
      }

      const cached = this.detector.getCached(item.modelId);

      if (!cached) {
        // Not audited yet
        const lens = new vscode.CodeLens(item.range, {
          title: `$(shield) Audit Remote Model: ${item.modelId} [Click to Scan]`,
          command: 'llmSecurity.auditRemoteInline',
          arguments: [item.modelId, document.uri],
          tooltip: `Audit '${item.modelId}' weightless over the Hugging Face API before loading`,
        });
        lenses.push(lens);
      } else {
        const hasHubErr = cached.findings.some((f) => f.ruleId === 'SEC-HUB-ERR-001');

        if (hasHubErr) {
          const lens = new vscode.CodeLens(item.range, {
            title: `$(warning) Model Not Found on Hugging Face: ${item.modelId} [Retry]`,
            command: 'llmSecurity.auditRemoteInline',
            arguments: [item.modelId, document.uri],
            tooltip: `Remote repository '${item.modelId}' not found. Check spelling or private token.`,
          });
          lenses.push(lens);
        } else if (cached.findings.length === 0 || cached.verdict === SecurityVerdict.SAFE) {
          const lens = new vscode.CodeLens(item.range, {
            title: `$(pass) Model Verified Clean (0/100) • ${item.modelId}`,
            command: 'llmSecurity.auditRemoteInline',
            arguments: [item.modelId, document.uri],
            tooltip: `Zero security vulnerabilities detected in '${item.modelId}'. Click to re-scan.`,
          });
          lenses.push(lens);
        } else {
          const lens = new vscode.CodeLens(item.range, {
            title: `$(alert) [${cached.verdict}] Risk: ${cached.riskScore}/100 • ${cached.findings.length} Finding(s) [View Proof]`,
            command: 'llmSecurity.verifySpecificModel',
            arguments: [item.modelId],
            tooltip: `Click to view cryptographic Proof-of-Finding dossier for '${item.modelId}'`,
          });
          lenses.push(lens);
        }
      }
    }

    return lenses;
  }
}
