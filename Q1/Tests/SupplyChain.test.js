const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("🧱 SupplyChain Smart Contract", function () {
  let supplyChain;
  let admin, manufacturer, distributor, retailer, outsider;

  // Enum-like constants
  const Role = Object.freeze({
    NONE: 0,
    MANUFACTURER: 1,
    DISTRIBUTOR: 2,
    RETAILER: 3
  });

  const ShipmentStatus = Object.freeze({
    CREATED: 0,
    IN_TRANSIT: 1,
    RECEIVED: 2
  });

  beforeEach(async function () {
    [admin, manufacturer, distributor, retailer, outsider] = await ethers.getSigners();
    const SupplyChainFactory = await ethers.getContractFactory("SupplyChain");
    supplyChain = await SupplyChainFactory.deploy();
    await supplyChain.waitForDeployment();
  });

  // -------------------------------
  // ✅ Deployment Tests
  // -------------------------------
  describe("Deployment", function () {
    it("Sets correct admin", async function () {
      expect(await supplyChain.admin()).to.equal(admin.address);
    });

    it("Initializes product and shipment counters to zero", async function () {
      expect(await supplyChain.productCounter()).to.equal(0);
      expect(await supplyChain.shipmentCounter()).to.equal(0);
    });
  });

  // -------------------------------
  // 🧍 Participant Registration
  // -------------------------------
  describe("Participant Registration", function () {
    it("Allows admin to register a manufacturer", async function () {
      await expect(
        supplyChain.registerParticipant(manufacturer.address, "ABC Manufacturing", Role.MANUFACTURER)
      )
        .to.emit(supplyChain, "ParticipantRegistered")
        .withArgs(manufacturer.address, "ABC Manufacturing", Role.MANUFACTURER);

      const participant = await supplyChain.getParticipant(manufacturer.address);
      expect(participant.name).to.equal("ABC Manufacturing");
      expect(participant.role).to.equal(Role.MANUFACTURER);
      expect(participant.isRegistered).to.be.true;
    });

    it("Allows multiple participants to be registered", async function () {
      await supplyChain.registerParticipant(manufacturer.address, "ABC Manufacturing", Role.MANUFACTURER);
      await supplyChain.registerParticipant(distributor.address, "XYZ Distributors", Role.DISTRIBUTOR);
      await supplyChain.registerParticipant(retailer.address, "RetailMart", Role.RETAILER);

      const mfg = await supplyChain.getParticipant(manufacturer.address);
      const dist = await supplyChain.getParticipant(distributor.address);
      const ret = await supplyChain.getParticipant(retailer.address);

      expect(mfg.role).to.equal(Role.MANUFACTURER);
      expect(dist.role).to.equal(Role.DISTRIBUTOR);
      expect(ret.role).to.equal(Role.RETAILER);
    });

    it("Rejects non-admin registrations", async function () {
      await expect(
        supplyChain.connect(manufacturer).registerParticipant(distributor.address, "XYZ Distributors", Role.DISTRIBUTOR)
      ).to.be.revertedWith("Only admin can perform this action");
    });

    it("Rejects invalid role values", async function () {
      await expect(
        supplyChain.registerParticipant(manufacturer.address, "Invalid", Role.NONE)
      ).to.be.revertedWith("Invalid role");
    });

    it("Rejects duplicate registration", async function () {
      await supplyChain.registerParticipant(manufacturer.address, "ABC Manufacturing", Role.MANUFACTURER);
      await expect(
        supplyChain.registerParticipant(manufacturer.address, "Duplicate", Role.MANUFACTURER)
      ).to.be.revertedWith("Participant already registered");
    });
  });

  // -------------------------------
  // 📦 Product Creation
  // -------------------------------
  describe("Product Creation", function () {
    beforeEach(async function () {
      await supplyChain.registerParticipant(manufacturer.address, "ABC Manufacturing", Role.MANUFACTURER);
      await supplyChain.registerParticipant(distributor.address, "XYZ Distributors", Role.DISTRIBUTOR);
    });

    it("Allows manufacturer to create products", async function () {
      const tx = await supplyChain.connect(manufacturer).createProduct("Widget A");
      const receipt = await tx.wait();

      const hasEvent = receipt.logs.some(log => {
        try {
          return supplyChain.interface.parseLog(log).name === "ProductCreated";
        } catch {
          return false;
        }
      });
      expect(hasEvent).to.be.true;

      const product = await supplyChain.getProduct(1);
      expect(product.name).to.equal("Widget A");
      expect(product.manufacturer).to.equal(manufacturer.address);
    });

    it("Increments product counter correctly", async function () {
      await supplyChain.connect(manufacturer).createProduct("Widget A");
      await supplyChain.connect(manufacturer).createProduct("Widget B");
      expect(await supplyChain.getTotalProducts()).to.equal(2);
    });

    it("Prevents non-manufacturers from creating products", async function () {
      await expect(
        supplyChain.connect(distributor).createProduct("Widget X")
      ).to.be.revertedWith("Unauthorized role");
    });

    it("Prevents unregistered users from creating products", async function () {
      await expect(
        supplyChain.connect(outsider).createProduct("Widget Z")
      ).to.be.revertedWith("Participant not registered");
    });

    it("Rejects empty product names", async function () {
      await expect(
        supplyChain.connect(manufacturer).createProduct("")
      ).to.be.revertedWith("Product name cannot be empty");
    });
  });

  // -------------------------------
  // 🚚 Shipment Handling
  // -------------------------------
  describe("Shipment Creation", function () {
    let productId;

    beforeEach(async function () {
      await supplyChain.registerParticipant(manufacturer.address, "ABC Manufacturing", Role.MANUFACTURER);
      await supplyChain.registerParticipant(distributor.address, "XYZ Distributors", Role.DISTRIBUTOR);
      await supplyChain.registerParticipant(retailer.address, "RetailCo", Role.RETAILER);
      await supplyChain.connect(manufacturer).createProduct("Widget A");
      productId = 1;
    });

    it("Allows manufacturer to ship to distributor", async function () {
      await expect(supplyChain.connect(manufacturer).createShipment(productId, distributor.address))
        .to.emit(supplyChain, "ShipmentCreated");
    });

    it("Prevents retailer from creating shipments", async function () {
      await expect(
        supplyChain.connect(retailer).createShipment(productId, distributor.address)
      ).to.be.revertedWith("Retailers cannot create shipments");
    });

    it("Rejects unregistered recipients", async function () {
      await expect(
        supplyChain.connect(manufacturer).createShipment(productId, outsider.address)
      ).to.be.revertedWith("Recipient not registered");
    });

    it("Rejects shipping to self", async function () {
      await expect(
        supplyChain.connect(manufacturer).createShipment(productId, manufacturer.address)
      ).to.be.revertedWith("Cannot ship to yourself");
    });

    it("Tracks shipment history per product", async function () {
      await supplyChain.connect(manufacturer).createShipment(productId, distributor.address);
      await supplyChain.connect(manufacturer).createShipment(productId, retailer.address);
      const history = await supplyChain.getProductHistory(productId);
      expect(history).to.deep.equal([1n, 2n]);
    });
  });

  // -------------------------------
  // 📦➡️ Shipment Transfer & Receipt
  // -------------------------------
  describe("Shipment Transfer & Receipt", function () {
    let productId, shipmentId;

    beforeEach(async function () {
      await supplyChain.registerParticipant(manufacturer.address, "ABC Manufacturing", Role.MANUFACTURER);
      await supplyChain.registerParticipant(distributor.address, "XYZ Distributors", Role.DISTRIBUTOR);
      await supplyChain.registerParticipant(retailer.address, "RetailCo", Role.RETAILER);

      await supplyChain.connect(manufacturer).createProduct("Widget A");
      await supplyChain.connect(manufacturer).createShipment(1, distributor.address);
      productId = 1;
      shipmentId = 1;
    });

    it("Allows sender to transfer shipment", async function () {
      await expect(supplyChain.connect(manufacturer).transferShipment(shipmentId))
        .to.emit(supplyChain, "ShipmentTransferred");
    });

    it("Allows recipient to receive shipment", async function () {
      await supplyChain.connect(manufacturer).transferShipment(shipmentId);
      await expect(supplyChain.connect(distributor).receiveShipment(shipmentId))
        .to.emit(supplyChain, "ShipmentReceived");
    });

    it("Prevents unauthorized transfer or receipt", async function () {
      await expect(supplyChain.connect(distributor).transferShipment(shipmentId))
        .to.be.revertedWith("Only sender can transfer shipment");
      await supplyChain.connect(manufacturer).transferShipment(shipmentId);
      await expect(supplyChain.connect(manufacturer).receiveShipment(shipmentId))
        .to.be.revertedWith("Only recipient can receive shipment");
    });

    it("Prevents premature or double transfers", async function () {
      await expect(supplyChain.connect(distributor).receiveShipment(shipmentId))
        .to.be.revertedWith("Shipment not in transit");

      await supplyChain.connect(manufacturer).transferShipment(shipmentId);
      await expect(supplyChain.connect(manufacturer).transferShipment(shipmentId))
        .to.be.revertedWith("Shipment already transferred");
    });
  });

  // -------------------------------
  // 🔄 Complete Lifecycle
  // -------------------------------
  describe("Complete Product Lifecycle", function () {
    it("Simulates end-to-end shipment from manufacturer → retailer", async function () {
      await supplyChain.registerParticipant(manufacturer.address, "ABC Manufacturing", Role.MANUFACTURER);
      await supplyChain.registerParticipant(distributor.address, "XYZ Distributors", Role.DISTRIBUTOR);
      await supplyChain.registerParticipant(retailer.address, "RetailCo", Role.RETAILER);

      await supplyChain.connect(manufacturer).createProduct("Premium Widget");

      // Manufacturer → Distributor
      await supplyChain.connect(manufacturer).createShipment(1, distributor.address);
      await supplyChain.connect(manufacturer).transferShipment(1);
      await supplyChain.connect(distributor).receiveShipment(1);

      // Distributor → Retailer
      await supplyChain.connect(distributor).createShipment(1, retailer.address);
      await supplyChain.connect(distributor).transferShipment(2);
      await supplyChain.connect(retailer).receiveShipment(2);

      const history = await supplyChain.getProductHistory(1);
      expect(history.length).to.equal(2);

      console.log("✅ Lifecycle complete: Manufacturer → Distributor → Retailer");
    });
  });

  // -------------------------------
  // 🔐 Access Control
  // -------------------------------
  describe("Access Control", function () {
    beforeEach(async function () {
      await supplyChain.registerParticipant(manufacturer.address, "ABC Manufacturing", Role.MANUFACTURER);
      await supplyChain.connect(manufacturer).createProduct("Widget A");
    });

    it("Prevents unregistered users from reading product info", async function () {
      await expect(supplyChain.connect(outsider).getProduct(1))
        .to.be.revertedWith("Participant not registered");
    });

    it("Allows registered users to query products", async function () {
      const product = await supplyChain.connect(manufacturer).getProduct(1);
      expect(product.name).to.equal("Widget A");
    });

    it("Validates authorization status", async function () {
      expect(await supplyChain.connect(manufacturer).isAuthorized()).to.be.true;
      expect(await supplyChain.connect(outsider).isAuthorized()).to.be.false;
    });
  });

  // -------------------------------
  // ⛓️ Consensus & Data Integrity
  // -------------------------------
  describe("Consensus & Data Integrity", function () {
    it("Maintains immutable product timestamps", async function () {
      await supplyChain.registerParticipant(manufacturer.address, "ABC Manufacturing", Role.MANUFACTURER);
      const tx = await supplyChain.connect(manufacturer).createProduct("Widget A");
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      const product = await supplyChain.getProduct(1);
      expect(product.createdAt).to.equal(block.timestamp);
    });

    it("Ensures shipment timestamps are recorded", async function () {
      await supplyChain.registerParticipant(manufacturer.address, "ABC Manufacturing", Role.MANUFACTURER);
      await supplyChain.registerParticipant(distributor.address, "XYZ Distributors", Role.DISTRIBUTOR);
      await supplyChain.connect(manufacturer).createProduct("Widget A");
      await supplyChain.connect(manufacturer).createShipment(1, distributor.address);

      const shipment = await supplyChain.getShipment(1);
      expect(shipment.createdAt).to.be.gt(0);
    });
  });
});
