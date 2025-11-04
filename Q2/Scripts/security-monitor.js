const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

/**
 * Security Monitoring System for Layer 2 Blockchain
 * Detects suspicious patterns and potential attacks
 */
class SecurityMonitor {
    constructor(contractAddress, contractABI) {
        this.contractAddress = contractAddress;
        this.contractABI = contractABI;
        this.alerts = [];
        this.transactionHistory = [];
        
        // Thresholds for anomaly detection
        this.thresholds = {
            rapidWithdrawals: 5, // Max withdrawals per minute
            largeWithdrawal: ethers.parseEther("10"), // Large withdrawal amount
            suspiciousPattern: 3, // Number of similar transactions
            priceDeviation: 10, // Percentage price change
            gasSpike: 2.0 // Gas price multiplier for front-running detection
        };
    }

    /**
     * Initialize monitoring with contract instance
     */
    async initialize() {
        this.provider = ethers.provider;
        this.contract = new ethers.Contract(
            this.contractAddress,
            this.contractABI,
            this.provider
        );
        
        console.log(`Monitoring initialized for contract: ${this.contractAddress}`);
    }

    /**
     * Monitor for double-spending attempts
     */
    async monitorDoubleSpending() {
        const withdrawalMap = new Map();
        const timeWindow = 60000; // 1 minute in milliseconds

        this.contract.on("Withdrawal", (user, amount, txHash, event) => {
            const now = Date.now();
            const key = user;

            if (!withdrawalMap.has(key)) {
                withdrawalMap.set(key, []);
            }

            const userWithdrawals = withdrawalMap.get(key);
            
            // Remove old entries outside time window
            const recentWithdrawals = userWithdrawals.filter(
                w => now - w.timestamp < timeWindow
            );

            recentWithdrawals.push({
                amount: amount.toString(),
                txHash,
                timestamp: now,
                blockNumber: event.blockNumber
            });

            withdrawalMap.set(key, recentWithdrawals);

            // Check for suspicious patterns
            if (recentWithdrawals.length >= this.thresholds.rapidWithdrawals) {
                this.createAlert({
                    type: "POTENTIAL_DOUBLE_SPENDING",
                    severity: "CRITICAL",
                    user,
                    details: `${recentWithdrawals.length} withdrawals in 1 minute`,
                    withdrawals: recentWithdrawals,
                    timestamp: new Date().toISOString()
                });
            }

            // Check for similar amounts (possible replay attack)
            const amounts = recentWithdrawals.map(w => w.amount);
            const uniqueAmounts = new Set(amounts);
            if (amounts.length - uniqueAmounts.size >= this.thresholds.suspiciousPattern) {
                this.createAlert({
                    type: "SUSPICIOUS_PATTERN",
                    severity: "HIGH",
                    user,
                    details: "Multiple withdrawals of identical amounts",
                    withdrawals: recentWithdrawals,
                    timestamp: new Date().toISOString()
                });
            }
        });

        console.log("Double-spending monitoring active");
    }

    /**
     * Monitor for reentrancy attacks
     */
    async monitorReentrancy() {
        const gasUsageMap = new Map();
        
        this.contract.on("Withdrawal", async (user, amount, event) => {
            const tx = await event.getTransaction();
            const receipt = await event.getTransactionReceipt();
            
            const gasUsed = receipt.gasUsed;
            const expectedGas = 50000n; // Normal withdrawal gas
            const gasDeviation = gasUsed / expectedGas;

            if (gasDeviation > 2n) {
                this.createAlert({
                    type: "POTENTIAL_REENTRANCY",
                    severity: "CRITICAL",
                    user,
                    details: `Abnormal gas usage: ${gasUsed.toString()} (${gasDeviation}x expected)`,
                    txHash: tx.hash,
                    gasUsed: gasUsed.toString(),
                    timestamp: new Date().toISOString()
                });
            }

            // Monitor for recursive calls
            const logs = receipt.logs;
            const withdrawalEvents = logs.filter(log => 
                log.topics[0] === this.contract.interface.getEvent("Withdrawal").topicHash
            );

            if (withdrawalEvents.length > 1) {
                this.createAlert({
                    type: "MULTIPLE_WITHDRAWALS_IN_TX",
                    severity: "CRITICAL",
                    user,
                    details: `${withdrawalEvents.length} withdrawal events in single transaction`,
                    txHash: tx.hash,
                    timestamp: new Date().toISOString()
                });
            }
        });

        console.log("Reentrancy monitoring active");
    }

