"use strict";
/**
 * Data structures for LLM Model Security Scanner VS Code Extension.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityVerdict = exports.Severity = void 0;
var Severity;
(function (Severity) {
    Severity["CRITICAL"] = "CRITICAL";
    Severity["HIGH"] = "HIGH";
    Severity["MEDIUM"] = "MEDIUM";
    Severity["LOW"] = "LOW";
    Severity["INFO"] = "INFO";
})(Severity || (exports.Severity = Severity = {}));
var SecurityVerdict;
(function (SecurityVerdict) {
    SecurityVerdict["SAFE"] = "SAFE";
    SecurityVerdict["LOW_RISK"] = "LOW_RISK";
    SecurityVerdict["MEDIUM_RISK"] = "MEDIUM_RISK";
    SecurityVerdict["HIGH_RISK"] = "HIGH_RISK";
    SecurityVerdict["CRITICAL"] = "CRITICAL";
})(SecurityVerdict || (exports.SecurityVerdict = SecurityVerdict = {}));
//# sourceMappingURL=models.js.map