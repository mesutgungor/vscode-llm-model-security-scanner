import * as vscode from 'vscode';
import { ModelScanSummary, SecurityVerdict } from './models';

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'workbench.view.extension.llm-security-explorer';
    this.statusBarItem.text = '$(shield) Model Security';
    this.statusBarItem.tooltip = 'Click to open LLM Model Security Explorer';
    this.statusBarItem.show();
  }

  public updateSummary(summary: ModelScanSummary): void {
    const verdict = summary.verdict;
    const score = summary.riskScore;

    if (verdict === SecurityVerdict.SAFE) {
      this.statusBarItem.text = `$(shield) Model: SAFE (${score}/100)`;
      this.statusBarItem.backgroundColor = undefined;
    } else if (verdict === SecurityVerdict.LOW_RISK || verdict === SecurityVerdict.MEDIUM_RISK) {
      this.statusBarItem.text = `$(warning) Model: ${verdict} (${score}/100)`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
    } else {
      this.statusBarItem.text = `$(alert) Model: ${verdict} (${score}/100)`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.errorBackground'
      );
    }

    this.statusBarItem.tooltip = `LLM Model Security Verdict: ${verdict}\nRisk Score: ${score}/100\nTotal Findings: ${summary.findings.length}\nClick to view details.`;
  }

  public showScanning(): void {
    this.statusBarItem.text = '$(sync~spin) Scanning Model...';
    this.statusBarItem.backgroundColor = undefined;
  }

  public reset(): void {
    this.statusBarItem.text = '$(shield) Model Security';
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.tooltip = 'Click to open LLM Model Security Explorer';
  }

  public dispose(): void {
    this.statusBarItem.dispose();
  }
}
