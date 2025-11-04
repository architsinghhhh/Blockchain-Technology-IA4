// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SecureBank
 * @dev Secure implementation preventing reentrancy attacks
 * MITIGATIONS:
 * - ReentrancyGuard from OpenZeppelin
 * - Checks-Effects-Interactions pattern
 * - State updates before external calls
 */
contract SecureBank is ReentrancyGuard {
    mapping(address => uint256) public balances;
    
    event Deposit(address indexed user, uint256 amount);
    event Withdrawal(address indexed user, uint256 amount);
    
    /**
     * @dev Deposit funds
     */
    function deposit() external payable {
        require(msg.value > 0, "Must deposit non-zero amount");
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }
    
    /**
     * @dev SECURE: Withdrawal with reentrancy protection
     * MITIGATIONS:
     * 1. nonReentrant modifier prevents recursive calls
     * 2. Checks-Effects-Interactions pattern
     * 3. State updated before external call
     */
    function withdraw(uint256 amount) external nonReentrant {
        // CHECKS: Validate conditions
        require(balances[msg.sender] >= amount, "Insufficient balance");
        
        // EFFECTS: Update state BEFORE external call
        balances[msg.sender] -= amount;
        
        // INTERACTIONS: External call happens last
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        
        emit Withdrawal(msg.sender, amount);
    }
    
    /**
     * @dev Alternative secure withdrawal using transfer
     * Transfer has limited gas (2300), preventing reentrancy
     */
    function withdrawSafe(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        
        balances[msg.sender] -= amount;
        
        // transfer() forwards only 2300 gas, preventing reentrancy
        payable(msg.sender).transfer(amount);
        
        emit Withdrawal(msg.sender, amount);
    }
    
    /**
     * @dev Get user balance
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
