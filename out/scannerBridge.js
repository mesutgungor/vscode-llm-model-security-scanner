"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScannerBridge = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const os = require("os");
const child_process_1 = require("child_process");
const util_1 = require("util");
const models_1 = require("./models");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class ScannerBridge {
    pythonService;
    secrets;
    constructor(pythonService, secrets) {
        this.pythonService = pythonService;
        this.secrets = secrets;
    }
    /**
     * Scans an active in-memory text document in real-time as the user types.
     * Automatically handles unsaved buffer edits without requiring a file save.
     */
    async scanDocument(document) {
        const rawExt = path.extname(document.fileName);
        const ext = rawExt || (document.languageId === 'python' ? '.py' : '.json');
        const base = path.basename(document.fileName, rawExt);
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, `active_editor_${Date.now()}_${base}${ext}`);
        try {
            // Write the current in-memory editor buffer to a temporary file
            fs.writeFileSync(tempFile, document.getText(), 'utf-8');
            const summary = await this.scanTarget(tempFile, { deep: false });
            // Remap findings back to the actual document file path
            for (const finding of summary.findings) {
                finding.filePath = document.fileName;
            }
            summary.target = document.fileName;
            return summary;
        }
        finally {
            if (fs.existsSync(tempFile)) {
                try {
                    fs.unlinkSync(tempFile);
                }
                catch { }
            }
        }
    }
    /**
     * Executes a model security scan on a target path or remote Hugging Face repository ID.
     */
    async scanTarget(targetPathOrRepoId, options) {
        const pythonPath = await this.pythonService.getPythonPath();
        const config = vscode.workspace.getConfiguration('llmSecurity');
        const isDeep = options?.deep ?? config.get('deepWeightSampling', false);
        // Create temporary file for SARIF output
        const tempDir = os.tmpdir();
        const sarifFile = path.join(tempDir, `llm_scan_${Date.now()}.sarif`);
        const jsonFile = path.join(tempDir, `llm_scan_${Date.now()}.json`);
        // Prepare CLI flags
        const flags = [
            '-m',
            'llm_security_scanner.cli',
            'scan',
            `"${targetPathOrRepoId}"`,
            '--format',
            'sarif',
            '--output',
            `"${sarifFile}"`,
        ];
        if (options?.isRemote) {
            flags.push('--remote');
            const hfToken = await this.secrets.get('huggingface_token');
            if (hfToken) {
                flags.push('--token', `"${hfToken}"`);
            }
        }
        if (isDeep) {
            flags.push('--deep');
        }
        else {
            flags.push('--fast');
        }
        const startTime = Date.now();
        const cmd = `"${pythonPath}" ${flags.join(' ')}`;
        try {
            await execAsync(cmd);
        }
        catch (err) {
            // Non-zero exit code might occur if findings exceeded max severity, but SARIF is still generated
        }
        const durationSeconds = (Date.now() - startTime) / 1000;
        // Parse SARIF report
        let findings = [];
        if (fs.existsSync(sarifFile)) {
            try {
                const sarifRaw = fs.readFileSync(sarifFile, 'utf-8');
                const sarif = JSON.parse(sarifRaw);
                findings = this.parseSarifFindings(sarif, targetPathOrRepoId);
                fs.unlinkSync(sarifFile);
            }
            catch (e) {
                console.error('Error parsing SARIF report:', e);
            }
        }
        // Clean up temporary files
        if (fs.existsSync(jsonFile)) {
            try {
                fs.unlinkSync(jsonFile);
            }
            catch { }
        }
        // Compute verdict and risk score
        const riskScore = this.computeRiskScore(findings);
        const verdict = this.computeVerdict(findings, riskScore);
        return {
            target: targetPathOrRepoId,
            verdict,
            riskScore,
            scannedFilesCount: 1,
            totalBytesScanned: 0,
            durationSeconds,
            findings,
            weightFormats: [],
        };
    }
    /**
     * Generates a Proof-of-Finding verification dossier and interactive HTML certificate.
     */
    async verifyTarget(targetPathOrRepoId, isRemote = false) {
        const pythonPath = await this.pythonService.getPythonPath();
        const tempHtml = path.join(os.tmpdir(), `llm_proof_${Date.now()}.html`);
        const flags = [
            '-m',
            'llm_security_scanner.cli',
            'verify',
            `"${targetPathOrRepoId}"`,
            '--format',
            'html',
            '--output',
            `"${tempHtml}"`,
        ];
        if (isRemote) {
            flags.push('--remote');
            const token = await this.secrets.get('huggingface_token');
            if (token) {
                flags.push('--token', `"${token}"`);
            }
        }
        const cmd = `"${pythonPath}" ${flags.join(' ')}`;
        await execAsync(cmd);
        if (fs.existsSync(tempHtml)) {
            const htmlContent = fs.readFileSync(tempHtml, 'utf-8');
            fs.unlinkSync(tempHtml);
            return htmlContent;
        }
        throw new Error('Verification engine did not produce an HTML dossier.');
    }
    parseSarifFindings(sarif, fallbackPath) {
        const findings = [];
        if (!sarif.runs || sarif.runs.length === 0) {
            return findings;
        }
        const run = sarif.runs[0];
        const rulesMap = new Map();
        if (run.tool?.driver?.rules) {
            for (const rule of run.tool.driver.rules) {
                rulesMap.set(rule.id, rule);
            }
        }
        for (const res of run.results || []) {
            const rule = rulesMap.get(res.ruleId);
            const level = res.level || rule?.defaultConfiguration?.level || 'error';
            const severity = this.mapSarifLevel(level);
            let filePath = fallbackPath;
            let lineNumber;
            if (res.locations && res.locations.length > 0) {
                const phys = res.locations[0].physicalLocation;
                if (phys?.artifactLocation?.uri) {
                    filePath = phys.artifactLocation.uri;
                }
                if (phys?.region?.startLine) {
                    lineNumber = phys.region.startLine;
                }
            }
            findings.push({
                ruleId: res.ruleId,
                severity,
                title: rule?.name || res.ruleId,
                description: res.message.text,
                filePath,
                lineNumber,
                evidence: res.properties?.evidence,
                remediation: res.properties?.remediation,
                cweId: res.properties?.cweId,
            });
        }
        return findings;
    }
    mapSarifLevel(level) {
        switch (level.toLowerCase()) {
            case 'error':
                return models_1.Severity.HIGH;
            case 'warning':
                return models_1.Severity.MEDIUM;
            case 'note':
                return models_1.Severity.LOW;
            default:
                return models_1.Severity.HIGH;
        }
    }
    computeRiskScore(findings) {
        let score = 0;
        for (const f of findings) {
            if (f.severity === models_1.Severity.CRITICAL) {
                score += 35;
            }
            else if (f.severity === models_1.Severity.HIGH) {
                score += 20;
            }
            else if (f.severity === models_1.Severity.MEDIUM) {
                score += 10;
            }
            else if (f.severity === models_1.Severity.LOW) {
                score += 3;
            }
        }
        return Math.min(100, score);
    }
    computeVerdict(findings, score) {
        if (findings.some((f) => f.severity === models_1.Severity.CRITICAL)) {
            return models_1.SecurityVerdict.CRITICAL;
        }
        if (findings.some((f) => f.severity === models_1.Severity.HIGH) || score >= 40) {
            return models_1.SecurityVerdict.HIGH_RISK;
        }
        if (findings.some((f) => f.severity === models_1.Severity.MEDIUM) || score >= 20) {
            return models_1.SecurityVerdict.MEDIUM_RISK;
        }
        if (findings.length > 0 || score > 0) {
            return models_1.SecurityVerdict.LOW_RISK;
        }
        return models_1.SecurityVerdict.SAFE;
    }
}
exports.ScannerBridge = ScannerBridge;
//# sourceMappingURL=scannerBridge.js.map