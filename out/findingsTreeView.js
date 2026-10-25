"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TreeItemNode = exports.FindingsTreeProvider = void 0;
const vscode = require("vscode");
const path = require("path");
const models_1 = require("./models");
class FindingsTreeProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    currentSummary;
    setSummary(summary) {
        this.currentSummary = summary;
        this._onDidChangeTreeData.fire();
    }
    clear() {
        this.currentSummary = undefined;
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!this.currentSummary) {
            const empty = new TreeItemNode('No scan results yet (Click "Scan Workspace Models" to begin)', vscode.TreeItemCollapsibleState.None);
            empty.iconPath = new vscode.ThemeIcon('info');
            return Promise.resolve([empty]);
        }
        if (!element) {
            // Root level: Summary node + Severity groups
            const nodes = [];
            // 1. Summary status node
            const summaryNode = new TreeItemNode(`Verdict: ${this.currentSummary.verdict} (Risk: ${this.currentSummary.riskScore}/100)`, vscode.TreeItemCollapsibleState.None);
            summaryNode.description = path.basename(this.currentSummary.target);
            summaryNode.iconPath = this.getVerdictIcon(this.currentSummary.verdict);
            nodes.push(summaryNode);
            // 2. Group findings by severity
            const severities = [
                models_1.Severity.CRITICAL,
                models_1.Severity.HIGH,
                models_1.Severity.MEDIUM,
                models_1.Severity.LOW,
            ];
            for (const sev of severities) {
                const matches = this.currentSummary.findings.filter((f) => f.severity === sev);
                if (matches.length > 0) {
                    const groupNode = new TreeItemNode(`${sev} (${matches.length})`, vscode.TreeItemCollapsibleState.Expanded, 'severityGroup', undefined, matches);
                    groupNode.iconPath = this.getSeverityIcon(sev);
                    nodes.push(groupNode);
                }
            }
            if (this.currentSummary.findings.length === 0) {
                const cleanNode = new TreeItemNode('✅ Zero vulnerabilities detected. Model verified safe for loading.', vscode.TreeItemCollapsibleState.None);
                nodes.push(cleanNode);
            }
            return Promise.resolve(nodes);
        }
        if (element.contextValue === 'severityGroup' && element.findings) {
            // Child nodes: Individual findings
            const itemNodes = element.findings.map((f) => {
                const item = new TreeItemNode(`[${f.ruleId}] ${f.title}`, vscode.TreeItemCollapsibleState.None, 'findingItem', f);
                item.description = path.basename(f.filePath);
                item.tooltip = `${f.description}\n\nFile: ${f.filePath}:${f.lineNumber || 1}\nRemediation: ${f.remediation || 'N/A'}`;
                item.iconPath = new vscode.ThemeIcon('issue-opened');
                // Clicking finding navigates to file
                const uri = this.resolveUri(f.filePath);
                if (uri) {
                    item.command = {
                        command: 'vscode.open',
                        title: 'Open Finding',
                        arguments: [
                            uri,
                            {
                                selection: new vscode.Range(Math.max(0, (f.lineNumber || 1) - 1), 0, Math.max(0, (f.lineNumber || 1) - 1), 100),
                            },
                        ],
                    };
                }
                return item;
            });
            return Promise.resolve(itemNodes);
        }
        return Promise.resolve([]);
    }
    resolveUri(filePath) {
        if (path.isAbsolute(filePath)) {
            return vscode.Uri.file(filePath);
        }
        const wf = vscode.workspace.workspaceFolders;
        if (wf && wf.length > 0) {
            return vscode.Uri.file(path.join(wf[0].uri.fsPath, filePath));
        }
        return undefined;
    }
    getVerdictIcon(verdict) {
        switch (verdict) {
            case models_1.SecurityVerdict.SAFE:
            case models_1.SecurityVerdict.LOW_RISK:
                return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
            case models_1.SecurityVerdict.MEDIUM_RISK:
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
            case models_1.SecurityVerdict.HIGH_RISK:
            case models_1.SecurityVerdict.CRITICAL:
            default:
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('editorError.foreground'));
        }
    }
    getSeverityIcon(sev) {
        switch (sev) {
            case models_1.Severity.CRITICAL:
            case models_1.Severity.HIGH:
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('editorError.foreground'));
            case models_1.Severity.MEDIUM:
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
            case models_1.Severity.LOW:
            default:
                return new vscode.ThemeIcon('info', new vscode.ThemeColor('editorInfo.foreground'));
        }
    }
}
exports.FindingsTreeProvider = FindingsTreeProvider;
class TreeItemNode extends vscode.TreeItem {
    label;
    collapsibleState;
    contextValue;
    finding;
    findings;
    constructor(label, collapsibleState, contextValue, finding, findings) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.contextValue = contextValue;
        this.finding = finding;
        this.findings = findings;
    }
}
exports.TreeItemNode = TreeItemNode;
//# sourceMappingURL=findingsTreeView.js.map