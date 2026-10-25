"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiagnosticsProvider = void 0;
const vscode = require("vscode");
const path = require("path");
const models_1 = require("./models");
class DiagnosticsProvider {
    diagnosticCollection;
    constructor() {
        this.diagnosticCollection =
            vscode.languages.createDiagnosticCollection('llm-model-security');
    }
    /**
     * Updates in-editor diagnostics from an array of security findings across all files.
     */
    updateDiagnostics(findings) {
        this.diagnosticCollection.clear();
        const fileMap = new Map();
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
                target: vscode.Uri.parse(`https://github.com/mesutgungor/llm-model-security-scanner#${finding.ruleId.toLowerCase()}`),
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
     */
    updateDiagnosticsForFile(targetUri, findings) {
        const diagnostics = [];
        for (const finding of findings) {
            const line = Math.max(0, (finding.lineNumber || 1) - 1);
            const range = new vscode.Range(line, 0, line, 100);
            const severity = this.mapSeverity(finding.severity);
            const message = this.formatDiagnosticMessage(finding);
            const diagnostic = new vscode.Diagnostic(range, message, severity);
            diagnostic.code = {
                value: finding.ruleId,
                target: vscode.Uri.parse(`https://github.com/mesutgungor/llm-model-security-scanner#${finding.ruleId.toLowerCase()}`),
            };
            diagnostic.source = 'llm-scan';
            diagnostics.push(diagnostic);
        }
        // Set diagnostics for this file (if array is empty, squiggles are removed)
        this.diagnosticCollection.set(targetUri, diagnostics);
    }
    clear() {
        this.diagnosticCollection.clear();
    }
    dispose() {
        this.diagnosticCollection.dispose();
    }
    resolveFileUri(filePath) {
        if (path.isAbsolute(filePath)) {
            return vscode.Uri.file(filePath);
        }
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return vscode.Uri.file(path.join(workspaceFolders[0].uri.fsPath, filePath));
        }
        return undefined;
    }
    mapSeverity(sev) {
        switch (sev) {
            case models_1.Severity.CRITICAL:
            case models_1.Severity.HIGH:
                return vscode.DiagnosticSeverity.Error;
            case models_1.Severity.MEDIUM:
                return vscode.DiagnosticSeverity.Warning;
            case models_1.Severity.LOW:
            case models_1.Severity.INFO:
            default:
                return vscode.DiagnosticSeverity.Information;
        }
    }
    formatDiagnosticMessage(finding) {
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
exports.DiagnosticsProvider = DiagnosticsProvider;
//# sourceMappingURL=diagnosticsProvider.js.map