    /**
     * Monitor for front-running attacks
     */
    async monitorFrontRunning() {
        const pendingTxMap = new Map();
        
        // Monitor pending transactions (mempool)
        this.provider.on("pending", async (txHash) => {
            try {
                const tx = await this.provider.getTransaction(txHash);
                
                if (!tx || tx.to !== this.contractAddress) return;

                const now = Date.now();
                const gasPriceGwei = ethers.formatUnits(tx.gasPrice || 0n, "gwei");

                // Check for suspicious gas price patterns
                const avgGasPrice = await this.getAverageGasPrice();
                const gasMultiplier = parseFloat(gasPriceGwei) / avgGasPrice;

                if (gasMultiplier > this.thresholds.gasSpike) {
                    // Check if there are similar pending transactions with lower gas
                    const similarTxs = Array.from(pendingTxMap.values()).filter(
                        t => t.to === tx.to && 
                        parseFloat(t.gasPrice) < parseFloat(gasPriceGwei) &&
                        now - t.timestamp < 10000 // Within 10 seconds
                    );

                    if (similarTxs.length > 0) {
                        this.createAlert({
                            type: "POTENTIAL_FRONT_RUNNING",
                            severity: "HIGH",
                            details: `Transaction with ${gasMultiplier.toFixed(2)}x average gas price`,
                            txHash,
                            gasPrice: gasPriceGwei,
                            avgGasPrice: avgGasPrice.toFixed(2),
                            similarTxs: similarTxs.length,
                            timestamp: new Date().toISOString()
                        });
                    }
                }

                pendingTxMap.set(txHash, {
                    to: tx.to,
                    gasPrice: gasPriceGwei,
                    timestamp: now
                });

                // Cleanup old entries
                for (const [hash, data] of pendingTxMap) {
                    if (now - data.timestamp > 60000) {
                        pendingTxMap.delete(hash);
                    }
                }
            } catch (error) {
                // Transaction might have been mined already
            }
        });

        console.log("Front-running monitoring active");
    }

    /**
     * Monitor for price manipulation
     */
    async monitorPriceManipulation() {
        let lastPrice = 0n;
        let priceHistory = [];

        this.contract.on("Swap", async (user, amountIn, amountOut, isAToB, event) => {
            try {
                const currentPrice = await this.contract.getPrice();
                
                if (lastPrice > 0n) {
                    const priceChange = Number(currentPrice - lastPrice) / Number(lastPrice) * 100;
                    
                    if (Math.abs(priceChange) > this.thresholds.priceDeviation) {
                        this.createAlert({
                            type: "PRICE_MANIPULATION",
                            severity: "HIGH",
                            user,
                            details: `Price changed ${priceChange.toFixed(2)}% in single swap`,
                            lastPrice: ethers.formatEther(lastPrice),
                            currentPrice: ethers.formatEther(currentPrice),
                            amountIn: ethers.formatEther(amountIn),
                            amountOut: ethers.formatEther(amountOut),
                            timestamp: new Date().toISOString()
                        });
                    }
                }

                priceHistory.push({
                    price: currentPrice,
                    timestamp: Date.now(),
                    user
                });

                // Keep last 100 prices
                if (priceHistory.length > 100) {
                    priceHistory.shift();
                }

                lastPrice = currentPrice;
            } catch (error) {
                console.error("Error monitoring price:", error);
            }
        });

        console.log("Price manipulation monitoring active");
    }

