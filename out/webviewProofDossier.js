"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProofDossierWebview = void 0;
const vscode = require("vscode");
class ProofDossierWebview {
    static currentPanel;
    panel;
    disposables = [];
    static createOrShow(extensionUri, target, htmlContent) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (ProofDossierWebview.currentPanel) {
            ProofDossierWebview.currentPanel.panel.reveal(column);
            ProofDossierWebview.currentPanel.update(target, htmlContent);
            return;
        }
        const panel = vscode.window.createWebviewPanel('llmProofDossier', `Proof Dossier: ${target}`, column || vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
        ProofDossierWebview.currentPanel = new ProofDossierWebview(panel, extensionUri, target, htmlContent);
    }
    constructor(panel, _extensionUri, target, htmlContent) {
        this.panel = panel;
        this.update(target, htmlContent);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }
    update(target, htmlContent) {
        this.panel.title = `Proof Dossier: ${target}`;
        this.panel.webview.html = htmlContent;
    }
    dispose() {
        ProofDossierWebview.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }
}
exports.ProofDossierWebview = ProofDossierWebview;
//# sourceMappingURL=webviewProofDossier.js.map