import * as vscode from 'vscode';
import * as path from 'path';
import { SecurityFinding, Severity } from './models';

export class DiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection('llm-model-security');
  }

  /**
   * Updates in-editor diagnostics from an array of security findings.
   */
  public updateDiagnostics(findings: SecurityFinding[]): void {
    this.diagnosticCollection.clear();

    const fileMap = new Map<string, vscode.Diagnostic[]>();

    for (const finding of findings) {
      const uri = this.resolveFileUri(finding.filePath);
      if (!uri) {
        continue;
      }

      const line = Math.max(0, (finding.lineNumber || 1) - 1);
      const range = new vscode.Range(line, 0, line, 100);

      const severity = this.mapSeverity(finding.severity);
      const message = this.formatDiagnosticMessage(finding);

      const diagnostic = new vscode.Diagnostic(range, message, severity);
      diagnostic.code = {
        value: finding.ruleId,
        target: vscode.Uri.parse(
          `https://github.com/mesutgungor/llm-model-security-scanner#${finding.ruleId.toLowerCase()}`
        ),
      };
      diagnostic.source = 'llm-scan';

      const existing = fileMap.get(uri.fsPath) || [];
      existing.push(diagnostic);
      fileMap.set(uri.fsPath, existing);
    }

    for (const [fsPath, diagnostics] of fileMap.entries()) {
      this.diagnosticCollection.set(vscode.Uri.file(fsPath), diagnostics);
    }
  }

  public clear(): void {
    this.diagnosticCollection.clear();
  }

  public dispose(): void {
    this.diagnosticCollection.dispose();
  }

  private resolveFileUri(filePath: string): vscode.Uri | undefined {
    if (path.isAbsolute(filePath)) {
      return vscode.Uri.file(filePath);
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return vscode.Uri.file(path.join(workspaceFolders[0].uri.fsPath, filePath));
    }

    return undefined;
  }

  private mapSeverity(sev: Severity): vscode.DiagnosticSeverity {
    switch (sev) {
      case Severity.CRITICAL:
      case Severity.HIGH:
        return vscode.DiagnosticSeverity.Error;
      case Severity.MEDIUM:
        return vscode.DiagnosticSeverity.Warning;
      case Severity.LOW:
      case Severity.INFO:
      default:
        return vscode.DiagnosticSeverity.Information;
    }
  }

  private formatDiagnosticMessage(finding: SecurityFinding): string {
    let msg = `[${finding.ruleId}] ${finding.description}`;
    if (finding.cweId) {
      msg += ` (${finding.cweId})`;
    }
    if (finding.evidence) {
      msg += `\nEvidence: ${finding.evidence}`;
    }
    if (finding.remediation) {
      msg += `\nRemediation: ${finding.remediation}`;
    }
    return msg;
  }
}
