const hre = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("Deploying Layer 2 Security Demonstration Contracts...\n");

    // Get deployer
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

    // Deploy Vulnerable Contracts
    console.log("Deploying Vulnerable Contracts for demonstration...");
    
    const VulnerableL2Bridge = await hre.ethers.getContractFactory("VulnerableL2Bridge");
    const vulnerableBridge = await VulnerableL2Bridge.deploy();
    await vulnerableBridge.waitForDeployment();
    console.log("VulnerableL2Bridge deployed to:", await vulnerableBridge.getAddress());

    const VulnerableBank = await hre.ethers.getContractFactory("VulnerableBank");
    const vulnerableBank = await VulnerableBank.deploy();
    await vulnerableBank.waitForDeployment();
    console.log("VulnerableBank deployed to:", await vulnerableBank.getAddress());

    const VulnerableDEX = await hre.ethers.getContractFactory("VulnerableDEX");
    const vulnerableDEX = await VulnerableDEX.deploy();
    await vulnerableDEX.waitForDeployment();
    console.log("VulnerableDEX deployed to:", await vulnerableDEX.getAddress());

    // Deploy Secure Contracts
    console.log("\nDeploying Secure Contracts...");
    
    const SecureL2Bridge = await hre.ethers.getContractFactory("SecureL2Bridge");
    const secureBridge = await SecureL2Bridge.deploy();
    await secureBridge.waitForDeployment();
    console.log("SecureL2Bridge deployed to:", await secureBridge.getAddress());

    const SecureBank = await hre.ethers.getContractFactory("SecureBank");
    const secureBank = await SecureBank.deploy();
    await secureBank.waitForDeployment();
    console.log("SecureBank deployed to:", await secureBank.getAddress());

    const SecureDEX = await hre.ethers.getContractFactory("SecureDEX");
    const secureDEX = await SecureDEX.deploy();
    await secureDEX.waitForDeployment();
    console.log("SecureDEX deployed to:", await secureDEX.getAddress());

    // Save deployment addresses
    const fs = require('fs');
    const deploymentInfo = {
        network: hre.network.name,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        vulnerable: {
            bridge: await vulnerableBridge.getAddress(),
            bank: await vulnerableBank.getAddress(),
            dex: await vulnerableDEX.getAddress()
        },
        secure: {
            bridge: await secureBridge.getAddress(),
            bank: await secureBank.getAddress(),
            dex: await secureDEX.getAddress()
        }
    };

    fs.writeFileSync(
        'deployment-addresses.json',
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log("\nDeployment info saved to deployment-addresses.json");
    console.log("\nDeployment complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
