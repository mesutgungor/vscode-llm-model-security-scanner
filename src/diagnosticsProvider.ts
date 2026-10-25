import * as vscode from 'vscode';
import * as path from 'path';
import { ModelScanSummary, SecurityFinding, Severity } from './models';

export class DiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection('llm-model-security');
  }

  /**
   * Updates in-editor diagnostics from an array of security findings across all files.
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

  /**
   * Updates in-editor diagnostics for a single file in real-time as the user types.
   * Preserves any remote model diagnostics present on the file.
   */
  public updateDiagnosticsForFile(
    targetUri: vscode.Uri,
    findings: SecurityFinding[]
  ): void {
    const diagnostics: vscode.Diagnostic[] = [];

    for (const finding of findings) {
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
      diagnostics.push(diagnostic);
    }

    // Preserve remote hub diagnostics
    const existing = this.diagnosticCollection.get(targetUri) || [];
    const remoteDiagnostics = existing.filter(
      (d) => d.source === 'llm-scan (Remote Hub)'
    );

    this.diagnosticCollection.set(targetUri, [...diagnostics, ...remoteDiagnostics]);
  }

  /**
   * Updates remote model diagnostics on a document while preserving local file diagnostics.
   */
  public setRemoteModelDiagnostics(
    targetUri: vscode.Uri,
    items: { modelId: string; range: vscode.Range; summary: ModelScanSummary }[]
  ): void {
    const existing = this.diagnosticCollection.get(targetUri) || [];
    const localDiagnostics = existing.filter(
      (d) => d.source !== 'llm-scan (Remote Hub)'
    );

    const remoteDiagnostics: vscode.Diagnostic[] = [];
    for (const item of items) {
      if (item.summary.findings.length === 0) {
        continue;
      }

      const highOrCrit = item.summary.findings.filter(
        (f) => f.severity === Severity.CRITICAL || f.severity === Severity.HIGH
      ).length;

      const topFinding = item.summary.findings[0];
      const message =
        `[REMOTE-RISK] Hugging Face Model '${item.modelId}' flagged with ${item.summary.verdict} (${item.summary.riskScore}/100).\n` +
        `Detected ${item.summary.findings.length} vulnerabilities (${highOrCrit} High/Critical).\n` +
        `Primary threat: [${topFinding.ruleId}] ${topFinding.description}\n` +
        `Remediation: ${topFinding.remediation || 'Inspect model architecture and configs before loading.'}`;

      const severity =
        item.summary.verdict === 'CRITICAL' || item.summary.verdict === 'HIGH_RISK'
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning;

      const diagnostic = new vscode.Diagnostic(item.range, message, severity);
      diagnostic.code = {
        value: topFinding.ruleId,
        target: vscode.Uri.parse(
          `https://github.com/mesutgungor/llm-model-security-scanner#${topFinding.ruleId.toLowerCase()}`
        ),
      };
      diagnostic.source = 'llm-scan (Remote Hub)';
      remoteDiagnostics.push(diagnostic);
    }

    this.diagnosticCollection.set(targetUri, [...localDiagnostics, ...remoteDiagnostics]);
  }

  /**
   * Adds a high-visibility diagnostic directly on a remote Hugging Face model string literal.
   */
  public addRemoteModelDiagnostic(
    targetUri: vscode.Uri,
    modelId: string,
    range: vscode.Range,
    summary: ModelScanSummary
  ): void {
    if (summary.findings.length === 0) {
      return;
    }

    const highOrCrit = summary.findings.filter(
      (f) => f.severity === Severity.CRITICAL || f.severity === Severity.HIGH
    ).length;

    const topFinding = summary.findings[0];
    const message =
      `[REMOTE-RISK] Hugging Face Model '${modelId}' has ${summary.verdict} (${summary.riskScore}/100).\n` +
      `Detected ${summary.findings.length} vulnerabilities (${highOrCrit} High/Critical).\n` +
      `Primary threat: [${topFinding.ruleId}] ${topFinding.description}\n` +
      `Remediation: ${topFinding.remediation || 'Inspect model architecture before loading.'}`;

    const diagnostic = new vscode.Diagnostic(
      range,
      message,
      summary.verdict === 'CRITICAL' || summary.verdict === 'HIGH_RISK'
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning
    );

    diagnostic.code = {
      value: topFinding.ruleId,
      target: vscode.Uri.parse(
        `https://github.com/mesutgungor/llm-model-security-scanner#${topFinding.ruleId.toLowerCase()}`
      ),
    };
    diagnostic.source = 'llm-scan (Remote Hub)';

    const existing = Array.from(this.diagnosticCollection.get(targetUri) || []);
    // Avoid duplicate diagnostics on the same range
    const filtered = existing.filter(
      (d) => !(d.range.isEqual(range) && d.source === 'llm-scan (Remote Hub)')
    );
    filtered.push(diagnostic);
    this.diagnosticCollection.set(targetUri, filtered);
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
