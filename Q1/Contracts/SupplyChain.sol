// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SupplyChain
 * @dev Tracks shipments and products across multiple participants in a supply chain.
 * Implements role-based access control and product lifecycle management.
 */
contract SupplyChain {
    
    // Enums
    enum Role { NONE, MANUFACTURER, DISTRIBUTOR, RETAILER }
    enum ShipmentStatus { CREATED, IN_TRANSIT, RECEIVED }
    
    // Structs
    struct Participant {
        address addr;
        string name;
        Role role;
        bool registered;
    }

    struct Product {
        uint256 id;
        string name;
        address manufacturer;
        uint256 createdAt;
        bool exists;
    }

    struct Shipment {
        uint256 id;
        uint256 productId;
        address from;
        address to;
        ShipmentStatus status;
        uint256 createdAt;
        uint256 transferredAt;
        uint256 receivedAt;
    }

    // State variables
    address public admin;
    uint256 public productCount;
    uint256 public shipmentCount;

    mapping(address => Participant) public participants;
    mapping(uint256 => Product) public products;
    mapping(uint256 => Shipment) public shipments;
    mapping(uint256 => uint256[]) public productShipments; // productId => shipmentIds[]

    // Events
    event ParticipantRegistered(address indexed participant, string name, Role role);
    event ProductCreated(uint256 indexed productId, string name, address indexed manufacturer, uint256 timestamp);
    event ShipmentCreated(uint256 indexed shipmentId, uint256 indexed productId, address indexed from, address to, uint256 timestamp);
    event ShipmentTransferred(uint256 indexed shipmentId, address indexed from, address indexed to, uint256 timestamp);
    event ShipmentReceived(uint256 indexed shipmentId, address indexed receiver, uint256 timestamp);

    // Modifiers
    modifier onlyAdmin() {
        require(msg.sender == admin, "Not authorized: admin only");
        _;
    }

    modifier onlyRegistered() {
        require(participants[msg.sender].registered, "Not a registered participant");
        _;
    }

    modifier onlyRole(Role _role) {
        require(participants[msg.sender].role == _role, "Unauthorized role");
        _;
    }

    modifier productExists(uint256 _id) {
        require(products[_id].exists, "Product does not exist");
        _;
    }

    modifier shipmentExists(uint256 _id) {
        require(_id > 0 && _id <= shipmentCount, "Shipment does not exist");
        _;
    }

    // Constructor
    constructor() {
        admin = msg.sender;
    }

    // ---- Core Functions ----

    function registerParticipant(address _addr, string calldata _name, Role _role)
        external
        onlyAdmin
    {
        require(_addr != address(0), "Invalid address");
        require(_role != Role.NONE, "Invalid role");
        require(!participants[_addr].registered, "Already registered");

        participants[_addr] = Participant({
            addr: _addr,
            name: _name,
            role: _role,
            registered: true
        });

        emit ParticipantRegistered(_addr, _name, _role);
    }

    function createProduct(string calldata _name)
        external
        onlyRegistered
        onlyRole(Role.MANUFACTURER)
        returns (uint256)
    {
        require(bytes(_name).length > 0, "Name required");

        productCount++;
        products[productCount] = Product({
            id: productCount,
            name: _name,
            manufacturer: msg.sender,
            createdAt: block.timestamp,
            exists: true
        });

        emit ProductCreated(productCount, _name, msg.sender, block.timestamp);
        return productCount;
    }

    function createShipment(uint256 _productId, address _to)
        external
        onlyRegistered
        productExists(_productId)
        returns (uint256)
    {
        require(_to != address(0), "Invalid recipient");
        require(participants[_to].registered, "Recipient not registered");
        require(msg.sender != _to, "Cannot ship to yourself");

        Participant memory sender = participants[msg.sender];
        Participant memory receiver = participants[_to];

        if (sender.role == Role.MANUFACTURER) {
            require(receiver.role == Role.DISTRIBUTOR || receiver.role == Role.RETAILER,
                "Invalid shipment target");
        } else if (sender.role == Role.DISTRIBUTOR) {
            require(receiver.role == Role.RETAILER, "Distributors only ship to retailers");
        } else {
            revert("Retailers cannot create shipments");
        }

        shipmentCount++;
        shipments[shipmentCount] = Shipment({
            id: shipmentCount,
            productId: _productId,
            from: msg.sender,
            to: _to,
            status: ShipmentStatus.CREATED,
            createdAt: block.timestamp,
            transferredAt: 0,
            receivedAt: 0
        });

        productShipments[_productId].push(shipmentCount);

        emit ShipmentCreated(shipmentCount, _productId, msg.sender, _to, block.timestamp);
        return shipmentCount;
    }

    function transferShipment(uint256 _shipmentId)
        external
        onlyRegistered
        shipmentExists(_shipmentId)
    {
        Shipment storage s = shipments[_shipmentId];
        require(msg.sender == s.from, "Sender only");
        require(s.status == ShipmentStatus.CREATED, "Already transferred");

        s.status = ShipmentStatus.IN_TRANSIT;
        s.transferredAt = block.timestamp;

        emit ShipmentTransferred(_shipmentId, s.from, s.to, block.timestamp);
    }

    function receiveShipment(uint256 _shipmentId)
        external
        onlyRegistered
        shipmentExists(_shipmentId)
    {
        Shipment storage s = shipments[_shipmentId];
        require(msg.sender == s.to, "Recipient only");
        require(s.status == ShipmentStatus.IN_TRANSIT, "Not in transit");

        s.status = ShipmentStatus.RECEIVED;
        s.receivedAt = block.timestamp;

        emit ShipmentReceived(_shipmentId, msg.sender, block.timestamp);
    }

    // ---- View Functions ----

    function getProductHistory(uint256 _productId)
        external
        view
        onlyRegistered
        productExists(_productId)
        returns (uint256[] memory)
    {
        return productShipments[_productId];
    }

    function getProduct(uint256 _productId)
        external
        view
        onlyRegistered
        productExists(_productId)
        returns (
            uint256 id,
            string memory name,
            address manufacturer,
            string memory manufacturerName,
            uint256 createdAt
        )
    {
        Product memory p = products[_productId];
        Participant memory m = participants[p.manufacturer];
        return (p.id, p.name, p.manufacturer, m.name, p.createdAt);
    }

    function getShipment(uint256 _shipmentId)
        external
        view
        onlyRegistered
        shipmentExists(_shipmentId)
        returns (
            uint256 id,
            uint256 productId,
            address from,
            string memory fromName,
            address to,
            string memory toName,
            ShipmentStatus status,
            uint256 createdAt,
            uint256 transferredAt,
            uint256 receivedAt
        )
    {
        Shipment memory s = shipments[_shipmentId];
        Participant memory sender = participants[s.from];
        Participant memory receiver = participants[s.to];
        return (
            s.id,
            s.productId,
            s.from,
            sender.name,
            s.to,
            receiver.name,
            s.status,
            s.createdAt,
            s.transferredAt,
            s.receivedAt
        );
    }

    function getParticipant(address _addr)
        external
        view
        returns (address, string memory, Role, bool)
    {
        Participant memory p = participants[_addr];
        return (p.addr, p.name, p.role, p.registered);
    }

    function isAuthorized() external view returns (bool) {
        return participants[msg.sender].registered;
    }

    function getTotalProducts() external view returns (uint256) {
        return productCount;
    }

    function getTotalShipments() external view returns (uint256) {
        return shipmentCount;
    }
}