    /**
     * Monitor for large or unusual transactions
     */
    async monitorLargeTransactions() {
        this.contract.on("Deposit", (user, amount, event) => {
            if (amount >= this.thresholds.largeWithdrawal) {
                this.createAlert({
                    type: "LARGE_DEPOSIT",
                    severity: "MEDIUM",
                    user,
                    amount: ethers.formatEther(amount),
                    details: "Large deposit detected",
                    blockNumber: event.blockNumber,
                    timestamp: new Date().toISOString()
                });
            }
        });

        this.contract.on("Withdrawal", (user, amount, event) => {
            if (amount >= this.thresholds.largeWithdrawal) {
                this.createAlert({
                    type: "LARGE_WITHDRAWAL",
                    severity: "HIGH",
                    user,
                    amount: ethers.formatEther(amount),
                    details: "Large withdrawal detected - may require additional verification",
                    blockNumber: event.blockNumber,
                    timestamp: new Date().toISOString()
                });
            }
        });

        console.log("Large transaction monitoring active");
    }

    /**
     * Get average gas price
     */
    async getAverageGasPrice() {
        const feeData = await this.provider.getFeeData();
        return parseFloat(ethers.formatUnits(feeData.gasPrice || 0n, "gwei"));
    }

    /**
     * Create security alert
     */
    createAlert(alert) {
        this.alerts.push(alert);
        
        console.log("\n" + "=".repeat(80));
        console.log(`SECURITY ALERT: ${alert.type}`);
        console.log(`Severity: ${alert.severity}`);
        console.log(`Details: ${alert.details}`);
        if (alert.user) console.log(`User: ${alert.user}`);
        console.log(`Time: ${alert.timestamp}`);
        console.log("=".repeat(80) + "\n");

        // Save to file
        this.saveAlerts();

        // In production, trigger notifications (email, SMS, webhook, etc.)
        this.triggerNotification(alert);
    }

    /**
     * Save alerts to file
     */
    saveAlerts() {
        const alertsPath = path.join(__dirname, '../logs/security-alerts.json');
        const logsDir = path.dirname(alertsPath);
        
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        fs.writeFileSync(
            alertsPath,
            JSON.stringify(this.alerts, null, 2)
        );
    }

    /**
     * Trigger notification (placeholder for production integration)
     */
    triggerNotification(alert) {
        // In production, integrate with:
        // - Email service (SendGrid, AWS SES)
        // - SMS service (Twilio)
        // - Webhooks (Slack, Discord, PagerDuty)
        // - Monitoring platforms (DataDog, New Relic)
        
        console.log(`[NOTIFICATION] Alert ${alert.type} would be sent to security team`);
    }

    /**
     * Generate monitoring report
     */
    generateReport() {
        const report = {
            generatedAt: new Date().toISOString(),
            totalAlerts: this.alerts.length,
            alertsBySeverity: {
                CRITICAL: this.alerts.filter(a => a.severity === "CRITICAL").length,
                HIGH: this.alerts.filter(a => a.severity === "HIGH").length,
                MEDIUM: this.alerts.filter(a => a.severity === "MEDIUM").length,
                LOW: this.alerts.filter(a => a.severity === "LOW").length
            },
            alertsByType: {},
            recentAlerts: this.alerts.slice(-10)
        };

        this.alerts.forEach(alert => {
            report.alertsByType[alert.type] = 
                (report.alertsByType[alert.type] || 0) + 1;
        });

        return report;
    }

    /**
     * Start all monitoring
     */
    async startMonitoring() {
        await this.initialize();
        
        console.log("\nStarting comprehensive security monitoring...\n");
        
        await this.monitorDoubleSpending();
        await this.monitorReentrancy();
        await this.monitorFrontRunning();
        await this.monitorPriceManipulation();
        await this.monitorLargeTransactions();
        
        console.log("\nAll monitoring systems active\n");
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        this.contract.removeAllListeners();
        this.provider.removeAllListeners("pending");
        console.log("Monitoring stopped");
    }
}

module.exports = SecurityMonitor;

// Example usage
if (require.main === module) {
    async function main() {
        // Example: Monitor SecureL2Bridge
        const contractAddress = "0x..."; // Replace with actual deployed address
        const contractABI = []; // Replace with actual ABI

        const monitor = new SecurityMonitor(contractAddress, contractABI);
        await monitor.startMonitoring();

        // Run for 24 hours then generate report
        setTimeout(() => {
            const report = monitor.generateReport();
            console.log("\n24-Hour Monitoring Report:");
            console.log(JSON.stringify(report, null, 2));
            monitor.stopMonitoring();
        }, 24 * 60 * 60 * 1000);
    }

    main().catch(console.error);
}
