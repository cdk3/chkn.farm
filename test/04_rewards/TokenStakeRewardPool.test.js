const TokenStakeRewardPool = artifacts.require('TokenStakeRewardPool');
const MockSubordinateManagingTokenPool = artifacts.require('MockSubordinateManagingTokenPool');
const MockERC20 = artifacts.require('MockERC20');
const MockTetherToken = artifacts.require('MockTetherToken');

const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { bn, expandToDecimals } = require('../shared/utilities');

const { AddressZero } = require('ethers').constants;

contract('TokenStakeRewardPool', ([alice, bob, carol, dave, edie, minter, dev]) => {

  beforeEach(async () => {
    this.token = await MockERC20.new('TOKEN1', 'TOKEN', '100000000', { from: minter });
    this.reward = await MockTetherToken.new('100000000', 'REWARD', 'REWARD', 6, { from: minter });
  })

  it('constructor sets public values', async() => {
    const pool = await TokenStakeRewardPool.new(this.token.address, { from:minter });

    assert.equal(await pool.milestone(), '0');
    assert.equal(await pool.defaultMilestoneToken(), this.token.address);
    assert.equal(await pool.milestoneToken(), this.token.address);
    assert.equal(await pool.owner(), minter);
    assert.equal(await pool.tokenPoolSetter(), minter);
    assert.equal(await pool.tokenPool(), AddressZero);
  });

  it('only the tokenPoolSetter can set the manager', async() => {
    const pool = await TokenStakeRewardPool.new(this.token.address, { from:minter });
    const manager = await MockSubordinateManagingTokenPool.new(this.reward.address, 0, 100, [pool.address]);

    await expectRevert(pool.setTokenPool(manager.address, { from:alice }),
      "SubordinatePool::onlyTokenPoolSetter: caller is not the tokenPoolSetter");

    await pool.setTokenPoolSetter(alice, { from:minter });
    assert.equal(await pool.tokenPoolSetter(), alice);

    await expectRevert(pool.setTokenPool(manager.address, { from:minter }),
      "SubordinatePool::onlyTokenPoolSetter: caller is not the tokenPoolSetter");

    await pool.setTokenPool(manager.address, { from:alice });
    assert.equal(await pool.tokenPool(), manager.address);
  });

  it('takes managed values when manager is set', async() => {
    const pool = await TokenStakeRewardPool.new(this.token.address, { from:minter });
    const manager = await MockSubordinateManagingTokenPool.new(this.reward.address, 0, 100, [pool.address]);
    await manager.setProgress(45);
    await pool.setTokenPool(manager.address, { from:minter });

    assert.equal(await pool.milestone(), '0');
    assert.equal(await pool.defaultMilestoneToken(), this.token.address);
    assert.equal(await pool.milestoneToken(), this.token.address);
    assert.equal(await pool.owner(), minter);
    assert.equal(await pool.tokenPoolSetter(), minter);
    assert.equal(await pool.tokenPool(), manager.address);

    assert.equal(await pool.milestoneStart(), '0');
    assert.equal(await pool.milestoneGoal(), '100');
    assert.equal(await pool.milestoneProgress(), '45');
    assert.equal(await pool.token(), this.reward.address);
  });

  it('takes managed values when manager is set', async() => {
    const pool = await TokenStakeRewardPool.new(this.token.address, { from:minter });
    const manager = await MockSubordinateManagingTokenPool.new(this.reward.address, 0, 100, [pool.address]);
    await manager.setProgress(45);
    await pool.setTokenPool(manager.address, { from:minter });

    assert.equal(await pool.milestone(), '0');
    assert.equal(await pool.defaultMilestoneToken(), this.token.address);
    assert.equal(await pool.milestoneToken(), this.token.address);
    assert.equal(await pool.owner(), minter);
    assert.equal(await pool.tokenPoolSetter(), minter);
    assert.equal(await pool.tokenPool(), manager.address);

    assert.equal(await pool.milestoneStart(), '0');
    assert.equal(await pool.milestoneGoal(), '100');
    assert.equal(await pool.milestoneProgress(), '45');
    assert.equal(await pool.token(), this.reward.address);
  });

  context('managing pool milestone progress and unlocks', () => {
    beforeEach(async() => {
      this.pool = await TokenStakeRewardPool.new(this.token.address, { from:minter });
      this.manager = await MockSubordinateManagingTokenPool.new(this.reward.address, 0, 100, [this.pool.address]);
      await this.pool.setTokenPool(this.manager.address, { from:minter });
      this.token2 = await MockERC20.new('TOKEN2', 'TOKEN2', '100000000', { from: minter });
      this.token3 = await MockERC20.new('TOKEN3', 'TOKEN3', '100000000', { from: minter });
    });

    it('can switch to a different managing pool', async () => {
      const { pool } = this;
      const otherManager = await MockSubordinateManagingTokenPool.new(this.token3.address, 0, 100, [pool.address]);
      await otherManager.setProgress(99);
      await pool.setTokenPool(otherManager.address, { from:minter });

      assert.equal(await pool.tokenPool(), otherManager.address);
      assert.equal(await pool.milestoneStart(), '0');
      assert.equal(await pool.milestoneGoal(), '100');
      assert.equal(await pool.milestoneProgress(), '99');
      assert.equal(await pool.token(), this.token3.address);
    });

    it('reverts if switched to a different managing pool with a higher milestone', async () => {
      const { pool } = this;
      const otherManager = await MockSubordinateManagingTokenPool.new(this.token3.address, 1, 100, [pool.address]);
      await otherManager.setProgress(99);
      await expectRevert(pool.setTokenPool(otherManager.address, { from:minter }),
        'SubordinatePool::setTokenPool: milestones must match');
    });

    it('reverts if switched to a different managing pool with a lower milestone', async () => {
      const { pool, manager } = this;

      await manager.setProgress(100);
      await manager.unlock();

      const otherManager = await MockSubordinateManagingTokenPool.new(this.token3.address, 0, 100, [pool.address]);
      await otherManager.setProgress(99);
      await expectRevert(pool.setTokenPool(otherManager.address, { from:minter }),
        'SubordinatePool::setTokenPool: milestones must match');
    });

    it('reflects milestone progress of managing pool', async () => {
      const { pool, manager } = this;
      assert.equal(await pool.milestone(), '0');
      assert.equal(await pool.milestoneStart(), '0');
      assert.equal(await pool.milestoneGoal(), '100');
      assert.equal(await pool.milestoneProgress(), '0');

      await manager.setProgress(74);
      assert.equal(await pool.milestone(), '0');
      assert.equal(await pool.milestoneStart(), '0');
      assert.equal(await pool.milestoneGoal(), '100');
      assert.equal(await pool.milestoneProgress(), '74');

      await manager.setProgress(123);
      assert.equal(await pool.milestone(), '0');
      assert.equal(await pool.milestoneStart(), '0');
      assert.equal(await pool.milestoneGoal(), '100');
      assert.equal(await pool.milestoneProgress(), '123');
    });

    it('advances milestones when the managing pool unlocks', async () => {
      const { pool, manager } = this;

      await manager.setProgress(100);

      assert.equal(await pool.milestone(), '0');
      assert.equal(await pool.milestoneStart(), '0');
      assert.equal(await pool.milestoneGoal(), '100');
      assert.equal(await pool.milestoneProgress(), '100');

      await manager.unlock();

      assert.equal(await pool.milestone(), '1');
      assert.equal(await pool.milestoneStart(), '0');
      assert.equal(await pool.milestoneGoal(), '100');
      assert.equal(await pool.milestoneProgress(), '0');

      await manager.setProgress(123);

      assert.equal(await pool.milestone(), '1');
      assert.equal(await pool.milestoneStart(), '0');
      assert.equal(await pool.milestoneGoal(), '100');
      assert.equal(await pool.milestoneProgress(), '123');

      await manager.unlock();

      assert.equal(await pool.milestone(), '2');
      assert.equal(await pool.milestoneStart(), '0');
      assert.equal(await pool.milestoneGoal(), '100');
      assert.equal(await pool.milestoneProgress(), '0');

      await manager.setProgress(1);

      assert.equal(await pool.milestone(), '2');
      assert.equal(await pool.milestoneStart(), '0');
      assert.equal(await pool.milestoneGoal(), '100');
      assert.equal(await pool.milestoneProgress(), '1');
    });

    it('subordinate pool can unlock manager (iff manager allows)', async () => {
      const { pool, manager } = this;

      assert.equal(await pool.canUnlock(), false);
      assert.equal(await pool.unlock.call(), false);
      await pool.unlock();
      assert.equal(await pool.milestone(), '0');
      assert.equal(await manager.milestone(), '0');
      assert.equal(await pool.milestoneProgress(), '0');
      assert.equal(await manager.milestoneProgress(), '0');

      await manager.setProgress(99);

      assert.equal(await pool.canUnlock(), false);
      assert.equal(await pool.unlock.call(), false);
      await pool.unlock();
      assert.equal(await pool.milestone(), '0');
      assert.equal(await manager.milestone(), '0');
      assert.equal(await pool.milestoneProgress(), '99');
      assert.equal(await manager.milestoneProgress(), '99');

      await manager.setProgress(120);

      assert.equal(await pool.canUnlock(), true);
      assert.equal(await pool.unlock.call(), true);
      await pool.unlock();
      assert.equal(await pool.milestone(), '1');
      assert.equal(await manager.milestone(), '1');
      assert.equal(await pool.milestoneProgress(), '0');
      assert.equal(await manager.milestoneProgress(), '0');

      await manager.setProgress(101);

      assert.equal(await pool.canUnlock(), true);
      assert.equal(await pool.unlock.call(), true);
      await pool.unlock();
      assert.equal(await pool.milestone(), '2');
      assert.equal(await manager.milestone(), '2');
      assert.equal(await pool.milestoneProgress(), '0');
      assert.equal(await manager.milestoneProgress(), '0');
    });

    it('subordinate pool emits Milestone event upon manager unlock, and its own', async () => {
      const { pool, manager } = this;
      let out, tx;

      out = await pool.unlock();
      tx = out.tx;
      await expectEvent.notEmitted.inTransaction(tx, pool, 'Milestone');
      await expectEvent.notEmitted.inTransaction(tx, manager, 'Milestone');

      await manager.setProgress(108);
      out = await pool.unlock();
      tx = out.tx;
      await expectEvent.inTransaction(tx, pool, 'Milestone', { milestone:'0', start:'0', goal:'100', amount:'108' });
      await expectEvent.inTransaction(tx, manager, 'Milestone', { milestone:'0', start:'0', goal:'100', amount:'108' });

      await manager.setProgress(134);
      out = await manager.unlock();
      tx = out.tx;
      await expectEvent.inTransaction(tx, pool, 'Milestone', { milestone:'1', start:'0', goal:'100', amount:'134' });
      await expectEvent.inTransaction(tx, manager, 'Milestone', { milestone:'1', start:'0', goal:'100', amount:'134' });
    });
  })

  context('setting milestone tokens', () => {
    beforeEach(async() => {
      this.pool = await TokenStakeRewardPool.new(this.token.address, { from:minter });;
      this.manager = await MockSubordinateManagingTokenPool.new(this.reward.address, 0, 100, [this.pool.address]);
      await this.pool.setTokenPool(this.manager.address, { from:minter });
      this.token3 = await MockERC20.new('TOKEN3', 'TOKEN3', '100000000', { from: minter });
    });

    it('only owner can setDefaulMilestoneToken', async () => {
      const { pool, token2, token3 } = this;

      await expectRevert(pool.setDefaulMilestoneToken(token2.address, { from:alice }),
        "Ownable: caller is not the owner");
      await pool.setDefaulMilestoneToken(token2.address, { from:minter });
      assert.equal(await pool.defaultMilestoneToken(), token2.address);

      await pool.transferOwnership(alice, { from:minter });
      await expectRevert(pool.setDefaulMilestoneToken(token3.address, { from:minter }),
        "Ownable: caller is not the owner");
      await pool.setDefaulMilestoneToken(token3.address, { from:alice });
      assert.equal(await pool.defaultMilestoneToken(), token3.address);
    });

    it('only owner can setMilestoneToken', async () => {
      const { pool, token2, token3 } = this;

      await expectRevert(pool.setMilestoneToken(1, token2.address, { from:alice }),
        "Ownable: caller is not the owner");
      await pool.setMilestoneToken(1, token2.address, { from:minter });
      assert.equal(await pool.milestoneTokens(1), token2.address);

      await pool.transferOwnership(alice, { from:minter });
      await expectRevert(pool.setMilestoneToken(1, token3.address, { from:minter }),
        "Ownable: caller is not the owner");
      await pool.setMilestoneToken(1, token3.address, { from:alice });
      assert.equal(await pool.milestoneTokens(1), token3.address);
    });

    it('defaultMilestoneToken should be reported for milestone tokens not yet set', async () => {
      const { pool, token, token2, token3 } = this;

      await pool.setMilestoneToken(2, token2.address, { from:minter });
      await pool.setMilestoneToken(3, token3.address, { from:minter });

      assert.equal(await pool.milestoneTokens(1), token.address);
      assert.equal(await pool.milestoneTokens(2), token2.address);
      assert.equal(await pool.milestoneTokens(3), token3.address);
      assert.equal(await pool.milestoneTokens(4), token.address);
    });

    it('setting milestone token for an active or past milestone reverts', async () => {
      const { manager, pool, token, token2, token3, reward } = this;

      await expectRevert(pool.setMilestoneToken(0, token2.address, { from:minter }),
        "TokenStakeRewardPool::setMilestoneToken: milestone already passed");
      await pool.setMilestoneToken(1, token2.address, { from:minter });
      await pool.setMilestoneToken(2, token2.address, { from:minter });

      await manager.setProgress(100);
      await manager.unlock();

      await expectRevert(pool.setMilestoneToken(0, token3.address, { from:minter }),
        "TokenStakeRewardPool::setMilestoneToken: milestone already passed");
      await expectRevert(pool.setMilestoneToken(1, token3.address, { from:minter }),
        "TokenStakeRewardPool::setMilestoneToken: milestone already passed");
      await pool.setMilestoneToken(2, token3.address, { from:minter });

      await manager.setProgress(100);
      await manager.unlock();

      await expectRevert(pool.setMilestoneToken(0, reward.address, { from:minter }),
        "TokenStakeRewardPool::setMilestoneToken: milestone already passed");
      await expectRevert(pool.setMilestoneToken(1, reward.address, { from:minter }),
        "TokenStakeRewardPool::setMilestoneToken: milestone already passed");
      await expectRevert(pool.setMilestoneToken(2, reward.address, { from:minter }),
        "TokenStakeRewardPool::setMilestoneToken: milestone already passed");

      assert.equal(await pool.milestoneTokens(0), token.address);
      assert.equal(await pool.milestoneTokens(1), token2.address);
      assert.equal(await pool.milestoneTokens(2), token3.address);
    });
  })

  context('token deposits', () => {
    beforeEach(async() => {
      this.pool = await TokenStakeRewardPool.new(this.token.address, { from:minter });;
      this.manager = await MockSubordinateManagingTokenPool.new(this.reward.address, 0, 100, [this.pool.address]);
      await this.pool.setTokenPool(this.manager.address, { from:minter });
      this.token2 = await MockERC20.new('TOKEN2', 'TOKEN2', '100000000', { from: minter });
      this.token3 = await MockERC20.new('TOKEN3', 'TOKEN3', '100000000', { from: minter });

      for (const staker of [alice, bob, carol]) {
        await this.token.transfer(staker, 1000, { from:minter  });
        await this.token2.transfer(staker, 1000, { from:minter  });
        await this.token3.transfer(staker, 1000, { from:minter  });
      }
    });

    it('can deposit milestone token for points', async () => {
      const { token, pool } = this;

      await token.approve(pool.address, '1000', { from:alice });
      await pool.deposit(token.address, '14', { from:alice });

      assert.equal(await token.balanceOf(alice), '986');
      assert.equal(await token.balanceOf(pool.address), '14');
      assert.equal(await pool.stakeOf(alice, token.address), '14');
      assert.equal(await pool.points(alice), '14');
      assert.equal(await pool.totalPoints(), '14');

      await pool.deposit(token.address, '5', { from:alice });

      assert.equal(await token.balanceOf(alice), '981');
      assert.equal(await token.balanceOf(pool.address), '19');
      assert.equal(await pool.stakeOf(alice, token.address), '19');
      assert.equal(await pool.points(alice), '19');
      assert.equal(await pool.totalPoints(), '19');

      await token.approve(pool.address, '1000', { from:bob });
      await pool.deposit(token.address, '7', { from:bob });

      assert.equal(await token.balanceOf(bob), '993');
      assert.equal(await token.balanceOf(pool.address), '26');
      assert.equal(await pool.stakeOf(alice, token.address), '19');
      assert.equal(await pool.points(alice), '19');
      assert.equal(await pool.stakeOf(bob, token.address), '7');
      assert.equal(await pool.points(bob), '7');
      assert.equal(await pool.totalPoints(), '26');

      await pool.deposit(token.address, '4', { from:bob });

      assert.equal(await token.balanceOf(bob), '989');
      assert.equal(await token.balanceOf(pool.address), '30');
      assert.equal(await pool.stakeOf(alice, token.address), '19');
      assert.equal(await pool.points(alice), '19');
      assert.equal(await pool.stakeOf(bob, token.address), '11');
      assert.equal(await pool.points(bob), '11');
      assert.equal(await pool.totalPoints(), '30');
    });

    it('can deposit non-milestone tokens for zero points', async () => {
      const { token2, pool } = this;

      await token2.approve(pool.address, '14', { from:alice });
      await pool.deposit(token2.address, '14', { from:alice });

      assert.equal(await token2.balanceOf(alice), '986');
      assert.equal(await token2.balanceOf(pool.address), '14');
      assert.equal(await pool.stakeOf(alice, token2.address), '14');
      assert.equal(await pool.points(alice), '0');
      assert.equal(await pool.totalPoints(), '0');

      await token2.approve(pool.address, '5', { from:alice });
      await pool.deposit(token2.address, '5', { from:alice });

      assert.equal(await token2.balanceOf(alice), '981');
      assert.equal(await token2.balanceOf(pool.address), '19');
      assert.equal(await pool.stakeOf(alice, token2.address), '19');
      assert.equal(await pool.points(alice), '0');
      assert.equal(await pool.totalPoints(), '0');

      await token2.approve(pool.address, '7', { from:bob });
      await pool.deposit(token2.address, '7', { from:bob });

      assert.equal(await token2.balanceOf(bob), '993');
      assert.equal(await token2.balanceOf(pool.address), '26');
      assert.equal(await pool.stakeOf(alice, token2.address), '19');
      assert.equal(await pool.points(alice), '0');
      assert.equal(await pool.stakeOf(bob, token2.address), '7');
      assert.equal(await pool.points(bob), '0');
      assert.equal(await pool.totalPoints(), '0');

      await token2.approve(pool.address, '4', { from:bob });
      await pool.deposit(token2.address, '4', { from:bob });

      assert.equal(await token2.balanceOf(bob), '989');
      assert.equal(await token2.balanceOf(pool.address), '30');
      assert.equal(await pool.stakeOf(alice, token2.address), '19');
      assert.equal(await pool.points(alice), '0');
      assert.equal(await pool.stakeOf(bob, token2.address), '11');
      assert.equal(await pool.points(bob), '0');
      assert.equal(await pool.totalPoints(), '0');
    });

    it('milestone token points are scaled according to milestone progress', async () => {
      const { token, pool, manager } = this;

      await token.approve(pool.address, '14', { from:alice });
      await pool.deposit(token.address, '14', { from:alice });

      assert.equal(await token.balanceOf(alice), '986');
      assert.equal(await token.balanceOf(pool.address), '14');
      assert.equal(await pool.stakeOf(alice, token.address), '14');
      assert.equal(await pool.points(alice), '14');
      assert.equal(await pool.totalPoints(), '14');

      await token.approve(pool.address, '5', { from:bob });
      await pool.deposit(token.address, '5', { from:bob });

      assert.equal(await token.balanceOf(alice), '986');
      assert.equal(await token.balanceOf(bob), '995');
      assert.equal(await token.balanceOf(pool.address), '19');
      assert.equal(await pool.stakeOf(alice, token.address), '14');
      assert.equal(await pool.points(alice), '14');
      assert.equal(await pool.stakeOf(bob, token.address), '5');
      assert.equal(await pool.points(bob), '5');
      assert.equal(await pool.totalPoints(), '19');

      await manager.setProgress(50);

      await token.approve(pool.address, '20', { from:alice });
      await pool.deposit(token.address, '20', { from:alice });

      assert.equal(await token.balanceOf(alice), '966');
      assert.equal(await token.balanceOf(bob), '995');
      assert.equal(await token.balanceOf(pool.address), '39');
      assert.equal(await pool.stakeOf(alice, token.address), '34');
      assert.equal(await pool.points(alice), '24');
      assert.equal(await pool.stakeOf(bob, token.address), '5');
      assert.equal(await pool.points(bob), '5');
      assert.equal(await pool.totalPoints(), '29');

      await manager.setProgress(79);   // 21 left

      await token.approve(pool.address, '100', { from:bob });
      await pool.deposit(token.address, '100', { from:bob });

      assert.equal(await token.balanceOf(alice), '966');
      assert.equal(await token.balanceOf(bob), '895');
      assert.equal(await token.balanceOf(pool.address), '139');
      assert.equal(await pool.stakeOf(alice, token.address), '34');
      assert.equal(await pool.points(alice), '24');
      assert.equal(await pool.stakeOf(bob, token.address), '105');
      assert.equal(await pool.points(bob), '26');
      assert.equal(await pool.totalPoints(), '50');

      await manager.setProgress(100);  // 0 left

      await token.approve(pool.address, '1000', { from:carol });
      await pool.deposit(token.address, '1000', { from:carol });

      assert.equal(await token.balanceOf(alice), '966');
      assert.equal(await token.balanceOf(bob), '895');
      assert.equal(await token.balanceOf(carol), '0');
      assert.equal(await token.balanceOf(pool.address), '1139');
      assert.equal(await pool.stakeOf(alice, token.address), '34');
      assert.equal(await pool.points(alice), '24');
      assert.equal(await pool.stakeOf(bob, token.address), '105');
      assert.equal(await pool.points(bob), '26');
      assert.equal(await pool.stakeOf(carol, token.address), '1000');
      assert.equal(await pool.points(carol), '0');
      assert.equal(await pool.totalPoints(), '50');
    });

    it('depositing emits Deposit events', async () => {
      const { token, token2, pool, manager } = this;
      let out, tx;

      await token.approve(pool.address, '14', { from:alice });
      out = await pool.deposit(token.address, '14', { from:alice });
      tx = out.tx;
      await expectEvent.inTransaction(tx, pool, 'Deposit', { user:alice, token:token.address, amount:'14' });

      await manager.setProgress(77);
      await token.approve(pool.address, '1', { from:alice });
      out = await pool.deposit(token.address, '1', { from:alice });
      tx = out.tx;
      await expectEvent.inTransaction(tx, pool, 'Deposit', { user:alice, token:token.address, amount:'1' });

      await token2.approve(pool.address, '100', { from:bob });
      out = await pool.deposit(token2.address, '100', { from:bob });
      tx = out.tx;
      await expectEvent.inTransaction(tx, pool, 'Deposit', { user:bob, token:token2.address, amount:'100' });
    });
  });

  context('token withdraws', () => {
    beforeEach(async() => {
      this.pool = await TokenStakeRewardPool.new(this.token.address, { from:minter });;
      this.manager = await MockSubordinateManagingTokenPool.new(this.reward.address, 0, 100, [this.pool.address]);
      await this.pool.setTokenPool(this.manager.address, { from:minter });
      this.token2 = await MockERC20.new('TOKEN2', 'TOKEN2', '100000000', { from: minter });
      this.token3 = await MockERC20.new('TOKEN3', 'TOKEN3', '100000000', { from: minter });

      for (const staker of [alice, bob, carol]) {
        await this.token.transfer(staker, 1000, { from:minter  });
        await this.token2.transfer(staker, 1000, { from:minter  });
        await this.token3.transfer(staker, 1000, { from:minter  });

        await this.token.approve(this.pool.address, '1000000000', { from:staker });
        await this.token2.approve(this.pool.address, '1000000000', { from:staker });
        await this.token3.approve(this.pool.address, '1000000000', { from:staker });
      }
    });

    const fund = async (staker, token, amount, contracts = {}) => {
      let pool = contracts.pool || this.pool;
      let manager = contracts.manager || this.manager;

      const progress = bn((await manager.milestoneProgress()).toString());
      const remaining = bn(100).sub(progress);
      const mult = remaining.gt(bn(0)) ? remaining : bn(0);

      const points = (await pool.milestoneToken()) == token.address ? bn(amount).mul(mult).div(bn(100)) : bn(0);

      const prevStakerBalance = bn((await token.balanceOf(staker)).toString());
      const prevPoolBalance = bn((await token.balanceOf(pool.address)).toString());
      const prevStake = bn((await pool.stakeOf(staker, token.address)).toString());
      const prevScore = bn((await pool.points(staker)).toString());
      const prevTotalScore = bn((await pool.totalPoints()).toString());

      let out =  await pool.deposit(token.address, amount, { from:staker });

      assert.equal(await token.balanceOf(staker), prevStakerBalance.sub(amount).toString());
      assert.equal(await token.balanceOf(pool.address), prevPoolBalance.add(amount).toString());
      assert.equal(await pool.stakeOf(staker, token.address), prevStake.add(amount).toString());
      assert.equal(await pool.points(staker), prevScore.add(points).toString());
      assert.equal(await pool.totalPoints(), prevTotalScore.add(points).toString());

      await expectEvent.inTransaction(out.tx, pool, 'Deposit', { user:staker, token:token.address, amount:bn(amount).toString() });
    }

    it('can withdraw milestone token, losing points', async () => {
      const { token, pool, manager } = this;

      await fund(alice, token, '23');
      await fund(bob, token, '7');

      await pool.withdraw(token.address, '14', { from:alice });

      assert.equal(await token.balanceOf(alice), '991');
      assert.equal(await token.balanceOf(bob), '993');
      assert.equal(await token.balanceOf(pool.address), '16');
      assert.equal(await pool.stakeOf(alice, token.address), '9');
      assert.equal(await pool.points(alice), '9');
      assert.equal(await pool.stakeOf(bob, token.address), '7');
      assert.equal(await pool.points(bob), '7');
      assert.equal(await pool.totalPoints(), '16');

      await pool.withdraw(token.address, '7', { from:bob });

      assert.equal(await token.balanceOf(alice), '991');
      assert.equal(await token.balanceOf(bob), '1000');
      assert.equal(await token.balanceOf(pool.address), '9');
      assert.equal(await pool.stakeOf(alice, token.address), '9');
      assert.equal(await pool.points(alice), '9');
      assert.equal(await pool.stakeOf(bob, token.address), '0');
      assert.equal(await pool.points(bob), '0');
      assert.equal(await pool.totalPoints(), '9');

      await pool.withdraw(token.address, '9', { from:alice });

      assert.equal(await token.balanceOf(alice), '1000');
      assert.equal(await token.balanceOf(bob), '1000');
      assert.equal(await token.balanceOf(pool.address), '0');
      assert.equal(await pool.stakeOf(alice, token.address), '0');
      assert.equal(await pool.points(alice), '0');
      assert.equal(await pool.stakeOf(bob, token.address), '0');
      assert.equal(await pool.points(bob), '0');
      assert.equal(await pool.totalPoints(), '0');
    });

    it('can withdraw non-milestone tokens for no point effect', async () => {
      const { token, token2, pool, manager } = this;

      await fund(alice, token, '100');
      await fund(alice, token2, '23');
      await fund(bob, token, '100');
      await fund(bob, token2, '7');

      await pool.withdraw(token2.address, '14', { from:alice });

      assert.equal(await token2.balanceOf(alice), '991');
      assert.equal(await token2.balanceOf(bob), '993');
      assert.equal(await token2.balanceOf(pool.address), '16');
      assert.equal(await pool.stakeOf(alice, token2.address), '9');
      assert.equal(await pool.stakeOf(bob, token2.address), '7');
      assert.equal(await pool.points(alice), '100');
      assert.equal(await pool.points(bob), '100');
      assert.equal(await pool.totalPoints(), '200');

      await pool.withdraw(token2.address, '7', { from:bob });

      assert.equal(await token2.balanceOf(alice), '991');
      assert.equal(await token2.balanceOf(bob), '1000');
      assert.equal(await token2.balanceOf(pool.address), '9');
      assert.equal(await pool.stakeOf(alice, token2.address), '9');
      assert.equal(await pool.stakeOf(bob, token2.address), '0');
      assert.equal(await pool.points(alice), '100');
      assert.equal(await pool.points(bob), '100');
      assert.equal(await pool.totalPoints(), '200');

      await pool.withdraw(token2.address, '9', { from:alice });

      assert.equal(await token2.balanceOf(alice), '1000');
      assert.equal(await token2.balanceOf(bob), '1000');
      assert.equal(await token2.balanceOf(pool.address), '0');
      assert.equal(await pool.stakeOf(alice, token2.address), '0');
      assert.equal(await pool.stakeOf(bob, token2.address), '0');
      assert.equal(await pool.points(alice), '100');
      assert.equal(await pool.points(bob), '100');
      assert.equal(await pool.totalPoints(), '200');
    });

    it('milestone token points are scaled according proportion of stake', async () => {
      const { token, token2, pool, manager } = this;

      await fund(alice, token, '100');
      await fund(alice, token2, '20');
      await fund(bob, token, '50');
      await manager.setProgress(20);
      await fund(alice, token, '100');

      assert.equal(await pool.points(alice), '180');

      await pool.withdraw(token.address, '100', { from:alice });
      assert.equal(await token.balanceOf(alice), '900');
      assert.equal(await token.balanceOf(pool.address), '150');
      assert.equal(await pool.stakeOf(alice, token.address), '100');
      assert.equal(await token2.balanceOf(pool.address), '20');
      assert.equal(await pool.stakeOf(alice, token2.address), '20');
      assert.equal(await pool.points(alice), '90');
      assert.equal(await pool.totalPoints(), '140');

      await pool.withdraw(token.address, '10', { from:alice });
      assert.equal(await token.balanceOf(alice), '910');
      assert.equal(await token.balanceOf(pool.address), '140');
      assert.equal(await pool.stakeOf(alice, token.address), '90');
      assert.equal(await token2.balanceOf(pool.address), '20');
      assert.equal(await pool.stakeOf(alice, token2.address), '20');
      assert.equal(await pool.points(alice), '81');
      assert.equal(await pool.totalPoints(), '131');

      await pool.withdraw(token2.address, '10', { from:alice });
      assert.equal(await token.balanceOf(alice), '910');
      assert.equal(await token.balanceOf(pool.address), '140');
      assert.equal(await pool.stakeOf(alice, token.address), '90');
      assert.equal(await token2.balanceOf(pool.address), '10');
      assert.equal(await pool.stakeOf(alice, token2.address), '10');
      assert.equal(await pool.points(alice), '81');
      assert.equal(await pool.totalPoints(), '131');
    });

    it('milestone token points are scaled according proportion of stake, even for very large amounts', async () => {
      const { token2 } = this;
      const token = await MockERC20.new('TOKEN1', 'TOKEN', expandToDecimals(1, 70), { from: minter });
      const pool = await TokenStakeRewardPool.new(token.address, { from:minter });
      const manager = await MockSubordinateManagingTokenPool.new(this.reward.address, 0, 100, [pool.address]);
      await pool.setTokenPool(manager.address, { from:minter });

      for (const staker of [alice, bob]) {
        const amount = expandToDecimals('1000', 50);
        await token.transfer(staker, amount.toString(), { from:minter });
        await token.approve(pool.address, amount.toString(), { from:staker });
        await token2.approve(pool.address, amount.toString(), { from:staker });
      }

      await fund(alice, token, expandToDecimals('100', 50), { pool, manager });
      await fund(alice, token2, '20', { pool, manager });
      await fund(bob, token, expandToDecimals('50', 50), { pool, manager });
      await manager.setProgress(20);
      await fund(alice, token, expandToDecimals('100', 50), { pool, manager });

      assert.equal(await pool.points(alice), expandToDecimals('180', 50).toString());

      await pool.withdraw(token.address, expandToDecimals('100', 50), { from:alice });
      let aliceBalance = bn(await token.balanceOf(alice));
      let poolBalance = bn(await token.balanceOf(pool.address));
      let poolBalance2 = bn(await token2.balanceOf(pool.address));
      let stake = bn(await pool.stakeOf(alice, token.address));
      let stake2 = bn(await pool.stakeOf(alice, token2.address));
      let points = bn(await pool.points(alice));
      let totalPoints = bn(await pool.totalPoints());
      assert.equal(aliceBalance.toString(), expandToDecimals('900', 50).toString());
      assert.equal(poolBalance.toString(), expandToDecimals('150', 50).toString());
      assert.equal(stake.toString(), expandToDecimals('100', 50).toString());
      assert.equal(poolBalance2.toString(), '20');
      assert.equal(stake2.toString(), '20');
      assert.equal(points.toString(), expandToDecimals('90', 50).toString());
      assert.equal(totalPoints.toString(), expandToDecimals('140', 50).toString());

      await pool.withdraw(token.address, expandToDecimals('10', 50), { from:alice });
      aliceBalance = bn(await token.balanceOf(alice));
      poolBalance = bn(await token.balanceOf(pool.address));
      poolBalance2 = bn(await token2.balanceOf(pool.address));
      stake = bn(await pool.stakeOf(alice, token.address));
      stake2 = bn(await pool.stakeOf(alice, token2.address));
      points = bn(await pool.points(alice));
      totalPoints = bn(await pool.totalPoints());
      assert.equal(aliceBalance.toString(), expandToDecimals('910', 50).toString());
      assert.equal(poolBalance.toString(), expandToDecimals('140', 50).toString());
      assert.equal(stake.toString(), expandToDecimals('90', 50).toString());
      assert.equal(poolBalance2.toString(), '20');
      assert.equal(stake2.toString(), '20');
      assert.equal(points.toString(), expandToDecimals('81', 50).toString());
      assert.equal(totalPoints.toString(), expandToDecimals('131', 50).toString());

      await pool.withdraw(token2.address, '10', { from:alice });
      aliceBalance = bn(await token.balanceOf(alice));
      poolBalance = bn(await token.balanceOf(pool.address));
      poolBalance2 = bn(await token2.balanceOf(pool.address));
      stake = bn(await pool.stakeOf(alice, token.address));
      stake2 = bn(await pool.stakeOf(alice, token2.address));
      points = bn(await pool.points(alice));
      totalPoints = bn(await pool.totalPoints());
      assert.equal(aliceBalance.toString(), expandToDecimals('910', 50).toString());
      assert.equal(poolBalance.toString(), expandToDecimals('140', 50).toString());
      assert.equal(stake.toString(), expandToDecimals('90', 50).toString());
      assert.equal(poolBalance2.toString(), '10');
      assert.equal(stake2.toString(), '10');
      assert.equal(points.toString(), expandToDecimals('81', 50).toString());
      assert.equal(totalPoints.toString(), expandToDecimals('131', 50).toString());
    });

    it('withdraws emit Withdraw event', async () => {
      const { token, pool, manager } = this;

      await fund(alice, token, '100');
      await fund(bob, token, '100');

      let out = await pool.withdraw(token.address, 50, { from:alice });
      await expectEvent.inTransaction(out.tx, pool, 'Withdraw', { user:alice, token:token.address, amount:'50' });

      await manager.setProgress(37);
      out = await pool.withdraw(token.address, 20, { from:alice });
      await expectEvent.inTransaction(out.tx, pool, 'Withdraw', { user:alice, token:token.address, amount:'20' });

      await manager.setProgress(60);
      out = await pool.withdraw(token.address, 23, { from:bob });
      await expectEvent.inTransaction(out.tx, pool, 'Withdraw', { user:bob, token:token.address, amount:'23' });
    })
  });

  context('milestone rewards', () => {
    beforeEach(async() => {
      this.pool = await TokenStakeRewardPool.new(this.token.address, { from:minter });;
      this.manager = await MockSubordinateManagingTokenPool.new(this.reward.address, 0, 100, [this.pool.address]);
      await this.pool.setTokenPool(this.manager.address, { from:minter });
      this.token2 = await MockERC20.new('TOKEN2', 'TOKEN2', '100000000', { from: minter });
      this.token3 = await MockERC20.new('TOKEN3', 'TOKEN3', '100000000', { from: minter });

      for (const staker of [alice, bob, carol]) {
        await this.token.transfer(staker, 1000, { from:minter  });
        await this.token2.transfer(staker, 1000, { from:minter  });
        await this.token3.transfer(staker, 1000, { from:minter  });

        await this.token.approve(this.pool.address, '1000000000', { from:staker });
        await this.token2.approve(this.pool.address, '1000000000', { from:staker });
        await this.token3.approve(this.pool.address, '1000000000', { from:staker });
      }
    });

    const fund = async (staker, token, amount, contracts = {}) => {
      let pool = contracts.pool || this.pool;
      let manager = contracts.manager || this.manager;

      const progress = bn((await manager.milestoneProgress()).toString());
      const remaining = bn(100).sub(progress);
      const mult = remaining.gt(bn(0)) ? remaining : bn(0);

      const points = (await pool.milestoneToken()) == token.address ? bn(amount).mul(mult).div(bn(100)) : bn(0);

      const prevStakerBalance = bn((await token.balanceOf(staker)).toString());
      const prevPoolBalance = bn((await token.balanceOf(pool.address)).toString());
      const prevStake = bn((await pool.stakeOf(staker, token.address)).toString());
      const prevScore = bn((await pool.points(staker)).toString());
      const prevTotalScore = bn((await pool.totalPoints()).toString());

      let out =  await pool.deposit(token.address, amount, { from:staker });

      assert.equal(await token.balanceOf(staker), prevStakerBalance.sub(amount).toString());
      assert.equal(await token.balanceOf(pool.address), prevPoolBalance.add(amount).toString());
      assert.equal(await pool.stakeOf(staker, token.address), prevStake.add(amount).toString());
      assert.equal(await pool.points(staker), prevScore.add(points).toString());
      assert.equal(await pool.totalPoints(), prevTotalScore.add(points).toString());

      await expectEvent.inTransaction(out.tx, pool, 'Deposit', { user:staker, token:token.address, amount:bn(amount).toString() });
    }

    const depositTokens = async (token, deposits, contracts = {}) => {
      for (const deposit of deposits) {
        await fund(deposit.user, token, deposit.amount, contracts);
      }
    };

    const defund = async (staker, token, amount, contracts = {}) => {
      let pool = contracts.pool || this.pool;
      let manager = contracts.manager || this.manager;

      const prevStake = bn((await pool.stakeOf(staker, token.address)).toString());
      const prevScore = bn((await pool.points(staker)).toString());

      const points = (await pool.milestoneToken()) == token.address ? prevScore.mul(amount).div(prevStake) : bn(0);

      const prevStakerBalance = bn((await token.balanceOf(staker)).toString());
      const prevPoolBalance = bn((await token.balanceOf(pool.address)).toString());

      const prevTotalScore = bn((await pool.totalPoints()).toString());

      let out =  await pool.withdraw(token.address, amount, { from:staker });
      assert.equal(await token.balanceOf(staker), prevStakerBalance.add(amount).toString());
      assert.equal(await token.balanceOf(pool.address), prevPoolBalance.sub(amount).toString());
      assert.equal(await pool.stakeOf(staker, token.address), prevStake.sub(amount).toString());
      assert.equal(await pool.points(staker), prevScore.sub(points).toString());
      assert.equal(await pool.totalPoints(), prevTotalScore.sub(points).toString());

      await expectEvent.inTransaction(out.tx, pool, 'Withdraw', { user:staker, token:token.address, amount:bn(amount).toString() });
    }

    const withdrawTokens = async (token, withdraws, contracts = {}) => {
      for (const withdraw of withdraws) {
        await defund(withdraw.user, token, withdraw.amount, contracts);
      }
    }

    it('rewards set to 0 if no stakers for a milestone', async () => {
      const { token, pool, reward, manager } = this;
      await reward.transfer(pool.address, '1000', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '1000');
      assert.equal(await pool.reward(alice), '0');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.totalReward(), '0');
      assert.equal(await pool.totalUnclaimedReward(), '0');
    });

    it('contract balance used as rewards if any stakers in a milestone', async () => {
      const { token, pool, reward, manager } = this;
      await reward.transfer(pool.address, '1000', { from:minter });
      await fund(alice, token, '500');
      await manager.setProgress(100);
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '1000');
      assert.equal(await pool.reward(alice), '1000');
      assert.equal(await pool.unclaimedReward(alice), '1000');
      assert.equal(await pool.totalReward(), '1000');
      assert.equal(await pool.totalUnclaimedReward(), '1000');

      await reward.transfer(pool.address, '1000', { from:minter });

      assert.equal(await reward.balanceOf(pool.address), '2000');
      assert.equal(await pool.reward(alice), '1000');
      assert.equal(await pool.unclaimedReward(alice), '1000');
      assert.equal(await pool.totalReward(), '1000');
      assert.equal(await pool.totalUnclaimedReward(), '1000');

      await manager.setProgress(100);
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '2000');
      assert.equal(await pool.reward(alice), '2000');
      assert.equal(await pool.unclaimedReward(alice), '2000');
      assert.equal(await pool.totalReward(), '2000');
      assert.equal(await pool.totalUnclaimedReward(), '2000');

      await defund(alice, token, '500');
      await reward.transfer(pool.address, '1000', { from:minter });

      assert.equal(await reward.balanceOf(pool.address), '3000');
      assert.equal(await pool.reward(alice), '2000');
      assert.equal(await pool.unclaimedReward(alice), '2000');
      assert.equal(await pool.totalReward(), '2000');
      assert.equal(await pool.totalUnclaimedReward(), '2000');

      await manager.setProgress(100);
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '3000');
      assert.equal(await pool.reward(alice), '2000');
      assert.equal(await pool.unclaimedReward(alice), '2000');
      assert.equal(await pool.totalReward(), '2000');
      assert.equal(await pool.totalUnclaimedReward(), '2000');
    });

    it('sole staker can claim rewards', async () => {
      const { token, pool, reward, manager } = this;

      await reward.transfer(pool.address, '1000', { from:minter });
      await fund(alice, token, '500');
      assert.equal(await reward.balanceOf(pool.address), '1000');
      assert.equal(await reward.balanceOf(alice), '0');
      assert.equal(await pool.reward(alice), '0');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.totalReward(), '0');
      assert.equal(await pool.totalUnclaimedReward(), '0');

      await manager.setProgress(100);
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '1000');
      assert.equal(await reward.balanceOf(alice), '0');
      assert.equal(await pool.reward(alice), '1000');
      assert.equal(await pool.unclaimedReward(alice), '1000');
      assert.equal(await pool.totalReward(), '1000');
      assert.equal(await pool.totalUnclaimedReward(), '1000');

      await pool.claim({ from:alice });

      assert.equal(await reward.balanceOf(pool.address), '0');
      assert.equal(await reward.balanceOf(alice), '1000');
      assert.equal(await pool.reward(alice), '1000');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.totalReward(), '1000');
      assert.equal(await pool.totalUnclaimedReward(), '0');
    });

    it('stakers can claim rewards proportional to their score', async () => {
      const { token, pool, reward, manager } = this;

      await reward.transfer(pool.address, '1000', { from:minter });
      await depositTokens(token, [
        { user:alice, amount:35 },
        { user:bob,   amount:10 },
        { user:carol, amount:55 },
        { user:dave, amount: 0 }
      ]);
      assert.equal(await reward.balanceOf(pool.address), '1000');
      assert.equal(await reward.balanceOf(alice), '0');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '0');
      assert.equal(await pool.reward(bob), '0');
      assert.equal(await pool.reward(carol), '0');
      assert.equal(await pool.reward(dave), '0');
      assert.equal(await pool.reward(edie), '0');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.unclaimedReward(carol), '0');
      assert.equal(await pool.unclaimedReward(dave), '0');
      assert.equal(await pool.unclaimedReward(edie), '0');
      assert.equal(await pool.totalReward(), '0');
      assert.equal(await pool.totalUnclaimedReward(), '0');

      await manager.setProgress(100);
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '1000');
      assert.equal(await reward.balanceOf(alice), '0');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '350');
      assert.equal(await pool.reward(bob), '100');
      assert.equal(await pool.reward(carol), '550');
      assert.equal(await pool.reward(dave), '0');
      assert.equal(await pool.reward(edie), '0');
      assert.equal(await pool.unclaimedReward(alice), '350');
      assert.equal(await pool.unclaimedReward(bob), '100');
      assert.equal(await pool.unclaimedReward(carol), '550');
      assert.equal(await pool.unclaimedReward(dave), '0');
      assert.equal(await pool.unclaimedReward(edie), '0');
      assert.equal(await pool.totalReward(), '1000');
      assert.equal(await pool.totalUnclaimedReward(), '1000');

      // alice claims
      await pool.claim({ from:alice });

      assert.equal(await reward.balanceOf(pool.address), '650');
      assert.equal(await reward.balanceOf(alice), '350');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '350');
      assert.equal(await pool.reward(bob), '100');
      assert.equal(await pool.reward(carol), '550');
      assert.equal(await pool.reward(dave), '0');
      assert.equal(await pool.reward(edie), '0');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '100');
      assert.equal(await pool.unclaimedReward(carol), '550');
      assert.equal(await pool.unclaimedReward(dave), '0');
      assert.equal(await pool.unclaimedReward(edie), '0');
      assert.equal(await pool.totalReward(), '1000');
      assert.equal(await pool.totalUnclaimedReward(), '650');

      // alice claims again (no effect)
      await pool.claim({ from:alice });

      assert.equal(await reward.balanceOf(pool.address), '650');
      assert.equal(await reward.balanceOf(alice), '350');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '350');
      assert.equal(await pool.reward(bob), '100');
      assert.equal(await pool.reward(carol), '550');
      assert.equal(await pool.reward(dave), '0');
      assert.equal(await pool.reward(edie), '0');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '100');
      assert.equal(await pool.unclaimedReward(carol), '550');
      assert.equal(await pool.unclaimedReward(dave), '0');
      assert.equal(await pool.unclaimedReward(edie), '0');
      assert.equal(await pool.totalReward(), '1000');
      assert.equal(await pool.totalUnclaimedReward(), '650');

      // bob claims
      await pool.claim({ from:bob });

      assert.equal(await reward.balanceOf(pool.address), '550');
      assert.equal(await reward.balanceOf(alice), '350');
      assert.equal(await reward.balanceOf(bob), '100');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '350');
      assert.equal(await pool.reward(bob), '100');
      assert.equal(await pool.reward(carol), '550');
      assert.equal(await pool.reward(dave), '0');
      assert.equal(await pool.reward(edie), '0');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.unclaimedReward(carol), '550');
      assert.equal(await pool.unclaimedReward(dave), '0');
      assert.equal(await pool.unclaimedReward(edie), '0');
      assert.equal(await pool.totalReward(), '1000');
      assert.equal(await pool.totalUnclaimedReward(), '550');

      // carol claims
      await pool.claim({ from:carol });

      assert.equal(await reward.balanceOf(pool.address), '0');
      assert.equal(await reward.balanceOf(alice), '350');
      assert.equal(await reward.balanceOf(bob), '100');
      assert.equal(await reward.balanceOf(carol), '550');
      assert.equal(await pool.reward(alice), '350');
      assert.equal(await pool.reward(bob), '100');
      assert.equal(await pool.reward(carol), '550');
      assert.equal(await pool.reward(dave), '0');
      assert.equal(await pool.reward(edie), '0');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.unclaimedReward(carol), '0');
      assert.equal(await pool.unclaimedReward(dave), '0');
      assert.equal(await pool.unclaimedReward(edie), '0');
      assert.equal(await pool.totalReward(), '1000');
      assert.equal(await pool.totalUnclaimedReward(), '0');
    });

    it('stakers can claim accumulating rewards across milestones', async () => {
      const { token, pool, reward, manager } = this;

      await reward.transfer(pool.address, '1000', { from:minter });
      await depositTokens(token, [
        { user:alice, amount:35 },
        { user:bob,   amount:10 },
        { user:carol, amount:55 }
      ]);

      // alice will claim every time; bob claims the second and third, carol claims at the end

      await manager.setProgress(100);
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '1000');
      assert.equal(await reward.balanceOf(alice), '0');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '350');
      assert.equal(await pool.reward(bob), '100');
      assert.equal(await pool.reward(carol), '550');
      assert.equal(await pool.unclaimedReward(alice), '350');
      assert.equal(await pool.unclaimedReward(bob), '100');
      assert.equal(await pool.unclaimedReward(carol), '550');
      assert.equal(await pool.totalReward(), '1000');
      assert.equal(await pool.totalUnclaimedReward(), '1000');

      // alice claims
      await pool.claim({ from:alice });

      assert.equal(await reward.balanceOf(pool.address), '650');
      assert.equal(await reward.balanceOf(alice), '350');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '350');
      assert.equal(await pool.reward(bob), '100');
      assert.equal(await pool.reward(carol), '550');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '100');
      assert.equal(await pool.unclaimedReward(carol), '550');
      assert.equal(await pool.totalReward(), '1000');
      assert.equal(await pool.totalUnclaimedReward(), '650');

      await reward.transfer(pool.address, '1000', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '1650');
      assert.equal(await reward.balanceOf(alice), '350');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '700');
      assert.equal(await pool.reward(bob), '200');
      assert.equal(await pool.reward(carol), '1100');
      assert.equal(await pool.unclaimedReward(alice), '350');
      assert.equal(await pool.unclaimedReward(bob), '200');
      assert.equal(await pool.unclaimedReward(carol), '1100');
      assert.equal(await pool.totalReward(), '2000');
      assert.equal(await pool.totalUnclaimedReward(), '1650');

      await pool.claim({ from:alice });
      await pool.claim({ from:bob });

      assert.equal(await reward.balanceOf(pool.address), '1100');
      assert.equal(await reward.balanceOf(alice), '700');
      assert.equal(await reward.balanceOf(bob), '200');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '700');
      assert.equal(await pool.reward(bob), '200');
      assert.equal(await pool.reward(carol), '1100');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.unclaimedReward(carol), '1100');
      assert.equal(await pool.totalReward(), '2000');
      assert.equal(await pool.totalUnclaimedReward(), '1100');

      await reward.transfer(pool.address, '1000', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '2100');
      assert.equal(await reward.balanceOf(alice), '700');
      assert.equal(await reward.balanceOf(bob), '200');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '1050');
      assert.equal(await pool.reward(bob), '300');
      assert.equal(await pool.reward(carol), '1650');
      assert.equal(await pool.unclaimedReward(alice), '350');
      assert.equal(await pool.unclaimedReward(bob), '100');
      assert.equal(await pool.unclaimedReward(carol), '1650');
      assert.equal(await pool.totalReward(), '3000');
      assert.equal(await pool.totalUnclaimedReward(), '2100');

      await pool.claim({ from:alice });
      await pool.claim({ from:bob });
      await pool.claim({ from:carol });

      assert.equal(await reward.balanceOf(pool.address), '0');
      assert.equal(await reward.balanceOf(alice), '1050');
      assert.equal(await reward.balanceOf(bob), '300');
      assert.equal(await reward.balanceOf(carol), '1650');
      assert.equal(await pool.reward(alice), '1050');
      assert.equal(await pool.reward(bob), '300');
      assert.equal(await pool.reward(carol), '1650');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.unclaimedReward(carol), '0');
      assert.equal(await pool.totalReward(), '3000');
      assert.equal(await pool.totalUnclaimedReward(), '0');
    });

    it('claims emit Claim events for the first call by user after milestone', async () => {
      const { token, pool, reward, manager } = this;
      let out;

      await reward.transfer(pool.address, '1000', { from:minter });
      await depositTokens(token, [
        { user:alice, amount:35 },
        { user:bob,   amount:10 },
        { user:carol, amount:55 }
      ]);

      out = await pool.claim({ from:alice });
      await expectEvent.notEmitted.inTransaction(out.tx, pool, 'Claim');

      await manager.setProgress(100);
      await manager.unlock();

      // alice claims
      out = await pool.claim({ from:alice });
      await expectEvent.inTransaction(out.tx, pool, 'Claim', { user:alice, amount:'350' });
      out = await pool.claim({ from:alice });
      await expectEvent.notEmitted.inTransaction(out.tx, pool, 'Claim');

      await reward.transfer(pool.address, '1000', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();

      out = await pool.claim({ from:alice });
      await expectEvent.inTransaction(out.tx, pool, 'Claim', { user:alice, amount:'350' });
      out = await pool.claim({ from:alice });
      await expectEvent.notEmitted.inTransaction(out.tx, pool, 'Claim');
      out = await pool.claim({ from:bob });
      await expectEvent.inTransaction(out.tx, pool, 'Claim', { user:bob, amount:'200' });
      out = await pool.claim({ from:bob });
      await expectEvent.notEmitted.inTransaction(out.tx, pool, 'Claim');

      await reward.transfer(pool.address, '1000', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();

      out = await pool.claim({ from:alice });
      await expectEvent.inTransaction(out.tx, pool, 'Claim', { user:alice, amount:'350' });
      out = await pool.claim({ from:alice });
      await expectEvent.notEmitted.inTransaction(out.tx, pool, 'Claim');
      out = await pool.claim({ from:bob });
      await expectEvent.inTransaction(out.tx, pool, 'Claim', { user:bob, amount:'100' });
      out = await pool.claim({ from:bob });
      await expectEvent.notEmitted.inTransaction(out.tx, pool, 'Claim');
      out = await pool.claim({ from:carol });
      await expectEvent.inTransaction(out.tx, pool, 'Claim', { user:carol, amount:'1650' });
      out = await pool.claim({ from:carol });
      await expectEvent.notEmitted.inTransaction(out.tx, pool, 'Claim');
    });

    it('rewards are proportional to score, not amount (i.e. decline as staking time increases)', async () => {
      const { token, pool, reward, manager } = this;

      await reward.transfer(pool.address, '1000', { from:minter });
      await depositTokens(token, [
        { user:alice, amount:10 },
        { user:bob,   amount:20 },
        { user:carol, amount:30 }
      ]); // total points 60

      await manager.setProgress(50);
      await depositTokens(token, [
        { user:alice, amount:10 },  // = 15
        { user:bob,   amount:20}    // = 30
      ]); // total points 75

      await manager.setProgress(90);
      await depositTokens(token, [
        { user:alice, amount:100 },  // = 25
        { user:bob,   amount:150}    // = 45
      ]); // total points 100.

      await manager.setProgress(100);
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '1000');
      assert.equal(await reward.balanceOf(alice), '0');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '250');
      assert.equal(await pool.reward(bob), '450');
      assert.equal(await pool.reward(carol), '300');
      assert.equal(await pool.unclaimedReward(alice), '250');
      assert.equal(await pool.unclaimedReward(bob), '450');
      assert.equal(await pool.unclaimedReward(carol), '300');
      assert.equal(await pool.totalReward(), '1000');
      assert.equal(await pool.totalUnclaimedReward(), '1000');

      await pool.claim({ from:alice });
      await pool.claim({ from:bob });
      await pool.claim({ from:carol });

      assert.equal(await reward.balanceOf(pool.address), '0');
      assert.equal(await reward.balanceOf(alice), '250');
      assert.equal(await reward.balanceOf(bob), '450');
      assert.equal(await reward.balanceOf(carol), '300');
      assert.equal(await pool.reward(alice), '250');
      assert.equal(await pool.reward(bob), '450');
      assert.equal(await pool.reward(carol), '300');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.unclaimedReward(carol), '0');
      assert.equal(await pool.totalReward(), '1000');
      assert.equal(await pool.totalUnclaimedReward(), '0');
    });

    it('tokens carried over to the next milestone award full points, and proportional reward', async () => {
      const { token, pool, reward, manager } = this;

      await depositTokens(token, [
        { user:alice, amount:10 },
        { user:bob,   amount:20 },
        { user:carol, amount:30 }
      ]); // total points 60

      await manager.setProgress(50);
      await depositTokens(token, [
        { user:alice, amount:10 },  // = 15
        { user:bob,   amount:20}    // = 30
      ]); // total points 75

      await manager.setProgress(90);
      await depositTokens(token, [
        { user:alice, amount:100 },  // = 25
        { user:bob,   amount:150}    // = 45
      ]); // total points 100.

      await reward.transfer(pool.address, '1000', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();

      await pool.claim({ from:alice }); // claim alice's 250; 750 remains
      await fund(carol, token, '10');
      // stakes:
      // alice 120
      // bob   190
      // carol 40
      // total: 350.

      await reward.transfer(pool.address, '3500', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '4250');   // 4500 - 250
      assert.equal(await reward.balanceOf(alice), '250');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '1450');   // 250 + 1200
      assert.equal(await pool.reward(bob), '2350');     // 450 + 1900
      assert.equal(await pool.reward(carol), '700');    // 300 + 400
      assert.equal(await pool.unclaimedReward(alice), '1200');
      assert.equal(await pool.unclaimedReward(bob), '2350');
      assert.equal(await pool.unclaimedReward(carol), '700');
      assert.equal(await pool.totalReward(), '4500');
      assert.equal(await pool.totalUnclaimedReward(), '4250');

      await pool.claim({ from:alice });

      await reward.transfer(pool.address, '3500', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '6550');   // 4500 + 3500 - 1450
      assert.equal(await reward.balanceOf(alice), '1450');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '2650');   // 250 + 1200 + 1200
      assert.equal(await pool.reward(bob), '4250');     // 450 + 1900 + 1900
      assert.equal(await pool.reward(carol), '1100');    // 300 + 400 + 400
      assert.equal(await pool.unclaimedReward(alice), '1200');
      assert.equal(await pool.unclaimedReward(bob), '4250');
      assert.equal(await pool.unclaimedReward(carol), '1100');
      assert.equal(await pool.totalReward(), '8000');
      assert.equal(await pool.totalUnclaimedReward(), '6550');
    });

    it('tokens carried over to the next milestone award full points, and proportional reward, if they are the milestone token', async () => {
      const { token, token2, pool, reward, manager } = this;

      await pool.setMilestoneToken(1, token2.address, { from:minter });
      await pool.setMilestoneToken(3, token2.address, { from:minter });

      await depositTokens(token, [
        { user:alice, amount:10 },
        { user:bob,   amount:20 },
        { user:carol, amount:30 }
      ]); // total points 60

      await manager.setProgress(50);
      await depositTokens(token, [
        { user:alice, amount:10 },  // = 15
        { user:bob,   amount:20}    // = 30
      ]); // total points 75

      await manager.setProgress(90);
      await depositTokens(token, [
        { user:alice, amount:100 },  // = 25
        { user:bob,   amount:150}    // = 45
      ]); // total points 100.

      await depositTokens(token2, [
        { user:alice, amount:500},
        { user:bob,   amount:300},
        { user:carol, amount:200}
      ])  // total 2: 1000

      await reward.transfer(pool.address, '1000', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();

      await pool.claim({ from:alice }); // claim alice's 250; 750 remains
      await fund(carol, token, '10');
      // stakes:
      // alice 120
      // bob   190
      // carol 40
      // total: 350.

      await reward.transfer(pool.address, '1000', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();
      // stakes for that milestone:
      // alice 500
      // bob 300
      // carol 200

      assert.equal(await reward.balanceOf(pool.address), '1750');   // 2000 - 250
      assert.equal(await reward.balanceOf(alice), '250');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '750');   // 250 + 500
      assert.equal(await pool.reward(bob), '750');     // 450 + 300
      assert.equal(await pool.reward(carol), '500');    // 300 + 200
      assert.equal(await pool.unclaimedReward(alice), '500');
      assert.equal(await pool.unclaimedReward(bob), '750');
      assert.equal(await pool.unclaimedReward(carol), '500');
      assert.equal(await pool.totalReward(), '2000');
      assert.equal(await pool.totalUnclaimedReward(), '1750');

      await pool.claim({ from:alice });

      await reward.transfer(pool.address, '3500', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();
      // stakes for that milestone:
      // alice 120
      // bob   190
      // carol 40
      // total: 350.

      assert.equal(await reward.balanceOf(pool.address), '4750');   // 5500 - 750
      assert.equal(await reward.balanceOf(alice), '750');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '1950');   // 750 + 1200
      assert.equal(await pool.reward(bob), '2650');     // 750 + 1900
      assert.equal(await pool.reward(carol), '900');    // 500 + 400
      assert.equal(await pool.unclaimedReward(alice), '1200');
      assert.equal(await pool.unclaimedReward(bob), '2650');
      assert.equal(await pool.unclaimedReward(carol), '900');
      assert.equal(await pool.totalReward(), '5500');
      assert.equal(await pool.totalUnclaimedReward(), '4750');

      await pool.claim({ from:alice });

      await reward.transfer(pool.address, '1000', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();
      // stakes for that milestone:
      // alice 500
      // bob 300
      // carol 200

      assert.equal(await reward.balanceOf(pool.address), '4550');   // 6500 - 1950
      assert.equal(await reward.balanceOf(alice), '1950');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '2450');   // 1950 + 500
      assert.equal(await pool.reward(bob), '2950');     // 2650 + 300
      assert.equal(await pool.reward(carol), '1100');    // 900 + 200
      assert.equal(await pool.unclaimedReward(alice), '500');
      assert.equal(await pool.unclaimedReward(bob), '2950');
      assert.equal(await pool.unclaimedReward(carol), '1100');
      assert.equal(await pool.totalReward(), '6500');
      assert.equal(await pool.totalUnclaimedReward(), '4550');
    });

    it('"reward tokens" used as milestone tokens properly distinguish between reward funds and deposited funds', async () => {
      // Note: the deployed  version of TokenStakeRewardPool requires a correct ERC20
      // implementation for its milestone tokens, which USDT is not.
      const { pool, token } = this;
      const manager = await MockSubordinateManagingTokenPool.new(token.address, 0, 100, [this.pool.address]);
      await pool.setTokenPool(manager.address, { from:minter });

      await manager.setProgress(100);
      await manager.unlock();

      await depositTokens(token, [
        { user:alice, amount:10 },
        { user:bob,   amount:20 },
        { user:carol, amount:30 }
      ], { pool, manager }); // total points 60

      await manager.setProgress(50);
      await depositTokens(token, [
        { user:alice, amount:10 },  // = 15
        { user:bob,   amount:20}    // = 30
      ], { pool, manager }); // total points 75

      await manager.setProgress(90);
      await depositTokens(token, [
        { user:alice, amount:100 },  // = 25
        { user:bob,   amount:150}    // = 45
      ], { pool, manager }); // total points 100.

      await token.transfer(pool.address, '1000', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();

      await pool.claim({ from:alice }); // claim alice's 250; 750 remains
      await fund(carol, token, '10', { pool, manager });
      // stakes:
      // alice 120
      // bob   190
      // carol 40
      // total: 350.

      await token.transfer(pool.address, '3500', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();

      assert.equal(await token.balanceOf(pool.address), '4600');   // 4500 - 250 + 350
      assert.equal(await token.balanceOf(alice), '1130');   // 1000 + 250 - 120
      assert.equal(await token.balanceOf(bob), '810');        // 1000 - 190
      assert.equal(await token.balanceOf(carol), '960');        // 1000 - 40
      assert.equal(await pool.reward(alice), '1450');   // 250 + 1200
      assert.equal(await pool.reward(bob), '2350');     // 450 + 1900
      assert.equal(await pool.reward(carol), '700');    // 300 + 400
      assert.equal(await pool.unclaimedReward(alice), '1200');
      assert.equal(await pool.unclaimedReward(bob), '2350');
      assert.equal(await pool.unclaimedReward(carol), '700');
      assert.equal(await pool.totalReward(), '4500');
      assert.equal(await pool.totalUnclaimedReward(), '4250');

      await pool.claim({ from:alice });
      await pool.claim({ from:bob });
      await pool.claim({ from:carol });

      assert.equal(await token.balanceOf(pool.address), '350');   // 4500 - 1450 - 2350 - 700 + 350
      assert.equal(await token.balanceOf(alice), '2330');   // 1000 + 1450 - 120
      assert.equal(await token.balanceOf(bob), '3160');        // 1000 + 2350 - 190
      assert.equal(await token.balanceOf(carol), '1660');        // 1000 + 700 - 40
      assert.equal(await pool.reward(alice), '1450');   // 250 + 1200
      assert.equal(await pool.reward(bob), '2350');     // 450 + 1900
      assert.equal(await pool.reward(carol), '700');    // 300 + 400
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.unclaimedReward(carol), '0');
      assert.equal(await pool.totalReward(), '4500');
      assert.equal(await pool.totalUnclaimedReward(), '0');
    });

    it('safeClaim claims the rewards of only the next milestone for the user', async () => {
      const { token, token2, pool, reward, manager } = this;

      await pool.setMilestoneToken(1, token2.address, { from:minter });
      await pool.setMilestoneToken(3, token2.address, { from:minter });

      await depositTokens(token, [
        { user:alice, amount:10 },
        { user:bob,   amount:20 },
        { user:carol, amount:30 }
      ]); // total points 60

      await manager.setProgress(50);
      await depositTokens(token, [
        { user:alice, amount:10 },  // = 15
        { user:bob,   amount:20}    // = 30
      ]); // total points 75

      await manager.setProgress(90);
      await depositTokens(token, [
        { user:alice, amount:100 },  // = 25
        { user:bob,   amount:150}    // = 45
      ]); // total points 100.

      await depositTokens(token2, [
        { user:alice, amount:500},
        { user:bob,   amount:300},
        { user:carol, amount:200}
      ])  // total 2: 1000

      await reward.transfer(pool.address, '1000', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();

      await pool.safeClaim({ from:alice }); // claim alice's 250; 750 remains
      await fund(carol, token, '10');
      // stakes:
      // alice 120
      // bob   190
      // carol 40
      // total: 350.

      await reward.transfer(pool.address, '1000', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();
      // stakes for that milestone:
      // alice 500
      // bob 300
      // carol 200

      assert.equal(await reward.balanceOf(pool.address), '1750');   // 2000 - 250
      assert.equal(await reward.balanceOf(alice), '250');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '750');   // 250 + 500
      assert.equal(await pool.reward(bob), '750');     // 450 + 300
      assert.equal(await pool.reward(carol), '500');    // 300 + 200
      assert.equal(await pool.unclaimedReward(alice), '500');
      assert.equal(await pool.unclaimedReward(bob), '750');
      assert.equal(await pool.unclaimedReward(carol), '500');
      assert.equal(await pool.totalReward(), '2000');
      assert.equal(await pool.totalUnclaimedReward(), '1750');

      await pool.safeClaim({ from:alice });

      await reward.transfer(pool.address, '3500', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();
      // stakes for that milestone:
      // alice 120
      // bob   190
      // carol 40
      // total: 350.

      assert.equal(await reward.balanceOf(pool.address), '4750');   // 5500 - 750
      assert.equal(await reward.balanceOf(alice), '750');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '1950');   // 750 + 1200
      assert.equal(await pool.reward(bob), '2650');     // 750 + 1900
      assert.equal(await pool.reward(carol), '900');    // 500 + 400
      assert.equal(await pool.unclaimedReward(alice), '1200');
      assert.equal(await pool.unclaimedReward(bob), '2650');
      assert.equal(await pool.unclaimedReward(carol), '900');
      assert.equal(await pool.totalReward(), '5500');
      assert.equal(await pool.totalUnclaimedReward(), '4750');

      await pool.safeClaim({ from:alice });

      await reward.transfer(pool.address, '1000', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();
      // stakes for that milestone:
      // alice 500
      // bob 300
      // carol 200

      assert.equal(await reward.balanceOf(pool.address), '4550');   // 6500 - 1950
      assert.equal(await reward.balanceOf(alice), '1950');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '2450');   // 1950 + 500
      assert.equal(await pool.reward(bob), '2950');     // 2650 + 300
      assert.equal(await pool.reward(carol), '1100');    // 900 + 200
      assert.equal(await pool.unclaimedReward(alice), '500');
      assert.equal(await pool.unclaimedReward(bob), '2950');
      assert.equal(await pool.unclaimedReward(carol), '1100');
      assert.equal(await pool.totalReward(), '6500');
      assert.equal(await pool.totalUnclaimedReward(), '4550');

      await pool.safeClaim({ from:alice });
      assert.equal(await reward.balanceOf(pool.address), '4050');   // 4450 - 500
      assert.equal(await reward.balanceOf(alice), '2450');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '2450');   // 1950 + 500
      assert.equal(await pool.reward(bob), '2950');     // 2650 + 300
      assert.equal(await pool.reward(carol), '1100');    // 900 + 200
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '2950');
      assert.equal(await pool.unclaimedReward(carol), '1100');
      assert.equal(await pool.totalReward(), '6500');
      assert.equal(await pool.totalUnclaimedReward(), '4050');

      await pool.safeClaim({ from:bob });   // claim 450
      assert.equal(await reward.balanceOf(pool.address), '3600');   // 4050 - 450
      assert.equal(await reward.balanceOf(alice), '2450');
      assert.equal(await reward.balanceOf(bob), '450');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '2450');   // 1950 + 500
      assert.equal(await pool.reward(bob), '2950');     // 2650 + 300
      assert.equal(await pool.reward(carol), '1100');    // 900 + 200
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '2500');
      assert.equal(await pool.unclaimedReward(carol), '1100');
      assert.equal(await pool.totalReward(), '6500');
      assert.equal(await pool.totalUnclaimedReward(), '3600');

      await pool.safeClaim({ from:bob });   // claim 300
      assert.equal(await reward.balanceOf(pool.address), '3300');   // 3600 - 300
      assert.equal(await reward.balanceOf(alice), '2450');
      assert.equal(await reward.balanceOf(bob), '750');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '2450');   // 1950 + 500
      assert.equal(await pool.reward(bob), '2950');     // 2650 + 300
      assert.equal(await pool.reward(carol), '1100');    // 900 + 200
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '2200');
      assert.equal(await pool.unclaimedReward(carol), '1100');
      assert.equal(await pool.totalReward(), '6500');
      assert.equal(await pool.totalUnclaimedReward(), '3300');

      await pool.safeClaim({ from:bob });   // claim 1900
      assert.equal(await reward.balanceOf(pool.address), '1400');   // 3300 - 1900
      assert.equal(await reward.balanceOf(alice), '2450');
      assert.equal(await reward.balanceOf(bob), '2650');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '2450');   // 1950 + 500
      assert.equal(await pool.reward(bob), '2950');     // 2650 + 300
      assert.equal(await pool.reward(carol), '1100');    // 900 + 200
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '300');
      assert.equal(await pool.unclaimedReward(carol), '1100');
      assert.equal(await pool.totalReward(), '6500');
      assert.equal(await pool.totalUnclaimedReward(), '1400');

      await pool.safeClaim({ from:bob });   // claim 300
      assert.equal(await reward.balanceOf(pool.address), '1100');   // 1400 - 300
      assert.equal(await reward.balanceOf(alice), '2450');
      assert.equal(await reward.balanceOf(bob), '2950');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '2450');   // 1950 + 500
      assert.equal(await pool.reward(bob), '2950');     // 2650 + 300
      assert.equal(await pool.reward(carol), '1100');    // 900 + 200
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.unclaimedReward(carol), '1100');
      assert.equal(await pool.totalReward(), '6500');
      assert.equal(await pool.totalUnclaimedReward(), '1100');

      await pool.safeClaim({ from:carol });   // claim 500: 300 + 200. Claims 2 because depositing in milestone 1 advanced reward calculation.
      assert.equal(await reward.balanceOf(pool.address), '600');   // 1100 - 500
      assert.equal(await reward.balanceOf(alice), '2450');
      assert.equal(await reward.balanceOf(bob), '2950');
      assert.equal(await reward.balanceOf(carol), '500');
      assert.equal(await pool.reward(alice), '2450');   // 1950 + 500
      assert.equal(await pool.reward(bob), '2950');     // 2650 + 300
      assert.equal(await pool.reward(carol), '1100');    // 900 + 200
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.unclaimedReward(carol), '600');
      assert.equal(await pool.totalReward(), '6500');
      assert.equal(await pool.totalUnclaimedReward(), '600');

      await pool.safeClaim({ from:carol });   // claim 400
      assert.equal(await reward.balanceOf(pool.address), '200');   // 600 - 400
      assert.equal(await reward.balanceOf(alice), '2450');
      assert.equal(await reward.balanceOf(bob), '2950');
      assert.equal(await reward.balanceOf(carol), '900');
      assert.equal(await pool.reward(alice), '2450');   // 1950 + 500
      assert.equal(await pool.reward(bob), '2950');     // 2650 + 300
      assert.equal(await pool.reward(carol), '1100');    // 900 + 200
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.unclaimedReward(carol), '200');
      assert.equal(await pool.totalReward(), '6500');
      assert.equal(await pool.totalUnclaimedReward(), '200');

      await pool.safeClaim({ from:carol });   // claim 200
      assert.equal(await reward.balanceOf(pool.address), '0');   // 600 - 400
      assert.equal(await reward.balanceOf(alice), '2450');
      assert.equal(await reward.balanceOf(bob), '2950');
      assert.equal(await reward.balanceOf(carol), '1100');
      assert.equal(await pool.reward(alice), '2450');   // 1950 + 500
      assert.equal(await pool.reward(bob), '2950');     // 2650 + 300
      assert.equal(await pool.reward(carol), '1100');    // 900 + 200
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.unclaimedReward(carol), '0');
      assert.equal(await pool.totalReward(), '6500');
      assert.equal(await pool.totalUnclaimedReward(), '0');
    });

    it('depositing between milestones should not prevent claims', async () => {
      const { token, pool, reward, manager } = this;

      await depositTokens(token, [
        { user:alice, amount:10 },
        { user:bob,   amount:50 }
      ]); // total points 60

      await manager.setProgress(50);
      await fund(alice, token, 20); // alice 20 (30), total 70 (80)

      await reward.transfer(pool.address, '700', { from:minter });
      await manager.setProgress(100); // alice: 200, bob 500
      await manager.unlock();

      await manager.setProgress(50);
      await fund(alice, token, 20); // alice 40 (50), total 90 (100)

      await reward.transfer(pool.address, '900', { from:minter });
      await manager.setProgress(100); // alice 400, bob 500
      await manager.unlock();

      await manager.setProgress(50);
      await fund(alice, token, 20); // alice 60 (70), total 110 (120)

      await reward.transfer(pool.address, '1100', { from:minter });
      await manager.setProgress(100); // alice 600, bob 500
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '2700');   // 2700
      assert.equal(await reward.balanceOf(alice), '0');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await pool.reward(alice), '1200');
      assert.equal(await pool.reward(bob), '1500');
      assert.equal(await pool.unclaimedReward(alice), '1200');
      assert.equal(await pool.unclaimedReward(bob), '1500');
      assert.equal(await pool.totalReward(), '2700');
      assert.equal(await pool.totalUnclaimedReward(), '2700');

      await pool.claim({ from:alice });
      assert.equal(await reward.balanceOf(pool.address), '1500');
      assert.equal(await reward.balanceOf(alice), '1200');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await pool.reward(alice), '1200');
      assert.equal(await pool.reward(bob), '1500');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '1500');
      assert.equal(await pool.totalReward(), '2700');
      assert.equal(await pool.totalUnclaimedReward(), '1500');

      await pool.claim({ from:bob });
      assert.equal(await reward.balanceOf(pool.address), '0');
      assert.equal(await reward.balanceOf(alice), '1200');
      assert.equal(await reward.balanceOf(bob), '1500');
      assert.equal(await pool.reward(alice), '1200');
      assert.equal(await pool.reward(bob), '1500');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.totalReward(), '2700');
      assert.equal(await pool.totalUnclaimedReward(), '0');
    });

    it('depositing between milestones should not prevent safeClaims', async () => {
      const { token, pool, reward, manager } = this;

      await depositTokens(token, [
        { user:alice, amount:10 },
        { user:bob,   amount:50 }
      ]); // total points 60

      await manager.setProgress(50);
      await fund(alice, token, 20); // alice 20 (30), total 70 (80)

      await reward.transfer(pool.address, '700', { from:minter });
      await manager.setProgress(100); // alice: 200, bob 500
      await manager.unlock();

      await manager.setProgress(50);
      await fund(alice, token, '20'); // alice 40 (50), total 90 (100)

      await reward.transfer(pool.address, '900', { from:minter });
      await manager.setProgress(100); // alice 400, bob 500
      await manager.unlock();

      await manager.setProgress(50);
      await fund(alice, token, '20'); // alice 60 (70), total 110 (120)

      await reward.transfer(pool.address, '1100', { from:minter });
      await manager.setProgress(100); // alice 600, bob 500
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '2700');   // 2700
      assert.equal(await reward.balanceOf(alice), '0');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await pool.reward(alice), '1200');
      assert.equal(await pool.reward(bob), '1500');
      assert.equal(await pool.unclaimedReward(alice), '1200');
      assert.equal(await pool.unclaimedReward(bob), '1500');
      assert.equal(await pool.totalReward(), '2700');
      assert.equal(await pool.totalUnclaimedReward(), '2700');

      await pool.safeClaim({ from:alice }); // alice has been advancing; this is a complete claim
      assert.equal(await reward.balanceOf(pool.address), '1500');
      assert.equal(await reward.balanceOf(alice), '1200');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await pool.reward(alice), '1200');
      assert.equal(await pool.reward(bob), '1500');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '1500');
      assert.equal(await pool.totalReward(), '2700');
      assert.equal(await pool.totalUnclaimedReward(), '1500');

      await pool.safeClaim({ from:bob }); // one single claim: 500
      assert.equal(await reward.balanceOf(pool.address), '1000');
      assert.equal(await reward.balanceOf(alice), '1200');
      assert.equal(await reward.balanceOf(bob), '500');
      assert.equal(await pool.reward(alice), '1200');
      assert.equal(await pool.reward(bob), '1500');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '1000');
      assert.equal(await pool.totalReward(), '2700');
      assert.equal(await pool.totalUnclaimedReward(), '1000');

      await pool.safeClaim({ from:bob }); // one single claim: 500
      assert.equal(await reward.balanceOf(pool.address), '500');
      assert.equal(await reward.balanceOf(alice), '1200');
      assert.equal(await reward.balanceOf(bob), '1000');
      assert.equal(await pool.reward(alice), '1200');
      assert.equal(await pool.reward(bob), '1500');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '500');
      assert.equal(await pool.totalReward(), '2700');
      assert.equal(await pool.totalUnclaimedReward(), '500');

      await pool.safeClaim({ from:bob }); // one single claim: 500
      assert.equal(await reward.balanceOf(pool.address), '0');
      assert.equal(await reward.balanceOf(alice), '1200');
      assert.equal(await reward.balanceOf(bob), '1500');
      assert.equal(await pool.reward(alice), '1200');
      assert.equal(await pool.reward(bob), '1500');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.totalReward(), '2700');
      assert.equal(await pool.totalUnclaimedReward(), '0');
    });

    it('zero-stake milestones pass to no effect', async () => {
      const { token, token2, pool, reward, manager } = this;

      // fund
      await reward.transfer(pool.address, '1000', { from:minter });

      // no one stakes; no reward
      await manager.setProgress(100);
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '1000');
      assert.equal(await reward.balanceOf(alice), '0');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await pool.reward(alice), '0');
      assert.equal(await pool.reward(bob), '0');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.totalReward(), '0');
      assert.equal(await pool.totalUnclaimedReward(), '0');

      // alice stakes zero; no reward
      await fund(alice, token, '0');
      await manager.setProgress(100);
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '1000');
      assert.equal(await reward.balanceOf(alice), '0');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await pool.reward(alice), '0');
      assert.equal(await pool.reward(bob), '0');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.totalReward(), '0');
      assert.equal(await pool.totalUnclaimedReward(), '0');

      // alice and bob stake; alice withdraws, bob waits then withdraws
      await fund(alice, token, '100');
      await fund(bob, token, '100');
      await defund(alice, token, '100');
      await manager.setProgress(100);
      await defund(bob, token, '100');
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '1000');
      assert.equal(await reward.balanceOf(alice), '0');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await pool.reward(alice), '0');
      assert.equal(await pool.reward(bob), '0');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.totalReward(), '0');
      assert.equal(await pool.totalUnclaimedReward(), '0');

      // actually stake; make sure nothing breaks
      await fund(alice, token, '75');
      await manager.setProgress(75);
      await fund(bob, token, '100');
      await manager.setProgress(100);
      await manager.unlock();

      assert.equal(await reward.balanceOf(pool.address), '1000');
      assert.equal(await reward.balanceOf(alice), '0');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await pool.reward(alice), '750');
      assert.equal(await pool.reward(bob), '250');
      assert.equal(await pool.unclaimedReward(alice), '750');
      assert.equal(await pool.unclaimedReward(bob), '250');
      assert.equal(await pool.totalReward(), '1000');
      assert.equal(await pool.totalUnclaimedReward(), '1000');

      await pool.claim({ from:alice });
      await pool.claim({ from:bob });
      assert.equal(await reward.balanceOf(pool.address), '0');
      assert.equal(await reward.balanceOf(alice), '750');
      assert.equal(await reward.balanceOf(bob), '250');
      assert.equal(await pool.reward(alice), '750');
      assert.equal(await pool.reward(bob), '250');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.totalReward(), '1000');
      assert.equal(await pool.totalUnclaimedReward(), '0');
    });

    it('tokens deposited after a milestone do not affect previous rewards', async () => {
      const { token, token2, pool, reward, manager } = this;

      await pool.setMilestoneToken(1, token2.address, { from:minter });
      await pool.setMilestoneToken(3, token2.address, { from:minter });

      await depositTokens(token, [
        { user:alice, amount:10 },
        { user:bob,   amount:20 },
        { user:carol, amount:30 }
      ]); // total points 60

      await manager.setProgress(50);
      await depositTokens(token, [
        { user:alice, amount:10 },  // = 15
        { user:bob,   amount:20}    // = 30
      ]); // total points 75

      await manager.setProgress(90);
      await depositTokens(token, [
        { user:alice, amount:100 },  // = 25
        { user:bob,   amount:150}    // = 45
      ]); // total points 100.

      await depositTokens(token2, [
        { user:alice, amount:500},
        { user:bob,   amount:300},
        { user:carol, amount:200}
      ])  // total 2: 1000

      await reward.transfer(pool.address, '1000', { from:minter });
      await manager.setProgress(100);
      await manager.unlock();

      await depositTokens(token, [
        { user:alice, amount:100 },
        { user:bob,   amount:10 }
      ]); // total points 60

      await manager.setProgress(50);
      await depositTokens(token, [
        { user:alice, amount:110 },
        { user:bob,   amount:10}
      ]); // total points 75

      await manager.setProgress(90);
      await depositTokens(token, [
        { user:alice, amount:200 }
      ]); // total points 100.

      // of the 1000 reward, 250 should go to alice, 450 to bob, 300 to carol.
      assert.equal(await reward.balanceOf(pool.address), '1000');
      assert.equal(await reward.balanceOf(alice), '0');
      assert.equal(await reward.balanceOf(bob), '0');
      assert.equal(await reward.balanceOf(carol), '0');
      assert.equal(await pool.reward(alice), '250');
      assert.equal(await pool.reward(bob), '450');
      assert.equal(await pool.reward(carol), '300');
      assert.equal(await pool.unclaimedReward(alice), '250');
      assert.equal(await pool.unclaimedReward(bob), '450');
      assert.equal(await pool.unclaimedReward(carol), '300');
      assert.equal(await pool.totalReward(), '1000');
      assert.equal(await pool.totalUnclaimedReward(), '1000');

      await pool.claim({ from:alice });
      await pool.claim({ from:bob });
      await pool.claim({ from:carol });

      assert.equal(await reward.balanceOf(pool.address), '0');
      assert.equal(await reward.balanceOf(alice), '250');
      assert.equal(await reward.balanceOf(bob), '450');
      assert.equal(await reward.balanceOf(carol), '300');
      assert.equal(await pool.reward(alice), '250');
      assert.equal(await pool.reward(bob), '450');
      assert.equal(await pool.reward(carol), '300');
      assert.equal(await pool.unclaimedReward(alice), '0');
      assert.equal(await pool.unclaimedReward(bob), '0');
      assert.equal(await pool.unclaimedReward(carol), '0');
      assert.equal(await pool.totalReward(), '1000');
      assert.equal(await pool.totalUnclaimedReward(), '0');
    });
  });
});
