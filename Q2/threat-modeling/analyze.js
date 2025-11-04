const fs = require('fs');
const path = require('path');

/**
 * Threat Model Analyzer
 * Processes and analyzes the threat model data
 */
class ThreatAnalyzer {
    constructor(threatModelPath) {
        this.threatModel = JSON.parse(
            fs.readFileSync(threatModelPath, 'utf8')
        ).threatModel;
    }

    /**
     * Generate summary statistics
     */
    generateStatistics() {
        const threats = this.threatModel.threats;
        
        const stats = {
            totalThreats: threats.length,
            bySeverity: {},
            byLayer: {},
            byStrideCategory: {
                spoofing: 0,
                tampering: 0,
                repudiation: 0,
                informationDisclosure: 0,
                denialOfService: 0,
                elevationOfPrivilege: 0
            },
            totalMitigations: 0,
            implementedMitigations: 0,
            mitigationEffectiveness: {
                HIGH: 0,
                MEDIUM: 0,
                LOW: 0
            }
        };

        threats.forEach(threat => {
            // Count by severity
            stats.bySeverity[threat.severity] = 
                (stats.bySeverity[threat.severity] || 0) + 1;
            
            // Count by layer
            stats.byLayer[threat.layer] = 
                (stats.byLayer[threat.layer] || 0) + 1;
            
            // Count STRIDE categories
            Object.keys(threat.stride).forEach(category => {
                if (threat.stride[category]) {
                    stats.byStrideCategory[category]++;
                }
            });

            // Count mitigations
            threat.mitigations.forEach(mitigation => {
                stats.totalMitigations++;
                if (mitigation.implemented) {
                    stats.implementedMitigations++;
                }
                stats.mitigationEffectiveness[mitigation.effectiveness]++;
            });
        });

        return stats;
    }

    /**
     * Generate risk assessment report
     */
    generateRiskAssessment() {
        const threats = this.threatModel.threats;
        const riskLevels = {
            CRITICAL: [],
            HIGH: [],
            MEDIUM: [],
            LOW: []
        };

        threats.forEach(threat => {
            const riskScore = this.calculateRiskScore(threat);
            const riskData = {
                id: threat.id,
                threat: threat.threat,
                layer: threat.layer,
                severity: threat.severity,
                residualRisk: threat.residualRisk,
                riskScore: riskScore
            };

            if (threat.severity === 'CRITICAL' || riskScore >= 9) {
                riskLevels.CRITICAL.push(riskData);
            } else if (threat.severity === 'HIGH' || riskScore >= 6) {
                riskLevels.HIGH.push(riskData);
            } else if (threat.severity === 'MEDIUM' || riskScore >= 3) {
                riskLevels.MEDIUM.push(riskData);
            } else {
                riskLevels.LOW.push(riskData);
            }
        });

        return riskLevels;
    }

    /**
     * Calculate risk score (likelihood * impact)
     */
    calculateRiskScore(threat) {
        const likelihoodMap = {
            'VERY HIGH': 5,
            'HIGH': 4,
            'MEDIUM': 3,
            'LOW': 2,
            'VERY LOW': 1
        };

        const impactMap = {
            'CRITICAL': 5,
            'HIGH': 4,
            'MEDIUM': 3,
            'LOW': 2,
            'VERY LOW': 1
        };

        const likelihood = likelihoodMap[threat.likelihood] || 3;
        const impact = impactMap[threat.impact] || 3;

        return likelihood * impact;
    }

    /**
     * Generate mitigation status report
     */
    generateMitigationReport() {
        const report = {
            implemented: [],
            pending: [],
            byThreat: {}
        };

        this.threatModel.threats.forEach(threat => {
            report.byThreat[threat.id] = {
                threat: threat.threat,
                totalMitigations: threat.mitigations.length,
                implemented: 0,
                pending: 0,
                effectiveness: []
            };

            threat.mitigations.forEach(mitigation => {
                if (mitigation.implemented) {
                    report.implemented.push({
                        threatId: threat.id,
                        mitigationId: mitigation.id,
                        strategy: mitigation.strategy,
                        effectiveness: mitigation.effectiveness
                    });
                    report.byThreat[threat.id].implemented++;
                } else {
                    report.pending.push({
                        threatId: threat.id,
                        mitigationId: mitigation.id,
                        strategy: mitigation.strategy,
                        cost: mitigation.cost
                    });
                    report.byThreat[threat.id].pending++;
                }
                report.byThreat[threat.id].effectiveness.push(
                    mitigation.effectiveness
                );
            });
        });

        return report;
    }

