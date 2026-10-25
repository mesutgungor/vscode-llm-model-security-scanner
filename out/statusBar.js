"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusBarManager = void 0;
const vscode = require("vscode");
const models_1 = require("./models");
class StatusBarManager {
    statusBarItem;
    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'workbench.view.extension.llm-security-explorer';
        this.statusBarItem.text = '$(shield) Model Security';
        this.statusBarItem.tooltip = 'Click to open LLM Model Security Explorer';
        this.statusBarItem.show();
    }
    updateSummary(summary) {
        const verdict = summary.verdict;
        const score = summary.riskScore;
        if (verdict === models_1.SecurityVerdict.SAFE) {
            this.statusBarItem.text = `$(shield) Model: SAFE (${score}/100)`;
            this.statusBarItem.backgroundColor = undefined;
        }
        else if (verdict === models_1.SecurityVerdict.LOW_RISK || verdict === models_1.SecurityVerdict.MEDIUM_RISK) {
            this.statusBarItem.text = `$(warning) Model: ${verdict} (${score}/100)`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
        else {
            this.statusBarItem.text = `$(alert) Model: ${verdict} (${score}/100)`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }
        this.statusBarItem.tooltip = `LLM Model Security Verdict: ${verdict}\nRisk Score: ${score}/100\nTotal Findings: ${summary.findings.length}\nClick to view details.`;
    }
    showScanning() {
        this.statusBarItem.text = '$(sync~spin) Scanning Model...';
        this.statusBarItem.backgroundColor = undefined;
    }
    reset() {
        this.statusBarItem.text = '$(shield) Model Security';
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.tooltip = 'Click to open LLM Model Security Explorer';
    }
    dispose() {
        this.statusBarItem.dispose();
    }
}
exports.StatusBarManager = StatusBarManager;
//# sourceMappingURL=statusBar.js.map