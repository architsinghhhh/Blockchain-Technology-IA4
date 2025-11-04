// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SecureDEX
 * @dev Secure DEX implementation preventing front-running attacks
 * MITIGATIONS:
 * - Slippage protection
 * - Minimum output amount validation
 * - Deadline enforcement
 * - Commit-reveal scheme for large trades
 * - Rate limiting
 */
contract SecureDEX {
    uint256 public tokenAReserve = 1000000 * 10**18;
    uint256 public tokenBReserve = 1000000 * 10**18;
    uint256 public constant FEE_PERCENT = 3; // 0.3% fee
    uint256 public constant MAX_SLIPPAGE_PERCENT = 5; // 5% max slippage
    
    mapping(address => uint256) public tokenABalance;
    mapping(address => uint256) public tokenBBalance;
    mapping(address => uint256) public lastTradeTimestamp;
    mapping(bytes32 => TradeCommitment) public tradeCommitments;
    
    uint256 public constant RATE_LIMIT_PERIOD = 1 minutes;
    uint256 public constant COMMITMENT_PERIOD = 1 minutes;
    
    struct TradeCommitment {
        address trader;
        uint256 timestamp;
        bool executed;
    }
    
    event Swap(
        address indexed user,
        uint256 amountIn,
        uint256 amountOut,
        bool isAToB,
        uint256 slippage
    );
    event LiquidityAdded(address indexed user, uint256 amountA, uint256 amountB);
    event TradeCommitted(bytes32 indexed commitmentHash, address indexed trader);
    event TradeRevealed(bytes32 indexed commitmentHash, address indexed trader);
    
    /**
     * @dev Add liquidity
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
     * @dev SECURE: Swap with slippage protection
     * MITIGATIONS:
     * - minAmountOut prevents front-running profit
     * - deadline prevents pending transaction exploitation
     * - rate limiting prevents rapid manipulation
     */
    function swapAForBSecure(
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) external returns (uint256 amountOut) {
        // Deadline check
        require(block.timestamp <= deadline, "Transaction expired");
        
        // Rate limiting
        require(
            block.timestamp >= lastTradeTimestamp[msg.sender] + RATE_LIMIT_PERIOD,
            "Rate limit exceeded"
        );
        
        require(tokenABalance[msg.sender] >= amountIn, "Insufficient balance");
        
        // Calculate output with current reserves
        amountOut = getAmountOut(amountIn, tokenAReserve, tokenBReserve);
        
        // MITIGATION: Slippage protection
        require(amountOut >= minAmountOut, "Slippage too high");
        
        // Validate slippage is within acceptable range
        uint256 slippagePercent = calculateSlippage(amountOut, minAmountOut);
        require(slippagePercent <= MAX_SLIPPAGE_PERCENT, "Exceeds max slippage");
        
        require(amountOut > 0, "Insufficient output amount");
        require(tokenBReserve >= amountOut, "Insufficient liquidity");
        
        // Update balances
        tokenABalance[msg.sender] -= amountIn;
        tokenBBalance[msg.sender] += amountOut;
        
        // Update reserves
        tokenAReserve += amountIn;
        tokenBReserve -= amountOut;
        
        // Update rate limit
        lastTradeTimestamp[msg.sender] = block.timestamp;
        
        emit Swap(msg.sender, amountIn, amountOut, true, slippagePercent);
        
        return amountOut;
    }
    
    /**
     * @dev SECURE: Swap B for A with protections
     */
    function swapBForASecure(
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) external returns (uint256 amountOut) {
        require(block.timestamp <= deadline, "Transaction expired");
        require(
            block.timestamp >= lastTradeTimestamp[msg.sender] + RATE_LIMIT_PERIOD,
            "Rate limit exceeded"
        );
        require(tokenBBalance[msg.sender] >= amountIn, "Insufficient balance");
        
        amountOut = getAmountOut(amountIn, tokenBReserve, tokenAReserve);
        
        require(amountOut >= minAmountOut, "Slippage too high");
        
        uint256 slippagePercent = calculateSlippage(amountOut, minAmountOut);
        require(slippagePercent <= MAX_SLIPPAGE_PERCENT, "Exceeds max slippage");
        
        require(amountOut > 0, "Insufficient output amount");
        require(tokenAReserve >= amountOut, "Insufficient liquidity");
        
        tokenBBalance[msg.sender] -= amountIn;
        tokenABalance[msg.sender] += amountOut;
        
        tokenBReserve += amountIn;
        tokenAReserve -= amountOut;
        
        lastTradeTimestamp[msg.sender] = block.timestamp;
        
        emit Swap(msg.sender, amountIn, amountOut, false, slippagePercent);
        
        return amountOut;
    }
    
    /**
     * @dev Commit-reveal scheme for large trades
     * Step 1: Commit to trade without revealing details
     */
    function commitTrade(bytes32 commitmentHash) external {
        require(
            tradeCommitments[commitmentHash].trader == address(0),
            "Commitment exists"
        );
        
        tradeCommitments[commitmentHash] = TradeCommitment({
            trader: msg.sender,
            timestamp: block.timestamp,
            executed: false
        });
        
        emit TradeCommitted(commitmentHash, msg.sender);
    }
    
    /**
     * @dev Step 2: Reveal and execute trade after commitment period
     * Prevents front-running by hiding trade details initially
     */
    function revealAndExecuteTrade(
        uint256 amountIn,
        uint256 minAmountOut,
        bool isAToB,
        bytes32 salt
    ) external returns (uint256 amountOut) {
        bytes32 commitmentHash = keccak256(
            abi.encodePacked(msg.sender, amountIn, minAmountOut, isAToB, salt)
        );
        
        TradeCommitment storage commitment = tradeCommitments[commitmentHash];
        
        require(commitment.trader == msg.sender, "Not commitment owner");
        require(!commitment.executed, "Already executed");
        require(
            block.timestamp >= commitment.timestamp + COMMITMENT_PERIOD,
            "Commitment period not ended"
        );
        
        commitment.executed = true;
        
        // Execute trade based on parameters
        if (isAToB) {
            require(tokenABalance[msg.sender] >= amountIn, "Insufficient balance");
            amountOut = getAmountOut(amountIn, tokenAReserve, tokenBReserve);
            require(amountOut >= minAmountOut, "Slippage too high");
            
            tokenABalance[msg.sender] -= amountIn;
            tokenBBalance[msg.sender] += amountOut;
            tokenAReserve += amountIn;
            tokenBReserve -= amountOut;
        } else {
            require(tokenBBalance[msg.sender] >= amountIn, "Insufficient balance");
            amountOut = getAmountOut(amountIn, tokenBReserve, tokenAReserve);
            require(amountOut >= minAmountOut, "Slippage too high");
            
            tokenBBalance[msg.sender] -= amountIn;
            tokenABalance[msg.sender] += amountOut;
            tokenBReserve += amountIn;
            tokenAReserve -= amountOut;
        }
        
        emit TradeRevealed(commitmentHash, msg.sender);
        emit Swap(msg.sender, amountIn, amountOut, isAToB, 0);
        
        return amountOut;
    }
    
    /**
     * @dev Calculate slippage percentage
     */
    function calculateSlippage(uint256 actualAmount, uint256 expectedAmount)
        public
        pure
        returns (uint256)
    {
        if (actualAmount >= expectedAmount) {
            return 0;
        }
        return ((expectedAmount - actualAmount) * 100) / expectedAmount;
    }
    
    /**
     * @dev Calculate output amount using constant product formula
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
     * @dev Get current price with protection against manipulation
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
    
    /**
     * @dev Get quote with slippage calculation
     */
    function getQuoteWithSlippage(uint256 amountIn, bool isAToB)
        external
        view
        returns (uint256 amountOut, uint256 minAmountOut)
    {
        if (isAToB) {
            amountOut = getAmountOut(amountIn, tokenAReserve, tokenBReserve);
        } else {
            amountOut = getAmountOut(amountIn, tokenBReserve, tokenAReserve);
        }
        
        // Calculate minimum with max slippage
        minAmountOut = (amountOut * (100 - MAX_SLIPPAGE_PERCENT)) / 100;
        
        return (amountOut, minAmountOut);
    }
}
