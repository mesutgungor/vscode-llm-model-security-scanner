import * as vscode from 'vscode';
import * as path from 'path';
import { PythonEnvironmentService } from './pythonEnvironment';
import { ScannerInstaller } from './installer';
import { ScannerBridge } from './scannerBridge';
import { DiagnosticsProvider } from './diagnosticsProvider';
import { FindingsTreeProvider } from './findingsTreeView';
import { StatusBarManager } from './statusBar';
import { ProofDossierWebview } from './webviewProofDossier';
import { SecurityCodeActionProvider } from './codeActionProvider';
import { ModelScanSummary } from './models';

let lastScannedSummary: ModelScanSummary | undefined;

export async function activate(context: vscode.ExtensionContext) {
  // 1. Initialize Core Services
  const pythonService = new PythonEnvironmentService();
  const installer = new ScannerInstaller(pythonService);
  const bridge = new ScannerBridge(pythonService, context.secrets);
  const diagnostics = new DiagnosticsProvider();
  const treeProvider = new FindingsTreeProvider();
  const statusBar = new StatusBarManager();

  // Register TreeView in Activity Bar
  vscode.window.registerTreeDataProvider('llmSecurityFindingsView', treeProvider);

  // 2. Register Commands

  // Command: Scan Workspace
  const scanWorkspaceCmd = vscode.commands.registerCommand(
    'llmSecurity.scanWorkspace',
    async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        vscode.window.showWarningMessage('No workspace folder open to scan.');
        return;
      }

      const isReady = await installer.ensureInstalled();
      if (!isReady) {
        return;
      }

      const rootPath = folders[0].uri.fsPath;
      statusBar.showScanning();

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Scanning Model Repository: ${path.basename(rootPath)}...`,
          cancellable: false,
        },
        async () => {
          try {
            const summary = await bridge.scanTarget(rootPath);
            lastScannedSummary = summary;

            diagnostics.updateDiagnostics(summary.findings);
            treeProvider.setSummary(summary);
            statusBar.updateSummary(summary);

            notifyScanVerdict(summary);
          } catch (err: any) {
            vscode.window.showErrorMessage(
              `Scan failed: ${err?.message || err}`
            );
            statusBar.reset();
          }
        }
      );
    }
  );

  // Command: Scan Single File or Folder
  const scanFileCmd = vscode.commands.registerCommand(
    'llmSecurity.scanFile',
    async (uri?: vscode.Uri) => {
      const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
      if (!targetUri) {
        vscode.window.showWarningMessage('No file selected to scan.');
        return;
      }

      const isReady = await installer.ensureInstalled();
      if (!isReady) {
        return;
      }

      statusBar.showScanning();
      try {
        const summary = await bridge.scanTarget(targetUri.fsPath);
        lastScannedSummary = summary;

        diagnostics.updateDiagnostics(summary.findings);
        treeProvider.setSummary(summary);
        statusBar.updateSummary(summary);

        notifyScanVerdict(summary);
      } catch (err: any) {
        vscode.window.showErrorMessage(`File scan failed: ${err?.message || err}`);
        statusBar.reset();
      }
    }
  );

  // Command: Audit Remote Hugging Face Repository
  const scanRemoteHubCmd = vscode.commands.registerCommand(
    'llmSecurity.scanRemoteHub',
    async () => {
      const repoId = await vscode.window.showInputBox({
        title: 'Audit Remote Hugging Face Model',
        prompt: 'Enter Hugging Face repository ID (e.g. NousResearch/Hermes-3-Llama-3.1-8B)',
        placeHolder: 'owner/model-name',
        ignoreFocusOut: true,
      });

      if (!repoId || repoId.trim().length === 0) {
        return;
      }

      const isReady = await installer.ensureInstalled();
      if (!isReady) {
        return;
      }

      statusBar.showScanning();
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Auditing Remote Hugging Face Repository: ${repoId}...`,
          cancellable: false,
        },
        async () => {
          try {
            const summary = await bridge.scanTarget(repoId.trim(), { isRemote: true });
            lastScannedSummary = summary;

            diagnostics.updateDiagnostics(summary.findings);
            treeProvider.setSummary(summary);
            statusBar.updateSummary(summary);

            notifyScanVerdict(summary);
          } catch (err: any) {
            vscode.window.showErrorMessage(`Remote audit failed: ${err?.message || err}`);
            statusBar.reset();
          }
        }
      );
    }
  );

  // Command: Verify Findings with Proof Engine
  const verifyFindingsCmd = vscode.commands.registerCommand(
    'llmSecurity.verifyFindings',
    async () => {
      const target =
        lastScannedSummary?.target ||
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      if (!target) {
        vscode.window.showWarningMessage('Please run a model scan first before verifying.');
        return;
      }

      const isReady = await installer.ensureInstalled();
      if (!isReady) {
        return;
      }

      const isRemote = !path.isAbsolute(target);

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Generating Cryptographic Proof Dossier for: ${target}...`,
          cancellable: false,
        },
        async () => {
          try {
            const htmlContent = await bridge.verifyTarget(target, isRemote);
            ProofDossierWebview.createOrShow(context.extensionUri, target, htmlContent);
          } catch (err: any) {
            vscode.window.showErrorMessage(
              `Verification failed: ${err?.message || err}`
            );
          }
        }
      );
    }
  );

  // Command: Show Compliance Crosswalk
  const showComplianceCmd = vscode.commands.registerCommand(
    'llmSecurity.showCompliance',
    () => {
      const md = new vscode.MarkdownString();
      md.appendMarkdown('## 🏛️ Security Framework Crosswalk Matrix\n\n');
      md.appendMarkdown(
        'Every rule in **llm-scan** is mapped to the four principal AI safety frameworks:\n\n'
      );
      md.appendMarkdown(
        '| Rule Category | OWASP Top 10 for LLMs | MITRE ATLAS | NIST AI RMF | EU AI Act (2024/1689) |\n'
      );
      md.appendMarkdown('| :--- | :--- | :--- | :--- | :--- |\n');
      md.appendMarkdown(
        '| **Pickle / ZipSlip RCE** | LLM03: Supply Chain | AML.T0010: Supply Chain | MANAGE-2.4 (Vetting) | Art. 15 / 55 (Systemic) |\n'
      );
      md.appendMarkdown(
        '| **Jinja2 Chat SSTI** | LLM03 / LLM01 | AML.T0048: Code Execution | MEASURE-2.6 (Testing) | Art. 15 (Cybersecurity) |\n'
      );
      md.appendMarkdown(
        '| **SafeTensors / GGUF DoS** | LLM10: Consumption | AML.T0029: Denial of Service | MEASURE-2.6 (Testing) | Art. 15 (Robustness) |\n'
      );
      md.appendMarkdown(
        '| **Special Token Hijack** | LLM01: Prompt Injection | AML.T0051: LLM Injection | MEASURE-2.6 (Testing) | Art. 15 (Cybersecurity) |\n'
      );
      md.appendMarkdown(
        '| **Weight Poisoning (NaN/Inf)** | LLM04: Poisoning | AML.T0029: Denial of Service | MEASURE-2.6 (Testing) | Art. 15 / 55 (Systemic) |\n'
      );
      md.appendMarkdown(
        '| **Secret / Key Leaks** | LLM02: Data Leak | AML.T0040: IP Theft | GOVERN-1.2 & MANAGE | Art. 15 & 53 (Protection) |\n'
      );

      vscode.window.showInformationMessage(
        'Framework Crosswalk: OWASP LLM01–10 • MITRE ATLAS • NIST AI RMF • EU AI Act Art. 15/53/55',
        'Learn More'
      ).then((choice) => {
        if (choice === 'Learn More') {
          vscode.env.openExternal(
            vscode.Uri.parse(
              'https://github.com/mesutgungor/llm-model-security-scanner#-regulatory--security-framework-crosswalk'
            )
          );
        }
      });
    }
  );

  // Command: Install Scanner
  const installScannerCmd = vscode.commands.registerCommand(
    'llmSecurity.installScanner',
    async () => {
      const py = await pythonService.getPythonPath();
      await installer.installScanner(py);
    }
  );

  // Command: Explain Rule Insight
  const explainRuleCmd = vscode.commands.registerCommand(
    'llmSecurity.explainRule',
    (ruleId: string, message: string) => {
      vscode.window
        .showInformationMessage(
          `🛡️ [${ruleId}] Security Details\n\n${message}`,
          'Verify Proof',
          'Open on GitHub'
        )
        .then((choice) => {
          if (choice === 'Verify Proof') {
            vscode.commands.executeCommand('llmSecurity.verifyFindings');
          } else if (choice === 'Open on GitHub') {
            vscode.env.openExternal(
              vscode.Uri.parse(
                `https://github.com/mesutgungor/llm-model-security-scanner#${ruleId.toLowerCase()}`
              )
            );
          }
        });
    }
  );

  // Register Code Actions Provider (Quick Fixes on hover/squiggly lines)
  const codeActionsDisposable = vscode.languages.registerCodeActionsProvider(
    [
      { scheme: 'file', language: 'python' },
      { scheme: 'file', language: 'json' },
    ],
    new SecurityCodeActionProvider(),
    {
      providedCodeActionKinds: SecurityCodeActionProvider.providedCodeActionKinds,
    }
  );

  // 3. Register File Watchers for Smart / OnSave Scanning
  const onSaveWatcher = vscode.workspace.onDidSaveTextDocument(async (doc) => {
    const config = vscode.workspace.getConfiguration('llmSecurity');
    const triggerMode = config.get<string>('triggerMode', 'smart');

    if (triggerMode === 'manual') {
      return;
    }

    const fileName = path.basename(doc.fileName);
    const isModelManifest =
      fileName === 'config.json' ||
      fileName === 'tokenizer.json' ||
      fileName === 'generation_config.json' ||
      fileName === 'chat_template.json' ||
      fileName === 'adapter_config.json' ||
      fileName.startsWith('modeling_');

    if (triggerMode === 'smart' && !isModelManifest) {
      return;
    }

    // Auto-scan on manifest save
    const envInfo = await pythonService.checkScannerInstalled();
    if (envInfo.isScannerInstalled) {
      const summary = await bridge.scanTarget(doc.fileName);
      diagnostics.updateDiagnostics(summary.findings);
      treeProvider.setSummary(summary);
      statusBar.updateSummary(summary);
    }
  });

  // 4. Register Disposables
  context.subscriptions.push(
    scanWorkspaceCmd,
    scanFileCmd,
    scanRemoteHubCmd,
    verifyFindingsCmd,
    showComplianceCmd,
    installScannerCmd,
    explainRuleCmd,
    codeActionsDisposable,
    onSaveWatcher,
    diagnostics,
    statusBar
  );

  // 5. Initial Workspace Scan if configured for 'onOpen'
  const config = vscode.workspace.getConfiguration('llmSecurity');
  if (config.get<string>('triggerMode') === 'onOpen') {
    vscode.commands.executeCommand('llmSecurity.scanWorkspace');
  }
}

function notifyScanVerdict(summary: ModelScanSummary): void {
  const verdict = summary.verdict;
  const count = summary.findings.length;
  const targetName = path.basename(summary.target);

  if (count === 0) {
    vscode.window.showInformationMessage(
      `✅ [SAFE] Model '${targetName}' verified clean! (0 findings, Risk: 0/100)`
    );
  } else {
    const highOrCrit = summary.findings.filter(
      (f) => f.severity === 'CRITICAL' || f.severity === 'HIGH'
    ).length;

    vscode.window
      .showWarningMessage(
        `🚨 [${verdict}] Model '${targetName}' flagged with ${count} vulnerabilities (${highOrCrit} High/Critical). Risk: ${summary.riskScore}/100`,
        'Verify Findings (Proof)',
        'View Findings'
      )
      .then((choice) => {
        if (choice === 'Verify Findings (Proof)') {
          vscode.commands.executeCommand('llmSecurity.verifyFindings');
        } else if (choice === 'View Findings') {
          vscode.commands.executeCommand('workbench.view.extension.llm-security-explorer');
        }
      });
  }
}

export function deactivate() {
  lastScannedSummary = undefined;
}
