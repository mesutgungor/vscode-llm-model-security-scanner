import * as vscode from 'vscode';

export class SecurityCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  public provideCodeActions(
    _document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source === 'llm-scan') {
        const ruleId =
          typeof diagnostic.code === 'object'
            ? String(diagnostic.code.value)
            : String(diagnostic.code);

        // Action 1: Explain vulnerability in an informative dialog
        const explainAction = new vscode.CodeAction(
          `💡 Security Insights: [${ruleId}]`,
          vscode.CodeActionKind.QuickFix
        );
        explainAction.command = {
          command: 'llmSecurity.explainRule',
          title: 'Explain Vulnerability',
          arguments: [ruleId, diagnostic.message],
        };
        explainAction.isPreferred = true;
        actions.push(explainAction);

        // Action 2: Run verification engine on this target
        const verifyAction = new vscode.CodeAction(
          `🛡️ Generate Proof Dossier (llm-scan verify)`,
          vscode.CodeActionKind.QuickFix
        );
        verifyAction.command = {
          command: 'llmSecurity.verifyFindings',
          title: 'Verify Finding',
        };
        actions.push(verifyAction);

        // Action 3: Open online documentation
        const docAction = new vscode.CodeAction(
          `📖 Open Rule Documentation on GitHub (${ruleId})`,
          vscode.CodeActionKind.QuickFix
        );
        docAction.command = {
          command: 'vscode.open',
          title: 'Open Documentation',
          arguments: [
            vscode.Uri.parse(
              `https://github.com/mesutgungor/llm-model-security-scanner#${ruleId.toLowerCase()}`
            ),
          ],
        };
        actions.push(docAction);
      }
    }

    return actions;
  }
}
