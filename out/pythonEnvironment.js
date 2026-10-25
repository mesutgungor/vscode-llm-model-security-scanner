"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PythonEnvironmentService = void 0;
const vscode = require("vscode");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class PythonEnvironmentService {
    /**
     * Resolves the active Python interpreter path.
     * Priority: User Setting -> Microsoft Python Extension -> System Fallback (python3)
     */
    async getPythonPath() {
        // 1. User specified path in settings
        const config = vscode.workspace.getConfiguration('llmSecurity');
        const customPath = config.get('pythonPath');
        if (customPath && customPath.trim().length > 0) {
            return customPath.trim();
        }
        // 2. Query official Microsoft Python Extension
        const pythonExtension = vscode.extensions.getExtension('ms-python.python');
        if (pythonExtension) {
            if (!pythonExtension.isActive) {
                try {
                    await pythonExtension.activate();
                }
                catch {
                    // Ignore activation failure
                }
            }
            const api = pythonExtension.exports;
            if (api && api.environments) {
                const activeEnv = await api.environments.getActiveEnvironmentPath();
                if (activeEnv && activeEnv.path) {
                    return activeEnv.path;
                }
            }
        }
        // 3. Fallback to system python3 or python
        return 'python3';
    }
    /**
     * Probes the Python environment to check if llm_security_scanner is available.
     */
    async checkScannerInstalled(pythonPath) {
        const py = pythonPath || (await this.getPythonPath());
        try {
            const { stdout } = await execAsync(`"${py}" -c "import llm_security_scanner; print('INSTALLED')"`);
            if (stdout.includes('INSTALLED')) {
                return {
                    path: py,
                    isScannerInstalled: true,
                    version: '1.0.0',
                };
            }
        }
        catch {
            // Failed to import module
        }
        return {
            path: py,
            isScannerInstalled: false,
        };
    }
}
exports.PythonEnvironmentService = PythonEnvironmentService;
//# sourceMappingURL=pythonEnvironment.js.map