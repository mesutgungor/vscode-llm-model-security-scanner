import * as vscode from 'vscode';
import * as path from 'path';
import { ModelScanSummary, SecurityFinding, SecurityVerdict, Severity } from './models';

export class FindingsTreeProvider
  implements vscode.TreeDataProvider<TreeItemNode>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    TreeItemNode | undefined | null | void
  > = new vscode.EventEmitter<TreeItemNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    TreeItemNode | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private currentSummary?: ModelScanSummary;

  public setSummary(summary: ModelScanSummary): void {
    this.currentSummary = summary;
    this._onDidChangeTreeData.fire();
  }

  public clear(): void {
    this.currentSummary = undefined;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItemNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItemNode): Thenable<TreeItemNode[]> {
    if (!this.currentSummary) {
      const empty = new TreeItemNode(
        'No scan results yet (Click "Scan Workspace Models" to begin)',
        vscode.TreeItemCollapsibleState.None
      );
      empty.iconPath = new vscode.ThemeIcon('info');
      return Promise.resolve([empty]);
    }

    if (!element) {
      // Root level: Summary node + Severity groups
      const nodes: TreeItemNode[] = [];

      // 1. Summary status node
      const summaryNode = new TreeItemNode(
        `Verdict: ${this.currentSummary.verdict} (Risk: ${this.currentSummary.riskScore}/100)`,
        vscode.TreeItemCollapsibleState.None
      );
      summaryNode.description = path.basename(this.currentSummary.target);
      summaryNode.iconPath = this.getVerdictIcon(this.currentSummary.verdict);
      nodes.push(summaryNode);

      // 2. Group findings by severity
      const severities = [
        Severity.CRITICAL,
        Severity.HIGH,
        Severity.MEDIUM,
        Severity.LOW,
      ];

      for (const sev of severities) {
        const matches = this.currentSummary.findings.filter(
          (f) => f.severity === sev
        );
        if (matches.length > 0) {
          const groupNode = new TreeItemNode(
            `${sev} (${matches.length})`,
            vscode.TreeItemCollapsibleState.Expanded,
            'severityGroup',
            undefined,
            matches
          );
          groupNode.iconPath = this.getSeverityIcon(sev);
          nodes.push(groupNode);
        }
      }

      if (this.currentSummary.findings.length === 0) {
        const cleanNode = new TreeItemNode(
          '✅ Zero vulnerabilities detected. Model verified safe for loading.',
          vscode.TreeItemCollapsibleState.None
        );
        nodes.push(cleanNode);
      }

      return Promise.resolve(nodes);
    }

    if (element.contextValue === 'severityGroup' && element.findings) {
      // Child nodes: Individual findings
      const itemNodes = element.findings.map((f) => {
        const item = new TreeItemNode(
          `[${f.ruleId}] ${f.title}`,
          vscode.TreeItemCollapsibleState.None,
          'findingItem',
          f
        );
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
                selection: new vscode.Range(
                  Math.max(0, (f.lineNumber || 1) - 1),
                  0,
                  Math.max(0, (f.lineNumber || 1) - 1),
                  100
                ),
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

  private resolveUri(filePath: string): vscode.Uri | undefined {
    if (path.isAbsolute(filePath)) {
      return vscode.Uri.file(filePath);
    }
    const wf = vscode.workspace.workspaceFolders;
    if (wf && wf.length > 0) {
      return vscode.Uri.file(path.join(wf[0].uri.fsPath, filePath));
    }
    return undefined;
  }

  private getVerdictIcon(verdict: SecurityVerdict): vscode.ThemeIcon {
    switch (verdict) {
      case SecurityVerdict.SAFE:
      case SecurityVerdict.LOW_RISK:
        return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
      case SecurityVerdict.MEDIUM_RISK:
        return new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
      case SecurityVerdict.HIGH_RISK:
      case SecurityVerdict.CRITICAL:
      default:
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('editorError.foreground'));
    }
  }

  private getSeverityIcon(sev: Severity): vscode.ThemeIcon {
    switch (sev) {
      case Severity.CRITICAL:
      case Severity.HIGH:
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('editorError.foreground'));
      case Severity.MEDIUM:
        return new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
      case Severity.LOW:
      default:
        return new vscode.ThemeIcon('info', new vscode.ThemeColor('editorInfo.foreground'));
    }
  }
}

export class TreeItemNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue?: string,
    public readonly finding?: SecurityFinding,
    public readonly findings?: SecurityFinding[]
  ) {
    super(label, collapsibleState);
  }
}
