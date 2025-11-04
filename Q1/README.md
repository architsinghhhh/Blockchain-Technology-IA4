# 🏗️ Supply Chain Blockchain — Product & Shipment Tracking

A blockchain-based **Supply Chain Management System** built with **Solidity** and **Hardhat**.  
This project ensures **transparency, traceability, and trust** across manufacturers, distributors, and retailers through an immutable ledger.

---

## 🚀 Key Features

- 🔐 **Role-Based Access** — Admin, Manufacturer, Distributor, Retailer  
- 📦 **Product Lifecycle Tracking** — From creation to final delivery  
- 🧾 **Event Logging** — Shipment creation, transfer, and receipt  
- 🧠 **Smart Validation** — Enforces authorized product flow  
- 🧱 **Immutable Ledger** — Transparent and auditable records  

---

## 🧩 Architecture
<p align="center">
  <b>Participants Flow:</b><br>
  👷 Manufacturer → 🚚 Distributor → 🏪 Retailer
</p>

<p align="center">
  <b>Process Lifecycle:</b><br>
  ⚙️ Create → 🚢 Ship → 📦 Receive → ✅ Deliver
</p>



Each step is verified on-chain, preventing data tampering or unauthorized access.

---

## ⚙️ Setup & Deployment

### Prerequisites
- Node.js (v16+)
- npm / yarn
- Hardhat

### Installation
```bash
npm install

```
### Compile Contracts
```bash
npx hardhat compile


```
### Run Tests
```bash
npx hardhat test


```
### Deploy Locally
```bash
# Terminal 1
npx hardhat node

# Terminal 2
npx hardhat run scripts/deploy.js --network localhost


```
### 🧠 Example Usage
```javascript
// Register participants
await supplyChain.registerParticipant(admin, "ABC Manufacturing", 1);
await supplyChain.registerParticipant(distributor, "XYZ Distributors", 2);
await supplyChain.registerParticipant(retailer, "RetailCo", 3);

// Manufacturer creates and ships product
await supplyChain.connect(manufacturer).createProduct("Widget A");
await supplyChain.connect(manufacturer).createShipment(1, distributor.address);
await supplyChain.connect(manufacturer).transferShipment(1);

// Distributor receives shipment
await supplyChain.connect(distributor).receiveShipment(1);


```

## 🔒 Security & Integrity

- **Role-Based Access Control** – Each participant has defined permissions.  
- **Verified State Transitions** – Ensures only valid shipment flows occur.  
- **Immutable Blockchain Logs** – Every transaction is permanently recorded.  
- **Protection Against Attacks** – Prevents double transfers and unauthorized shipments.  


## 🧱 Tech Stack

| **Layer**              | **Technology**                     |
|-------------------------|------------------------------------|
| 🧩 Smart Contracts       | Solidity                           |
| 🧰 Framework             | Hardhat                            |
| 🌐 Network               | Ethereum (Local / Testnet)         |
| 🧪 Testing Framework     | Mocha + Chai                       |
| 🔗 Optional Extension    | Hyperledger Fabric Integration     |


## 📜 License

This project is licensed under the **MIT License**.  
See the [LICENSE](./LICENSE) file for details.
## 🔒 Security



