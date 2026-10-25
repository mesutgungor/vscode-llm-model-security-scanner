"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoteModelCodeLensProvider = void 0;
const vscode = require("vscode");
const models_1 = require("./models");
class RemoteModelCodeLensProvider {
    detector;
    _onDidChangeCodeLenses = new vscode.EventEmitter();
    onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
    constructor(detector) {
        this.detector = detector;
    }
    refresh() {
        this._onDidChangeCodeLenses.fire();
    }
    provideCodeLenses(document) {
        if (document.languageId !== 'python') {
            return [];
        }
        const detected = this.detector.detectModels(document);
        const lenses = [];
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
            }
            else {
                const hasHubErr = cached.findings.some((f) => f.ruleId === 'SEC-HUB-ERR-001');
                if (hasHubErr) {
                    const lens = new vscode.CodeLens(item.range, {
                        title: `$(warning) Model Not Found on Hugging Face: ${item.modelId} [Retry]`,
                        command: 'llmSecurity.auditRemoteInline',
                        arguments: [item.modelId, document.uri],
                        tooltip: `Remote repository '${item.modelId}' not found. Check spelling or private token.`,
                    });
                    lenses.push(lens);
                }
                else if (cached.findings.length === 0 || cached.verdict === models_1.SecurityVerdict.SAFE) {
                    const lens = new vscode.CodeLens(item.range, {
                        title: `$(pass) Model Verified Clean (0/100) • ${item.modelId}`,
                        command: 'llmSecurity.auditRemoteInline',
                        arguments: [item.modelId, document.uri],
                        tooltip: `Zero security vulnerabilities detected in '${item.modelId}'. Click to re-scan.`,
                    });
                    lenses.push(lens);
                }
                else {
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
exports.RemoteModelCodeLensProvider = RemoteModelCodeLensProvider;
//# sourceMappingURL=codeLensProvider.js.map