    /**
     * Generate compliance checklist
     */
    generateComplianceChecklist() {
        return {
            securityControls: [
                {
                    control: 'Authentication & Authorization',
                    status: 'IMPLEMENTED',
                    evidence: 'Role-based access control in SecureL2Bridge',
                    threats: ['T005']
                },
                {
                    control: 'Input Validation',
                    status: 'IMPLEMENTED',
                    evidence: 'Require statements throughout all contracts',
                    threats: ['T001', 'T002', 'T003', 'T006']
                },
                {
                    control: 'State Management',
                    status: 'IMPLEMENTED',
                    evidence: 'Checks-Effects-Interactions pattern in SecureBank',
                    threats: ['T002']
                },
                {
                    control: 'Cryptographic Verification',
                    status: 'IMPLEMENTED',
                    evidence: 'Merkle proof verification in SecureL2Bridge',
                    threats: ['T001']
                },
                {
                    control: 'Rate Limiting',
                    status: 'IMPLEMENTED',
                    evidence: 'Transaction rate limiting in SecureDEX',
                    threats: ['T003']
                },
                {
                    control: 'Slippage Protection',
                    status: 'IMPLEMENTED',
                    evidence: 'Minimum output validation in SecureDEX',
                    threats: ['T003']
                },
                {
                    control: 'Emergency Controls',
                    status: 'IMPLEMENTED',
                    evidence: 'Pause functionality in SecureL2Bridge',
                    threats: ['ALL']
                },
                {
                    control: 'Audit Logging',
                    status: 'PARTIAL',
                    evidence: 'Events emitted for key operations',
                    threats: ['ALL']
                }
            ],
            recommendations: this.threatModel.recommendations
        };
    }

    /**
     * Export comprehensive analysis
     */
    exportAnalysis(outputPath) {
        const analysis = {
            metadata: {
                generatedAt: new Date().toISOString(),
                modelVersion: this.threatModel.metadata.version
            },
            statistics: this.generateStatistics(),
            riskAssessment: this.generateRiskAssessment(),
            mitigationStatus: this.generateMitigationReport(),
            complianceChecklist: this.generateComplianceChecklist(),
            summary: this.generateExecutiveSummary()
        };

        fs.writeFileSync(
            outputPath,
            JSON.stringify(analysis, null, 2)
        );

        return analysis;
    }

    /**
     * Generate executive summary
     */
    generateExecutiveSummary() {
        const stats = this.generateStatistics();
        const risks = this.generateRiskAssessment();
        const mitigations = this.generateMitigationReport();

        const implementationRate = 
            (stats.implementedMitigations / stats.totalMitigations * 100).toFixed(1);

        return {
            overview: `Analysis of ${stats.totalThreats} identified threats across ` +
                     `Layer 2 blockchain security layers`,
            criticalFindings: risks.CRITICAL.length,
            highRiskFindings: risks.HIGH.length,
            mitigationProgress: `${implementationRate}% of mitigations implemented`,
            readinessAssessment: this.assessReadiness(implementationRate, risks),
            keyRecommendations: this.threatModel.recommendations
                .filter(r => r.priority === 'CRITICAL' || r.priority === 'HIGH')
                .map(r => r.recommendation)
        };
    }

    /**
     * Assess deployment readiness
     */
    assessReadiness(implementationRate, risks) {
        if (risks.CRITICAL.length > 0) {
            return 'NOT READY - Critical vulnerabilities must be addressed';
        }
        if (implementationRate < 80) {
            return 'NOT READY - Insufficient mitigation coverage';
        }
        if (risks.HIGH.length > 2) {
            return 'CAUTION - Multiple high-risk threats remain';
        }
        if (implementationRate >= 90 && risks.HIGH.length <= 2) {
            return 'READY for testnet deployment with monitoring';
        }
        return 'REVIEW REQUIRED - Additional security measures recommended';
    }

    /**
     * Print formatted report to console
     */
    printReport() {
        console.log('\n' + '='.repeat(80));
        console.log('LAYER 2 BLOCKCHAIN SECURITY THREAT ANALYSIS REPORT');
        console.log('='.repeat(80) + '\n');

        const stats = this.generateStatistics();
        const summary = this.generateExecutiveSummary();

        console.log('EXECUTIVE SUMMARY');
        console.log('-'.repeat(80));
        console.log(`Overview: ${summary.overview}`);
        console.log(`Critical Findings: ${summary.criticalFindings}`);
        console.log(`High Risk Findings: ${summary.highRiskFindings}`);
        console.log(`Mitigation Progress: ${summary.mitigationProgress}`);
        console.log(`Readiness: ${summary.readinessAssessment}\n`);

        console.log('THREAT STATISTICS');
        console.log('-'.repeat(80));
        console.log(`Total Threats: ${stats.totalThreats}`);
        console.log('\nBy Severity:');
        Object.entries(stats.bySeverity).forEach(([severity, count]) => {
            console.log(`  ${severity}: ${count}`);
        });
        console.log('\nBy Layer:');
        Object.entries(stats.byLayer).forEach(([layer, count]) => {
            console.log(`  ${layer}: ${count}`);
        });
        console.log('\nSTRIDE Categories:');
        Object.entries(stats.byStrideCategory).forEach(([category, count]) => {
            console.log(`  ${category}: ${count}`);
        });

        console.log('\n' + '='.repeat(80) + '\n');
    }
}

// Main execution
if (require.main === module) {
    const threatModelPath = path.join(__dirname, 'threat-model.json');
    const outputPath = path.join(__dirname, 'threat-analysis-report.json');

    const analyzer = new ThreatAnalyzer(threatModelPath);
    analyzer.printReport();
    
    const analysis = analyzer.exportAnalysis(outputPath);
    console.log(`\nDetailed analysis exported to: ${outputPath}`);
}

module.exports = ThreatAnalyzer;
