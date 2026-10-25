import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PythonEnvironmentService } from './pythonEnvironment';
import {
  ModelScanSummary,
  SarifReport,
  SecurityFinding,
  SecurityVerdict,
  Severity,
} from './models';

const execAsync = promisify(exec);

export class ScannerBridge {
  constructor(
    private pythonService: PythonEnvironmentService,
    private secrets: vscode.SecretStorage
  ) {}

  /**
   * Scans an active in-memory text document in real-time as the user types.
   * Automatically handles unsaved buffer edits without requiring a file save.
   */
  public async scanDocument(document: vscode.TextDocument): Promise<ModelScanSummary> {
    const rawExt = path.extname(document.fileName);
    const ext = rawExt || (document.languageId === 'python' ? '.py' : '.json');
    const base = path.basename(document.fileName, rawExt);
    const tempDir = os.tmpdir();
    const tempFile = path.join(
      tempDir,
      `active_editor_${Date.now()}_${base}${ext}`
    );

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
    } finally {
      if (fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch {}
      }
    }
  }

  /**
   * Executes a model security scan on a target path or remote Hugging Face repository ID.
   */
  public async scanTarget(
    targetPathOrRepoId: string,
    options?: { isRemote?: boolean; deep?: boolean }
  ): Promise<ModelScanSummary> {
    const pythonPath = await this.pythonService.getPythonPath();
    const config = vscode.workspace.getConfiguration('llmSecurity');
    const isDeep = options?.deep ?? config.get<boolean>('deepWeightSampling', false);

    // Create temporary file for SARIF output
    const tempDir = os.tmpdir();
    const sarifFile = path.join(tempDir, `llm_scan_${Date.now()}.sarif`);
    const jsonFile = path.join(tempDir, `llm_scan_${Date.now()}.json`);

    // Prepare CLI flags
    const flags: string[] = [
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
    } else {
      flags.push('--fast');
    }

    const startTime = Date.now();
    const cmd = `"${pythonPath}" ${flags.join(' ')}`;

    try {
      await execAsync(cmd);
    } catch (err: any) {
      // Non-zero exit code might occur if findings exceeded max severity, but SARIF is still generated
    }

    const durationSeconds = (Date.now() - startTime) / 1000;

    // Parse SARIF report
    let findings: SecurityFinding[] = [];
    if (fs.existsSync(sarifFile)) {
      try {
        const sarifRaw = fs.readFileSync(sarifFile, 'utf-8');
        const sarif: SarifReport = JSON.parse(sarifRaw);
        findings = this.parseSarifFindings(sarif, targetPathOrRepoId);
        fs.unlinkSync(sarifFile);
      } catch (e) {
        console.error('Error parsing SARIF report:', e);
      }
    }

    // Clean up temporary files
    if (fs.existsSync(jsonFile)) {
      try {
        fs.unlinkSync(jsonFile);
      } catch {}
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
  public async verifyTarget(
    targetPathOrRepoId: string,
    isRemote: boolean = false
  ): Promise<string> {
    const pythonPath = await this.pythonService.getPythonPath();
    const tempHtml = path.join(os.tmpdir(), `llm_proof_${Date.now()}.html`);

    const flags: string[] = [
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

  private parseSarifFindings(
    sarif: SarifReport,
    fallbackPath: string
  ): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    if (!sarif.runs || sarif.runs.length === 0) {
      return findings;
    }

    const run = sarif.runs[0];
    const rulesMap = new Map<string, any>();
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
      let lineNumber: number | undefined;

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

  private mapSarifLevel(level: string): Severity {
    switch (level.toLowerCase()) {
      case 'error':
        return Severity.HIGH;
      case 'warning':
        return Severity.MEDIUM;
      case 'note':
        return Severity.LOW;
      default:
        return Severity.HIGH;
    }
  }

  private computeRiskScore(findings: SecurityFinding[]): number {
    let score = 0;
    for (const f of findings) {
      if (f.severity === Severity.CRITICAL) {
        score += 35;
      } else if (f.severity === Severity.HIGH) {
        score += 20;
      } else if (f.severity === Severity.MEDIUM) {
        score += 10;
      } else if (f.severity === Severity.LOW) {
        score += 3;
      }
    }
    return Math.min(100, score);
  }

  private computeVerdict(findings: SecurityFinding[], score: number): SecurityVerdict {
    if (findings.some((f) => f.severity === Severity.CRITICAL)) {
      return SecurityVerdict.CRITICAL;
    }
    if (findings.some((f) => f.severity === Severity.HIGH) || score >= 40) {
      return SecurityVerdict.HIGH_RISK;
    }
    if (findings.some((f) => f.severity === Severity.MEDIUM) || score >= 20) {
      return SecurityVerdict.MEDIUM_RISK;
    }
    if (findings.length > 0 || score > 0) {
      return SecurityVerdict.LOW_RISK;
    }
    return SecurityVerdict.SAFE;
  }
}
