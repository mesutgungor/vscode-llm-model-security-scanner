/**
 * Data structures for LLM Model Security Scanner VS Code Extension.
 */

export enum Severity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  INFO = 'INFO',
}

export enum SecurityVerdict {
  SAFE = 'SAFE',
  LOW_RISK = 'LOW_RISK',
  MEDIUM_RISK = 'MEDIUM_RISK',
  HIGH_RISK = 'HIGH_RISK',
  CRITICAL = 'CRITICAL',
}

export interface SecurityFinding {
  ruleId: string;
  severity: Severity;
  title: string;
  description: string;
  filePath: string;
  lineNumber?: number;
  evidence?: string;
  remediation?: string;
  cweId?: string;
  owaspId?: string;
  mitreAtlasId?: string;
  euAiActArticle?: string;
}

export interface ModelScanSummary {
  target: string;
  verdict: SecurityVerdict;
  riskScore: number;
  scannedFilesCount: number;
  totalBytesScanned: number;
  durationSeconds: number;
  findings: SecurityFinding[];
  architecture?: string;
  weightFormats: string[];
}

export interface SarifLocation {
  physicalLocation?: {
    artifactLocation?: {
      uri?: string;
    };
    region?: {
      startLine?: number;
      startColumn?: number;
      endLine?: number;
      endColumn?: number;
    };
  };
}

export interface SarifResult {
  ruleId: string;
  level?: string;
  message: {
    text: string;
  };
  locations?: SarifLocation[];
  properties?: {
    category?: string;
    evidence?: string;
    remediation?: string;
    cweId?: string;
    riskScore?: number;
  };
}

export interface SarifReport {
  version: string;
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version: string;
        rules?: Array<{
          id: string;
          name: string;
          shortDescription?: { text: string };
          fullDescription?: { text: string };
          defaultConfiguration?: { level: string };
        }>;
      };
    };
    results: SarifResult[];
  }>;
}
