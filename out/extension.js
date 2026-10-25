"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const path = require("path");
const pythonEnvironment_1 = require("./pythonEnvironment");
const installer_1 = require("./installer");
const scannerBridge_1 = require("./scannerBridge");
const diagnosticsProvider_1 = require("./diagnosticsProvider");
const findingsTreeView_1 = require("./findingsTreeView");
const statusBar_1 = require("./statusBar");
const webviewProofDossier_1 = require("./webviewProofDossier");
const codeActionProvider_1 = require("./codeActionProvider");
const remoteModelDetector_1 = require("./remoteModelDetector");
const codeLensProvider_1 = require("./codeLensProvider");
let lastScannedSummary;
async function activate(context) {
    // 1. Initialize Core Services
    const pythonService = new pythonEnvironment_1.PythonEnvironmentService();
    const installer = new installer_1.ScannerInstaller(pythonService);
    const bridge = new scannerBridge_1.ScannerBridge(pythonService, context.secrets);
    const diagnostics = new diagnosticsProvider_1.DiagnosticsProvider();
    const treeProvider = new findingsTreeView_1.FindingsTreeProvider();
    const statusBar = new statusBar_1.StatusBarManager();
    const remoteDetector = new remoteModelDetector_1.RemoteModelDetector();
    const codeLensProvider = new codeLensProvider_1.RemoteModelCodeLensProvider(remoteDetector);
    // Register TreeView in Activity Bar
    vscode.window.registerTreeDataProvider('llmSecurityFindingsView', treeProvider);
    // Register CodeLens Provider for Python models
    const codeLensDisposable = vscode.languages.registerCodeLensProvider({ scheme: 'file', language: 'python' }, codeLensProvider);
    // Helper: Synchronize remote model diagnostics on document
    function syncRemoteDiagnostics(document) {
        if (document.languageId !== 'python' || document.uri.scheme !== 'file') {
            return;
        }
        const detected = remoteDetector.detectModels(document);
        const items = [];
        for (const item of detected) {
            const cached = remoteDetector.getCached(item.modelId);
            if (cached) {
                items.push({
                    modelId: item.modelId,
                    range: item.range,
                    summary: cached,
                });
            }
        }
        diagnostics.setRemoteModelDiagnostics(document.uri, items);
    }
    // 2. Register Commands
    // Command: Scan Workspace
    const scanWorkspaceCmd = vscode.commands.registerCommand('llmSecurity.scanWorkspace', async () => {
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
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Scanning Model Repository: ${path.basename(rootPath)}...`,
            cancellable: false,
        }, async () => {
            try {
                const summary = await bridge.scanTarget(rootPath);
                lastScannedSummary = summary;
                diagnostics.updateDiagnostics(summary.findings);
                treeProvider.setSummary(summary);
                statusBar.updateSummary(summary);
                notifyScanVerdict(summary);
            }
            catch (err) {
                vscode.window.showErrorMessage(`Scan failed: ${err?.message || err}`);
                statusBar.reset();
            }
        });
    });
    // Command: Scan Single File or Folder
    const scanFileCmd = vscode.commands.registerCommand('llmSecurity.scanFile', async (uri) => {
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
        }
        catch (err) {
            vscode.window.showErrorMessage(`File scan failed: ${err?.message || err}`);
            statusBar.reset();
        }
    });
    // Command: Audit Remote Hugging Face Repository
    const scanRemoteHubCmd = vscode.commands.registerCommand('llmSecurity.scanRemoteHub', async () => {
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
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Auditing Remote Hugging Face Repository: ${repoId}...`,
            cancellable: false,
        }, async () => {
            try {
                const summary = await bridge.scanTarget(repoId.trim(), { isRemote: true });
                lastScannedSummary = summary;
                diagnostics.updateDiagnostics(summary.findings);
                treeProvider.setSummary(summary);
                statusBar.updateSummary(summary);
                notifyScanVerdict(summary);
            }
            catch (err) {
                vscode.window.showErrorMessage(`Remote audit failed: ${err?.message || err}`);
                statusBar.reset();
            }
        });
    });
    // Command: Audit Remote Model Inline (from CodeLens or auto-audit)
    const auditRemoteInlineCmd = vscode.commands.registerCommand('llmSecurity.auditRemoteInline', async (modelId, documentUri) => {
        if (!modelId) {
            return;
        }
        const isReady = await installer.ensureInstalled();
        if (!isReady) {
            return;
        }
        codeLensProvider.refresh();
        try {
            const summary = await remoteDetector.auditModel(modelId, bridge);
            codeLensProvider.refresh();
            const editor = vscode.window.activeTextEditor;
            const uri = documentUri || editor?.document.uri;
            if (uri && editor && editor.document.uri.toString() === uri.toString()) {
                syncRemoteDiagnostics(editor.document);
            }
            if (summary.findings.length > 0) {
                treeProvider.setSummary(summary);
            }
            notifyScanVerdict(summary);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Remote audit for '${modelId}' failed: ${err?.message || err}`);
        }
    });
    // Command: Verify Specific Model with Proof Engine (opens webview)
    const verifySpecificModelCmd = vscode.commands.registerCommand('llmSecurity.verifySpecificModel', async (modelId) => {
        if (!modelId) {
            return;
        }
        const isReady = await installer.ensureInstalled();
        if (!isReady) {
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Generating Cryptographic Proof Dossier for: ${modelId}...`,
            cancellable: false,
        }, async () => {
            try {
                const htmlContent = await bridge.verifyTarget(modelId, true);
                webviewProofDossier_1.ProofDossierWebview.createOrShow(context.extensionUri, modelId, htmlContent);
            }
            catch (err) {
                vscode.window.showErrorMessage(`Verification failed for '${modelId}': ${err?.message || err}`);
            }
        });
    });
    // Command: Verify Findings with Proof Engine (active target)
    const verifyFindingsCmd = vscode.commands.registerCommand('llmSecurity.verifyFindings', async () => {
        const target = lastScannedSummary?.target ||
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
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Generating Cryptographic Proof Dossier for: ${target}...`,
            cancellable: false,
        }, async () => {
            try {
                const htmlContent = await bridge.verifyTarget(target, isRemote);
                webviewProofDossier_1.ProofDossierWebview.createOrShow(context.extensionUri, target, htmlContent);
            }
            catch (err) {
                vscode.window.showErrorMessage(`Verification failed: ${err?.message || err}`);
            }
        });
    });
    // Command: Show Compliance Crosswalk
    const showComplianceCmd = vscode.commands.registerCommand('llmSecurity.showCompliance', () => {
        vscode.window.showInformationMessage('Framework Crosswalk: OWASP LLM01–10 • MITRE ATLAS • NIST AI RMF • EU AI Act Art. 15/53/55', 'Learn More').then((choice) => {
            if (choice === 'Learn More') {
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/mesutgungor/llm-model-security-scanner#-regulatory--security-framework-crosswalk'));
            }
        });
    });
    // Command: Install Scanner
    const installScannerCmd = vscode.commands.registerCommand('llmSecurity.installScanner', async () => {
        const py = await pythonService.getPythonPath();
        await installer.installScanner(py);
    });
    // Command: Explain Rule Insight
    const explainRuleCmd = vscode.commands.registerCommand('llmSecurity.explainRule', (ruleId, message) => {
        vscode.window
            .showInformationMessage(`🛡️ [${ruleId}] Security Details\n\n${message}`, 'Verify Proof', 'Open on GitHub')
            .then((choice) => {
            if (choice === 'Verify Proof') {
                vscode.commands.executeCommand('llmSecurity.verifyFindings');
            }
            else if (choice === 'Open on GitHub') {
                vscode.env.openExternal(vscode.Uri.parse(`https://github.com/mesutgungor/llm-model-security-scanner#${ruleId.toLowerCase()}`));
            }
        });
    });
    // Register Code Actions Provider (Quick Fixes on hover/squiggly lines)
    const codeActionsDisposable = vscode.languages.registerCodeActionsProvider([
        { scheme: 'file', language: 'python' },
        { scheme: 'file', language: 'json' },
    ], new codeActionProvider_1.SecurityCodeActionProvider(), {
        providedCodeActionKinds: codeActionProvider_1.SecurityCodeActionProvider.providedCodeActionKinds,
    });
    // 3. Real-Time As-You-Write Linter & Remote Guardian Engine
    let debounceTimer;
    async function triggerRealtimeScan(document) {
        // Only scan Python or JSON files
        if (document.languageId !== 'python' && document.languageId !== 'json') {
            return;
        }
        // Only scan real file systems (ignore output panels, git diffs, etc.)
        if (document.uri.scheme !== 'file') {
            return;
        }
        const config = vscode.workspace.getConfiguration('llmSecurity');
        const triggerMode = config.get('triggerMode', 'smart');
        if (triggerMode === 'manual') {
            return;
        }
        // Verify scanner is installed in active environment
        const envInfo = await pythonService.checkScannerInstalled();
        if (!envInfo.isScannerInstalled) {
            return;
        }
        // A. Real-Time In-Memory AST / File Scan
        try {
            const summary = await bridge.scanDocument(document);
            diagnostics.updateDiagnosticsForFile(document.uri, summary.findings);
            if (summary.findings.length > 0) {
                treeProvider.setSummary(summary);
            }
            statusBar.updateSummary(summary);
        }
        catch (e) {
            console.error('Real-time file scan error:', e);
        }
        // B. Real-Time Remote Hugging Face Model Guardian
        if (document.languageId === 'python') {
            const detected = remoteDetector.detectModels(document);
            codeLensProvider.refresh();
            syncRemoteDiagnostics(document);
            // Auto-scan any newly detected valid Hugging Face models in background
            for (const item of detected) {
                if (remoteDetector.isValidRepoId(item.modelId) && !remoteDetector.hasAudit(item.modelId)) {
                    remoteDetector.auditModel(item.modelId, bridge)
                        .then((remoteSummary) => {
                        codeLensProvider.refresh();
                        const activeEditor = vscode.window.activeTextEditor;
                        if (activeEditor && activeEditor.document.uri.toString() === document.uri.toString()) {
                            syncRemoteDiagnostics(activeEditor.document);
                        }
                        if (remoteSummary.findings.length > 0) {
                            treeProvider.setSummary(remoteSummary);
                            statusBar.updateSummary(remoteSummary);
                        }
                    })
                        .catch((err) => {
                        console.error(`Background remote audit failed for ${item.modelId}:`, err);
                        codeLensProvider.refresh();
                    });
                }
            }
        }
    }
    // Watchers
    // A. As-You-Type (debounced 400ms after last keystroke)
    const changeDocWatcher = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.contentChanges.length === 0) {
            return;
        }
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            triggerRealtimeScan(event.document);
        }, 400);
    });
    // B. When switching active tabs or opening a file
    const activeEditorWatcher = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && editor.document) {
            triggerRealtimeScan(editor.document);
        }
    });
    // C. When saving a file
    const onSaveWatcher = vscode.workspace.onDidSaveTextDocument((doc) => {
        triggerRealtimeScan(doc);
    });
    // D. When opening a file
    const openDocWatcher = vscode.workspace.onDidOpenTextDocument((doc) => {
        triggerRealtimeScan(doc);
    });
    // E. Scan currently open editor on activation immediately
    if (vscode.window.activeTextEditor) {
        triggerRealtimeScan(vscode.window.activeTextEditor.document);
    }
    // 4. Register Disposables
    context.subscriptions.push(scanWorkspaceCmd, scanFileCmd, scanRemoteHubCmd, auditRemoteInlineCmd, verifySpecificModelCmd, verifyFindingsCmd, showComplianceCmd, installScannerCmd, explainRuleCmd, codeLensDisposable, codeActionsDisposable, changeDocWatcher, activeEditorWatcher, onSaveWatcher, openDocWatcher, diagnostics, statusBar);
    // 5. Initial Workspace Scan if configured for 'onOpen'
    const workspaceConfig = vscode.workspace.getConfiguration('llmSecurity');
    if (workspaceConfig.get('triggerMode') === 'onOpen') {
        vscode.commands.executeCommand('llmSecurity.scanWorkspace');
    }
}
function notifyScanVerdict(summary) {
    const verdict = summary.verdict;
    const count = summary.findings.length;
    const targetName = path.basename(summary.target);
    if (count === 0) {
        vscode.window.showInformationMessage(`✅ [SAFE] Model '${targetName}' verified clean! (0 findings, Risk: 0/100)`);
    }
    else {
        const highOrCrit = summary.findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH').length;
        vscode.window
            .showWarningMessage(`🚨 [${verdict}] Model '${targetName}' flagged with ${count} vulnerabilities (${highOrCrit} High/Critical). Risk: ${summary.riskScore}/100`, 'Verify Findings (Proof)', 'View Findings')
            .then((choice) => {
            if (choice === 'Verify Findings (Proof)') {
                vscode.commands.executeCommand('llmSecurity.verifyFindings');
            }
            else if (choice === 'View Findings') {
                vscode.commands.executeCommand('workbench.view.extension.llm-security-explorer');
            }
        });
    }
}
function deactivate() {
    lastScannedSummary = undefined;
}
//# sourceMappingURL=extension.js.map