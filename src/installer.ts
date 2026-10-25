import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PythonEnvironmentService } from './pythonEnvironment';

const execAsync = promisify(exec);

export class ScannerInstaller {
  constructor(private pythonService: PythonEnvironmentService) {}

  /**
   * Prompts the user to install the scanner if it's missing from the active environment.
   */
  public async ensureInstalled(): Promise<boolean> {
    const envInfo = await this.pythonService.checkScannerInstalled();
    if (envInfo.isScannerInstalled) {
      return true;
    }

    const choice = await vscode.window.showWarningMessage(
      `LLM Model Security Scanner (llm-scan) is not installed in Python (${path.basename(
        envInfo.path
      )}). Install now to enable real-time model auditing?`,
      'Install with pip',
      'Select Interpreter',
      'Later'
    );

    if (choice === 'Install with pip') {
      return await this.installScanner(envInfo.path);
    } else if (choice === 'Select Interpreter') {
      await vscode.commands.executeCommand('python.setInterpreter');
      return await this.ensureInstalled();
    }

    return false;
  }

  /**
   * Installs the scanner package using pip into the specified Python interpreter.
   * Priority: Local Workspace -> PyPI -> Direct GitHub Repository.
   */
  public async installScanner(pythonPath: string): Promise<boolean> {
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Installing LLM Model Security Scanner...',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: 'Running pip install in active environment...' });

        // 1. Check if local development workspace contains pyproject.toml
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          const rootPath = workspaceFolders[0].uri.fsPath;
          const pyprojectPath = path.join(rootPath, 'pyproject.toml');
          const parentPyproject = path.join(rootPath, '..', 'pyproject.toml');

          try {
            if (fs.existsSync(pyprojectPath)) {
              await execAsync(`"${pythonPath}" -m pip install -e "${rootPath}"`);
              vscode.window.showInformationMessage(
                'LLM Model Security Scanner installed from local workspace! 🛡️'
              );
              return true;
            } else if (fs.existsSync(parentPyproject)) {
              await execAsync(`"${pythonPath}" -m pip install -e "${path.join(rootPath, '..')}"`);
              vscode.window.showInformationMessage(
                'LLM Model Security Scanner installed from local workspace! 🛡️'
              );
              return true;
            }
          } catch (e) {
            console.warn('Local editable pip install failed, falling back to remote...', e);
          }
        }

        // 2. Try PyPI package first; fallback to GitHub repository directly
        try {
          try {
            await execAsync(`"${pythonPath}" -m pip install llm-model-security-scanner`);
          } catch {
            // Fallback to official GitHub repository
            progress.report({ message: 'Installing from GitHub repository...' });
            await execAsync(
              `"${pythonPath}" -m pip install "git+https://github.com/mesutgungor/llm-model-security-scanner.git"`
            );
          }

          vscode.window.showInformationMessage(
            'LLM Model Security Scanner successfully installed and activated! 🛡️'
          );
          return true;
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Failed to install scanner: ${error?.message || error}`
          );
          return false;
        }
      }
    );
  }
}
