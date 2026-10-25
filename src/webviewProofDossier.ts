import * as vscode from 'vscode';

export class ProofDossierWebview {
  public static currentPanel: ProofDossierWebview | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    target: string,
    htmlContent: string
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ProofDossierWebview.currentPanel) {
      ProofDossierWebview.currentPanel.panel.reveal(column);
      ProofDossierWebview.currentPanel.update(target, htmlContent);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'llmProofDossier',
      `Proof Dossier: ${target}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    ProofDossierWebview.currentPanel = new ProofDossierWebview(
      panel,
      extensionUri,
      target,
      htmlContent
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    _extensionUri: vscode.Uri,
    target: string,
    htmlContent: string
  ) {
    this.panel = panel;
    this.update(target, htmlContent);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public update(target: string, htmlContent: string): void {
    this.panel.title = `Proof Dossier: ${target}`;
    this.panel.webview.html = htmlContent;
  }

  public dispose(): void {
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
