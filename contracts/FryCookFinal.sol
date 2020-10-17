pragma solidity 0.6.12;


import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./ChickenTokenFinal.sol";


// An interface for a future component of the CHKN system, allowing migration
// from one type of LP token to another. Migration moves liquidity from an exchange
// contract to another, e.g. for a swap version update. All users keep their
// staked liquidity and can deposit or withdraw the new type of token
// (kept in the same pool / pid) afterwards.
interface ICookFinalMigrator {
    // Perform LP token migration from UniswapV2 to ChickenFarm.
    // Take the current LP token address and return the new LP token address.
    // Migrator should have full access to the caller's LP token.
    // Return the new LP token address.
    //
    // XXX Migrator must have allowance access to UniswapV2 LP tokens.
    // ChickenFarm must mint EXACTLY the same amount of ChickenFarm LP tokens or
    // else something bad will happen. Traditional UniswapV2 does not
    // do that so be careful!
    function migrate(IERC20 token) external returns (IERC20);
}

// FryCookFinal works the fryer. They make some good chicken!
//
// Note that there is an EXECUTIVE_ROLE and the executive(s) wields tremendous
// power. The deployer will have executive power until initial setup is complete,
// then renounce that direct power in favor of Timelocked control so the community
// can see incoming executive orders (including role changes). Eventually, this
// setup will be replaced with community governance by CHKN token holders.
//
// Executives determine who holds other roles and set contract references
// (e.g. for migration). The other roles are:
//
// Head Chef: Designs the menu (can add and update lp token pools)
// Sous Chef: Tweaks recipes (can update lp token pool allocation points)
// Waitstaff: Carries orders and payments (can deposit / withdraw on behalf of stakers)
//
// It makes sense for an executive (individual or community) to also operate as the
// head chef, but nothing but a well-tested and audited smart contract should EVER be assigned
// to waitstaff. Waitstaff have full access to all staked tokens.
contract FryCookFinal is AccessControl {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken;           // Address of LP token contract.
        uint256 allocPoint;       // How many allocation points assigned to this pool. CHKNs to distribute per block.
        uint256 lastRewardBlock;  // Last block number that CHKNs distribution occurs.
        uint256 totalScore;       // Total score of all investors.
        uint256 accChickenPerScore; // Accumulated CHKNs per score, times 1e12. See below.

        // early bird point rewards (larger share of CHKN mints w/in the pool)
        uint256 earlyBirdMinShares;
        uint256 earlyBirdExtra;
        uint256 earlyBirdGraceEndBlock;
        uint256 earlyBirdHalvingBlocks;
    }

    // Info of each user.
    struct UserInfo {
        uint256 amount;     // How many LP tokens the user has provided.
        uint256 score;      // The staked "score" based on LP tokens and early bird bonus
        uint256 earlyBirdMult;  // Early bird bonus multiplier, scaled by EARLY_BIRD_PRECISION
        bool earlyBird;     // Does the score include an early bird bonus?
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of CHKNs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.score * pool.accChickenPerScore) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accChickenPerScore` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` and `score` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Access Control Roles. This is the FryCookFinal, but there's other jobs in the kitchen.
    bytes32 public constant MIGRATOR_ROLE = keccak256("MIGRATOR_ROLE");   // aka deployer: sets initial state
    bytes32 public constant EXECUTIVE_ROLE = keccak256("EXECUTIVE_ROLE");   // aka owner: determines other roles
    bytes32 public constant HEAD_CHEF_ROLE = keccak256("HEAD_CHEF_ROLE");   // governance: token pool changes, control over agent list
    bytes32 public constant SOUS_CHEF_ROLE = keccak256("SOUS_CHEF_ROLE");   // pool spiciness tweaks: can change allocation points for pools
    bytes32 public constant WAITSTAFF_ROLE = keccak256("WAITSTAFF_ROLE");   // token agent(s): can make deposits / withdrawals on behalf of stakers

    // The CHKN TOKEN!
    ChickenTokenFinal public chicken;
    uint256 public chickenCap;
    // Dev address.
    address public devaddr;
    // Block number when bonus CHKN stage ends (staged decline to no bonus).
    uint256 public bonusStage2Block;
    uint256 public bonusStage3Block;
    uint256 public bonusStage4Block;
    uint256 public bonusEndBlock;
    // CHKN tokens created per block.
    uint256 public chickenPerBlock;
    // Bonus muliplier for early chicken makers.
    uint256 public constant BONUS_MULTIPLIER_STAGE_1 = 20;
    uint256 public constant BONUS_MULTIPLIER_STAGE_2 = 15;
    uint256 public constant BONUS_MULTIPLIER_STAGE_3 = 10;
    uint256 public constant BONUS_MULTIPLIER_STAGE_4 = 5;
    // Block number when dev share declines (staged decline to lowest share).
    uint256 public devBonusStage2Block;
    uint256 public devBonusStage3Block;
    uint256 public devBonusStage4Block;
    uint256 public devBonusEndBlock;
    // Dev share divisor for each bonus stage.
    uint256 public constant DEV_DIV_STAGE_1 = 10; // 10%
    uint256 public constant DEV_DIV_STAGE_2 = 12; // 8.333..%
    uint256 public constant DEV_DIV_STAGE_3 = 16; // 6.25%
    uint256 public constant DEV_DIV_STAGE_4 = 25; // 4%
    uint256 public constant DEV_DIV = 50; // 2%

    // Precision values
    uint256 public constant EARLY_BIRD_PRECISION = 1e12;
    uint256 public constant ACC_CHICKEN_PRECISION = 1e12;

    // The migrator contract. It has a lot of power. Can only be set through governance (owner).
    ICookFinalMigrator public migrator;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    mapping (address => uint256) public tokenPid;
    mapping (address => bool) public hasToken;
    // Info of each user that stakes LP tokens.
    mapping (uint256 => mapping (address => UserInfo)) public userInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when CHKN mining starts.
    uint256 public startBlock;

    event Deposit(address indexed staker, address indexed funder, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed staker, address indexed agent, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

    constructor(
        ChickenTokenFinal _chicken,
        address _devaddr,
        uint256 _chickenPerBlock,
        uint256 _startBlock,
        uint256 _bonusEndBlock,
        uint256 _devBonusEndBlock
    ) public {
        chicken = _chicken;
        devaddr = _devaddr;
        chickenPerBlock = _chickenPerBlock;
        bonusEndBlock = _bonusEndBlock;
        startBlock = _startBlock;
        devBonusEndBlock = _devBonusEndBlock;

        // calculate mint bonus stage blocks (block-of-transition from 20x to 15x, etc.)
        uint256 bonusStep = bonusEndBlock.sub(startBlock).div(4);
        bonusStage2Block = bonusStep.add(startBlock);
        bonusStage3Block = bonusStep.mul(2).add(startBlock);
        bonusStage4Block = bonusStep.mul(3).add(startBlock);

        // calculate dev divisor stage blocks
        uint256 devBonusStep = devBonusEndBlock.sub(startBlock).div(4);
        devBonusStage2Block = devBonusStep.add(startBlock);
        devBonusStage3Block = devBonusStep.mul(2).add(startBlock);
        devBonusStage4Block = devBonusStep.mul(3).add(startBlock);

        // set up initial roles (caller is owner and manager). The caller
        // CANNOT act as waitstaff; athough they can add and modify pools,
        // they CANNOT touch user deposits. Nothing but another smart contract
        // should ever be waitstaff.
        _setupRole(MIGRATOR_ROLE, msg.sender);    // can migrate data
        _setupRole(EXECUTIVE_ROLE, msg.sender);   // can manage other roles and link contracts
        _setupRole(HEAD_CHEF_ROLE, msg.sender);   // can create and alter pools

        // set up executives as role administrators.
        // after initial setup, all roles are expected to be served by other contracts
        // (e.g. Timelock, GovernorAlpha, etc.)
        _setRoleAdmin(MIGRATOR_ROLE, MIGRATOR_ROLE);
        _setRoleAdmin(EXECUTIVE_ROLE, EXECUTIVE_ROLE);
        _setRoleAdmin(HEAD_CHEF_ROLE, EXECUTIVE_ROLE);
        _setRoleAdmin(SOUS_CHEF_ROLE, EXECUTIVE_ROLE);
        _setRoleAdmin(WAITSTAFF_ROLE, EXECUTIVE_ROLE);

        // store so we never have to query again
        chickenCap = chicken.cap();
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Add a new lp to the pool. Can only be called by a manager.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(
      uint256 _allocPoint,
      IERC20 _lpToken,
      uint256 _earlyBirdMinShares,
      uint256 _earlyBirdInitialBonus,
      uint256 _earlyBirdGraceEndBlock,
      uint256 _earlyBirdHalvingBlocks,
      bool _withUpdate
    ) public {
        require(hasRole(HEAD_CHEF_ROLE, msg.sender), "FryCookFinal::add: not authorized");
        require(!hasToken[address(_lpToken)], "FryCookFinal::add: lpToken already added");
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        hasToken[address(_lpToken)] = true;
        tokenPid[address(_lpToken)] = poolInfo.length;
        poolInfo.push(PoolInfo({
            lpToken: _lpToken,
            allocPoint: _allocPoint,
            earlyBirdMinShares: _earlyBirdMinShares,
            earlyBirdExtra: _earlyBirdInitialBonus.sub(1),    // provided as multiplier: 100x. Declines to 1x, so "99" extra.
            earlyBirdGraceEndBlock: _earlyBirdGraceEndBlock,
            earlyBirdHalvingBlocks: _earlyBirdHalvingBlocks,
            lastRewardBlock: lastRewardBlock,
            totalScore: 0,
            accChickenPerScore: 0
        }));
    }

    // Update the given pool's CHKN allocation point. Can only be called by a manager.
    function set(uint256 _pid, uint256 _allocPoint, bool _withUpdate) public {
        require(hasRole(HEAD_CHEF_ROLE, msg.sender) || hasRole(SOUS_CHEF_ROLE, msg.sender), "FryCookFinal::set: not authorized");
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(_allocPoint);
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    // Set the migrator contract. Can only be called by a manager.
    function setMigrator(ICookFinalMigrator _migrator) public {
        require(hasRole(EXECUTIVE_ROLE, msg.sender), "FryCookFinal::setMigrator: not authorized");
        migrator = _migrator;
    }

    // Migrate lp token to another lp contract. Can be called by anyone. We trust that migrator contract is good.
    function migrate(uint256 _pid) public {
        require(address(migrator) != address(0), "FryCookFinal::migrate: no migrator");
        PoolInfo storage pool = poolInfo[_pid];
        IERC20 lpToken = pool.lpToken;
        uint256 bal = lpToken.balanceOf(address(this));
        lpToken.safeApprove(address(migrator), bal);
        IERC20 newLpToken = migrator.migrate(lpToken);
        require(bal == newLpToken.balanceOf(address(this)), "FryCookFinal::migrate: bad");
        pool.lpToken = newLpToken;
        tokenPid[address(newLpToken)] = _pid;
        hasToken[address(newLpToken)] = true;
        tokenPid[address(lpToken)] = 0;
        hasToken[address(lpToken)] = false;
    }

    // Return the number of blocks intersecting between the two ranges.
    // Assumption: _from <= _to, _from2 <= _to2.
    function getIntersection(uint256 _from, uint256 _to, uint256 _from2, uint256 _to2) public pure returns (uint256) {
        if (_to <= _from2) {
            return 0;
        } else if (_to2 <= _from) {
            return 0;
        } else {
            return Math.min(_to, _to2).sub(Math.max(_from, _from2));
        }
    }

    // Return CHKN reward (mint) multiplier over the given range, _from to _to block.
    // Multiply against chickenPerBlock to determine the total amount minted
    // during that time (not including devaddr share). Ignores "startBlock".
    // Assumption: _from <= _to. Otherwise get weird results.
    function getMintMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
        if (_from >= bonusEndBlock) { // no bonus
            return _to.sub(_from);
        } else {  // potentially intersect four bonus periods and/or "no bonus"
            uint256 mult = 0;
            mult = mult.add(getIntersection(_from, _to, 0, bonusStage2Block).mul(BONUS_MULTIPLIER_STAGE_1));
            mult = mult.add(getIntersection(_from, _to, bonusStage2Block, bonusStage3Block).mul(BONUS_MULTIPLIER_STAGE_2));
            mult = mult.add(getIntersection(_from, _to, bonusStage3Block, bonusStage4Block).mul(BONUS_MULTIPLIER_STAGE_3));
            mult = mult.add(getIntersection(_from, _to, bonusStage4Block, bonusEndBlock).mul(BONUS_MULTIPLIER_STAGE_4));
            mult = mult.add(Math.max(_to, bonusEndBlock).sub(bonusEndBlock));   // known: _from < bonusEndBlock
            return mult;
        }
    }

    // Returns the divisor to determine the developer's share of coins at the
    // given block. For M coins minted, dev gets M.div(_val_). For a block range,
    // undershoot by providing _to block (dev gets up to, not over, the bonus amount).
    function getDevDivisor(uint256 _block) public view returns (uint256) {
        if (_block >= devBonusEndBlock) {
            return DEV_DIV;
        } else if (_block >= devBonusStage4Block) {
            return DEV_DIV_STAGE_4;
        } else if (_block >= devBonusStage3Block) {
            return DEV_DIV_STAGE_3;
        } else if (_block >= devBonusStage2Block) {
            return DEV_DIV_STAGE_2;
        } else {
            return DEV_DIV_STAGE_1;
        }
    }

    // Returns the score multiplier for an early bird investor who qualifies
    // at _block for _pid. The investment quantity and min threshold are not
    // checked; qualification is a precondition.
    // The output is scaled by EARLY_BIRD_PRECISION; e.g. a return value of
    // 1.5 * EARLY_BIRD_PRECISION indicates a multiplier of 1.5x.
    function getEarlyBirdMultiplier(uint256 _block, uint256 _pid) public view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        uint256 decliningPortion = pool.earlyBirdExtra.mul(EARLY_BIRD_PRECISION);
        if (_block <= pool.earlyBirdGraceEndBlock) {
            return decliningPortion.add(EARLY_BIRD_PRECISION);
        }

        uint256 distance = _block.sub(pool.earlyBirdGraceEndBlock);
        uint256 halvings = distance.div(pool.earlyBirdHalvingBlocks); // whole number
        if (halvings >= 120) { // asymptotic, up to a point
            return EARLY_BIRD_PRECISION;  // 1x
        }

        // approximate exponential decay with linear interpolation between integer exponents
        uint256 progress = distance.sub(halvings.mul(pool.earlyBirdHalvingBlocks));
        uint256 divisor = (2 ** halvings).mul(1e8);  // scaled once for precision
        uint256 nextDivisor = (2 ** (halvings.add(1))).mul(1e8); // scaled once for precision
        uint256 diff = nextDivisor.sub(divisor);
        uint256 alpha = progress.mul(1e8).div(pool.earlyBirdHalvingBlocks);  // scaled once for precision
        divisor = divisor.add(diff.mul(alpha).div(1e8));  // unscale alpha after mult. to keep precision

        // divisor is scaled up; scale up declining portion by same amount before division
        return decliningPortion.mul(1e8).div(divisor).add(EARLY_BIRD_PRECISION);
    }

    // View function to see pending CHKNs on frontend.
    function pendingChicken(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accChickenPerScore = pool.accChickenPerScore;
        uint256 totalScore = pool.totalScore;
        if (block.number > pool.lastRewardBlock && totalScore != 0) {
            uint256 multiplier = getMintMultiplier(pool.lastRewardBlock, block.number);
            uint256 chickenReward = multiplier.mul(chickenPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
            accChickenPerScore = accChickenPerScore.add(chickenReward.mul(ACC_CHICKEN_PRECISION).div(totalScore));
        }
        return user.score.mul(accChickenPerScore).div(ACC_CHICKEN_PRECISION).sub(user.rewardDebt);
    }

    // Update reward vairables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 totalScore = pool.totalScore;
        if (totalScore == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMintMultiplier(pool.lastRewardBlock, block.number);
        uint256 chickenReward = multiplier.mul(chickenPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
        uint256 devReward = chickenReward.div(getDevDivisor(block.number));
        uint256 supply = chicken.totalSupply();
        // safe mint: don't exceed supply
        if (supply.add(chickenReward).add(devReward) > chickenCap) {
            chickenReward = chickenCap.sub(supply);
            devReward = 0;
        }
        chicken.mint(address(this), chickenReward);
        chicken.mint(devaddr, devReward);
        pool.accChickenPerScore = pool.accChickenPerScore.add(chickenReward.mul(ACC_CHICKEN_PRECISION).div(totalScore));
        pool.lastRewardBlock = block.number;
    }

    // Deposit LP tokens to FryCookFinal for CHKN allocation. Deposit 0 to bump a pool update.
    function deposit(uint256 _pid, uint256 _amount) public {
        _deposit(_pid, _amount, msg.sender, msg.sender);
    }

    // Deposit LP tokens on behalf of another user.
    function depositTo(uint256 _pid, uint256 _amount, address _staker) public {
        require(hasRole(WAITSTAFF_ROLE, msg.sender), "FryCookFinal::depositTo: not authorized");
        _deposit(_pid, _amount, _staker, msg.sender);
    }

    // Handle deposits, whether agent-driven or user-initiated.
    function _deposit(uint256 _pid, uint256 _amount, address _staker, address _funder) internal {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_staker];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending = user.score.mul(pool.accChickenPerScore).div(ACC_CHICKEN_PRECISION).sub(user.rewardDebt);
            if (pending > 0) {
                safeChickenTransfer(_staker, pending);
            }
        } else {
            user.earlyBirdMult = EARLY_BIRD_PRECISION;  // equiv. to 1x
        }


        // transfer LP tokens; update user info
        if (_amount > 0) {
            pool.lpToken.safeTransferFrom(_funder, address(this), _amount);
            uint256 oldScore = user.score;
            user.amount = user.amount.add(_amount);
            if (!user.earlyBird && user.amount >= pool.earlyBirdMinShares) {
              user.earlyBird = true;
              user.earlyBirdMult = getEarlyBirdMultiplier(block.number, _pid);  // scaled
            }
            user.score = user.amount.mul(user.earlyBirdMult).div(EARLY_BIRD_PRECISION); // unscale
            pool.totalScore = pool.totalScore.add(user.score).sub(oldScore);
        }
        // update dept regardless of whether score changes or deposit is > 0
        user.rewardDebt = user.score.mul(pool.accChickenPerScore).div(ACC_CHICKEN_PRECISION);
        emit Deposit(_staker, _funder, _pid, _amount);
    }

    function migrateDeposit(uint256 _pid, uint256 _amount, bool _earlyBird, uint256 _earlyBirdMult, address _staker) public {
      require(hasRole(MIGRATOR_ROLE, msg.sender), "FryCookFinal::migrateDeposit: not authorized");
      _deposit(_pid, _amount, _staker, address(msg.sender));

      PoolInfo storage pool = poolInfo[_pid];
      UserInfo storage user = userInfo[_pid][_staker];
      if (_earlyBird) {
        user.earlyBird = true;
        user.earlyBirdMult = Math.max(user.earlyBirdMult, _earlyBirdMult);

        uint256 oldScore = user.score;
        user.score = user.amount.mul(user.earlyBirdMult).div(EARLY_BIRD_PRECISION); // unscale
        user.rewardDebt = user.score.mul(pool.accChickenPerScore).div(ACC_CHICKEN_PRECISION);
        pool.totalScore = pool.totalScore.add(user.score).sub(oldScore);
      }
    }

    // Withdraw staked LP tokens from FryCookFinal. Also transfers pending chicken.
    function withdraw(uint256 _pid, uint256 _amount) public {
        _withdraw(_pid, _amount, address(msg.sender), address(msg.sender));
    }

    // Withdraw a user's staked LP tokens as an agent. Also transfers pending
    // chicken (to the staking user, NOT the agent).
    function withdrawFrom(uint256 _pid, uint256 _amount, address _staker) public {
        require(hasRole(WAITSTAFF_ROLE, msg.sender), "FryCookFinal::withdrawFrom: not authorized");
        _withdraw(_pid, _amount, _staker, address(msg.sender));
    }

    // Withdraw LP tokens from FryCookFinal to the agent. Staked chicken
    // goes to the _staker. We don't support deferred CHKN transfers; every time
    // a deposit or withdrawal happens, pending CHKN must be transferred or
    // the books aren't kept clean.
    function _withdraw(uint256 _pid, uint256 _amount, address _staker, address _agent) internal {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_staker];
        require(user.amount >= _amount, "FryCookFinal::withdraw: not good");
        updatePool(_pid);
        uint256 pending = user.score.mul(pool.accChickenPerScore).div(ACC_CHICKEN_PRECISION).sub(user.rewardDebt);
        if (pending > 0) {
          safeChickenTransfer(_staker, pending);
        }

        // update user info
        if (_amount > 0) {
          uint256 oldScore = user.score;
          user.amount = user.amount.sub(_amount);
          if (user.earlyBird && user.amount < pool.earlyBirdMinShares) {
            user.earlyBird = false;
            user.earlyBirdMult = EARLY_BIRD_PRECISION;
          }
          user.score = user.amount.mul(user.earlyBirdMult).div(EARLY_BIRD_PRECISION); // unscale
          pool.lpToken.safeTransfer(_agent, _amount);
          pool.totalScore = pool.totalScore.add(user.score).sub(oldScore);
        }
        // update reward debt regardless of whether score changed, since debt may have
        user.rewardDebt = user.score.mul(pool.accChickenPerScore).div(ACC_CHICKEN_PRECISION);
        emit Withdraw(_staker, _agent, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        pool.totalScore = pool.totalScore.sub(user.score);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.earlyBird = false;
        user.earlyBirdMult = EARLY_BIRD_PRECISION;
        user.score = 0;
        user.rewardDebt = 0;
    }

    // Safe chicken transfer function, just in case if rounding error causes pool to not have enough CHKNs.
    function safeChickenTransfer(address _to, uint256 _amount) internal {
        uint256 chickenBal = chicken.balanceOf(address(this));
        if (_amount > chickenBal) {
            chicken.transfer(_to, chickenBal);
        } else {
            chicken.transfer(_to, _amount);
        }
    }

    // Update dev address by the previous dev.
    function dev(address _devaddr) public {
        require(msg.sender == devaddr, "FryCookFinal::dev: wut?");
        devaddr = _devaddr;
    }
}
