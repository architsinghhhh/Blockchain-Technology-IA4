// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VulnerableL2Bridge
 * @dev Demonstrates double-spending vulnerability in Layer 2 bridge
 * VULNERABILITY: Lack of proper nonce management and replay attack protection
 */
contract VulnerableL2Bridge {
    mapping(address => uint256) public balances;
    mapping(bytes32 => bool) public processedWithdrawals;
    
    event Deposit(address indexed user, uint256 amount);
    event Withdrawal(address indexed user, uint256 amount, bytes32 txHash);
    
    /**
     * @dev Deposit funds to Layer 2
     */
    function deposit() external payable {
        require(msg.value > 0, "Must deposit non-zero amount");
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }
    
    /**
     * @dev VULNERABLE: Withdraw without proper validation
     * Missing checks:
     * - No nonce tracking
     * - Weak transaction hash validation
     * - No time-lock mechanism
     * - No merkle proof verification
     */
    function withdraw(uint256 amount, bytes32 txHash) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        require(!processedWithdrawals[txHash], "Already processed");
        
        // VULNERABILITY: Only checks if txHash was used, but txHash can be manipulated
        // by changing transaction parameters slightly
        processedWithdrawals[txHash] = true;
        balances[msg.sender] -= amount;
        
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        
        emit Withdrawal(msg.sender, amount, txHash);
    }
    
    /**
     * @dev VULNERABLE: Process batch withdrawals without atomic validation
     * Double-spending possible through batch manipulation
     */
    function batchWithdraw(
        uint256[] calldata amounts,
        bytes32[] calldata txHashes
    ) external {
        require(amounts.length == txHashes.length, "Array length mismatch");
        
        for (uint256 i = 0; i < amounts.length; i++) {
            // VULNERABILITY: Each withdrawal is processed independently
            // without checking total balance at the end
            if (!processedWithdrawals[txHashes[i]] && balances[msg.sender] >= amounts[i]) {
                processedWithdrawals[txHashes[i]] = true;
                balances[msg.sender] -= amounts[i];
                
                (bool success, ) = msg.sender.call{value: amounts[i]}("");
                require(success, "Transfer failed");
                
                emit Withdrawal(msg.sender, amounts[i], txHashes[i]);
            }
        }
    }
    
    /**
     * @dev Get balance
     */
    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }
    
    /**
     * @dev Get contract balance
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
