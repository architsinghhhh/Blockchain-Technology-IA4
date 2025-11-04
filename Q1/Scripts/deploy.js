const hre = require("hardhat");

async function main() {
  console.log("🚀 Starting deployment of the SupplyChain contract...\n");

  // Retrieve the contract factory
  const SupplyChainFactory = await hre.ethers.getContractFactory("SupplyChain");

  // Deploy the contract
  const supplyChainContract = await SupplyChainFactory.deploy();
  await supplyChainContract.waitForDeployment();

  // Fetch deployed address
  const deployedAddress = await supplyChainContract.getAddress();
  console.log(`✅ SupplyChain Contract successfully deployed at: ${deployedAddress}\n`);

  // Retrieve deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer Information:");
  console.log(`   Address: ${deployer.address}`);
  console.log(`   Role: Admin\n`);

  return deployedAddress;
}

// Execute deployment and handle errors
main()
  .then(() => {
    console.log("🎯 Deployment completed successfully!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Deployment failed:", err.message);
    process.exit(1);
  });

module.exports = main;
