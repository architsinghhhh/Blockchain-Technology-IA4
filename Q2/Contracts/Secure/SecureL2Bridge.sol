// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SecureL2Bridge
 * @dev Secure implementation preventing double-spending attacks
 * MITIGATIONS:
 * - Nonce tracking per user
 * - Merkle proof verification for withdrawals
 * - Time-lock mechanism for large withdrawals
 * - Atomic batch processing
 * - Challenge period for fraud proofs
 */
contract SecureL2Bridge is ReentrancyGuard {
    mapping(address => uint256) public balances;
    mapping(address => uint256) public nonces;
    mapping(bytes32 => bool) public processedWithdrawals;
    mapping(bytes32 => uint256) public withdrawalTimestamps;
    
    bytes32 public merkleRoot;
    uint256 public constant CHALLENGE_PERIOD = 7 days;
    uint256 public constant LARGE_WITHDRAWAL_THRESHOLD = 10 ether;
    
    address public operator;
    bool public paused;
    
    event Deposit(address indexed user, uint256 amount, uint256 nonce);
    event WithdrawalInitiated(
        address indexed user,
        uint256 amount,
        bytes32 txHash,
        uint256 timestamp
    );
    event WithdrawalCompleted(address indexed user, uint256 amount, bytes32 txHash);
    event MerkleRootUpdated(bytes32 newRoot);
    event FraudProofSubmitted(bytes32 txHash, address reporter);
    
    modifier onlyOperator() {
        require(msg.sender == operator, "Not operator");
        _;
    }
    
    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }
    
    constructor() {
        operator = msg.sender;
    }
    
    /**
     * @dev Deposit funds with nonce tracking
     */
    function deposit() external payable whenNotPaused {
        require(msg.value > 0, "Must deposit non-zero amount");
        
        balances[msg.sender] += msg.value;
        uint256 userNonce = nonces[msg.sender]++;
        
        emit Deposit(msg.sender, msg.value, userNonce);
    }
    
    /**
     * @dev Update merkle root for withdrawal verification
     */
    function updateMerkleRoot(bytes32 _merkleRoot) external onlyOperator {
        merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(_merkleRoot);
    }
    
    /**
     * @dev Secure withdrawal with merkle proof verification
     * MITIGATIONS:
     * - Merkle proof validation
     * - Nonce verification
     * - Unique transaction hash
     * - Challenge period for large withdrawals
     */
    function initiateWithdrawal(
        uint256 amount,
        uint256 userNonce,
        bytes32[] calldata merkleProof
    ) external nonReentrant whenNotPaused {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        
        // Create unique transaction hash including nonce
        bytes32 txHash = keccak256(
            abi.encodePacked(msg.sender, amount, userNonce, block.chainid)
        );
        
        require(!processedWithdrawals[txHash], "Already processed");
        require(userNonce == nonces[msg.sender], "Invalid nonce");
        
        // Verify merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount, userNonce));
        require(
            MerkleProof.verify(merkleProof, merkleRoot, leaf),
            "Invalid merkle proof"
        );
        
        processedWithdrawals[txHash] = true;
        nonces[msg.sender]++;
        
        // Large withdrawals require challenge period
        if (amount >= LARGE_WITHDRAWAL_THRESHOLD) {
            withdrawalTimestamps[txHash] = block.timestamp;
            emit WithdrawalInitiated(msg.sender, amount, txHash, block.timestamp);
        } else {
            // Small withdrawals can be processed immediately
            balances[msg.sender] -= amount;
            (bool success, ) = msg.sender.call{value: amount}("");
            require(success, "Transfer failed");
            emit WithdrawalCompleted(msg.sender, amount, txHash);
        }
    }
    
    /**
     * @dev Complete withdrawal after challenge period
     */
    function completeWithdrawal(uint256 amount, uint256 userNonce) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        bytes32 txHash = keccak256(
            abi.encodePacked(msg.sender, amount, userNonce, block.chainid)
        );
        
        require(processedWithdrawals[txHash], "Withdrawal not initiated");
        require(withdrawalTimestamps[txHash] > 0, "Already completed");
        require(
            block.timestamp >= withdrawalTimestamps[txHash] + CHALLENGE_PERIOD,
            "Challenge period not ended"
        );
        require(balances[msg.sender] >= amount, "Insufficient balance");
        
        withdrawalTimestamps[txHash] = 0;
        balances[msg.sender] -= amount;
        
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        
        emit WithdrawalCompleted(msg.sender, amount, txHash);
    }
    
    /**
     * @dev Secure batch withdrawal with atomic validation
     * MITIGATIONS:
     * - Pre-validates total amount
     * - Atomic execution (all or nothing)
     * - Individual merkle proofs
     */
    function batchWithdraw(
        uint256[] calldata amounts,
        uint256[] calldata userNonces,
        bytes32[][] calldata merkleProofs
    ) external nonReentrant whenNotPaused {
        require(
            amounts.length == userNonces.length && 
            amounts.length == merkleProofs.length,
            "Array length mismatch"
        );
        
        // Pre-validate total amount
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        require(balances[msg.sender] >= totalAmount, "Insufficient total balance");
        
        // Process all withdrawals atomically
        for (uint256 i = 0; i < amounts.length; i++) {
            bytes32 txHash = keccak256(
                abi.encodePacked(msg.sender, amounts[i], userNonces[i], block.chainid)
            );
            
            require(!processedWithdrawals[txHash], "Already processed");
            require(userNonces[i] == nonces[msg.sender] + i, "Invalid nonce");
            
            bytes32 leaf = keccak256(
                abi.encodePacked(msg.sender, amounts[i], userNonces[i])
            );
            require(
                MerkleProof.verify(merkleProofs[i], merkleRoot, leaf),
                "Invalid merkle proof"
            );
            
            processedWithdrawals[txHash] = true;
        }
        
        // Update nonce and balance
        nonces[msg.sender] += amounts.length;
        balances[msg.sender] -= totalAmount;
        
        // Transfer funds
        (bool success, ) = msg.sender.call{value: totalAmount}("");
        require(success, "Transfer failed");
    }
    
    /**
     * @dev Submit fraud proof to challenge withdrawal
     */
    function submitFraudProof(bytes32 txHash, bytes calldata proof) 
        external 
        onlyOperator 
    {
        require(processedWithdrawals[txHash], "Withdrawal not found");
        require(withdrawalTimestamps[txHash] > 0, "Not in challenge period");
        
        // Validate fraud proof (simplified for demonstration)
        // In production, this would verify cryptographic proofs
        
        // Cancel fraudulent withdrawal
        withdrawalTimestamps[txHash] = 0;
        emit FraudProofSubmitted(txHash, msg.sender);
    }
    
    /**
     * @dev Emergency pause
     */
    function pause() external onlyOperator {
        paused = true;
    }
    
    /**
     * @dev Unpause
     */
    function unpause() external onlyOperator {
        paused = false;
    }
    
    /**
     * @dev Get user info
     */
    function getUserInfo(address user) 
        external 
        view 
        returns (uint256 balance, uint256 nonce) 
    {
        return (balances[user], nonces[user]);
    }
    
    /**
     * @dev Get contract balance
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
