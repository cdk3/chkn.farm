const MasterTokenPool = artifacts.require('MasterTokenPool');
const MockSubordinateTokenPool = artifacts.require('MockSubordinateTokenPool');
const MockERC20 = artifacts.require('MockERC20');

const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { bn } = require('../shared/utilities');

const { AddressZero } = require('ethers').constants;

contract('MasterTokenPool', ([alice, bob, minter, dev, owner]) => {
    const MILESTONES = [100, 1100, 11100, 111100];
    const MILESTONE_STEP = 100000;

    beforeEach(async () => {
        this.subordinate1 = await MockSubordinateTokenPool.new();
        this.subordinate2 = await MockSubordinateTokenPool.new();
        this.pools = [this.subordinate1.address, this.subordinate2.address];
        this.token = await MockERC20.new('TOKEN1', 'TOKEN', '100000000', { from: minter });
    });

    it('constructor should fail if pool length does not match share length', async () => {
      await expectRevert(MasterTokenPool.new(this.token.address, MILESTONES, MILESTONE_STEP, this.pools, [1], dev),
        "MasterRewardPool::constructor: _pools and _poolShare must have the same length");
    });

    it('constructor should fail if pool shares sum to zero', async () => {
      await expectRevert(MasterTokenPool.new(this.token.address, MILESTONES, 100000, this.pools, [0, 0], dev),
        "MasterRewardPool::constructor: _poolShare must sum to > 0");
    });

    it('constructor should set public values appropriately', async () => {
      const pool = await MasterTokenPool.new(this.token.address, MILESTONES, 100000, this.pools, [1, 2], dev);

      assert.equal(await pool.pools(0), this.pools[0]);
      assert.equal(await pool.pools(1), this.pools[1]);

      assert.equal(await pool.token(), this.token.address);
      assert.equal(await pool.milestone(), '0');
      for (var i = 0; i < MILESTONES.length; i++) {
        assert.equal(await pool.milestones(i), `${MILESTONES[i]}`);
      }
      assert.equal(await pool.milestoneStep(), '100000');

      assert.equal(await pool.devaddr(), dev);
      assert.equal(await pool.poolShare(0), '1');
      assert.equal(await pool.poolShare(1), '2');
      assert.equal(await pool.totalPoolShare(), '3');
    });

    it('only dev can change devaddr', async () => {
      const pool = await MasterTokenPool.new(this.token.address, MILESTONES, 100000, this.pools, [1, 2], dev);

      await expectRevert(pool.dev(alice),
        "MasterTokenPool::dev caller is not the devaddr");

      await pool.dev(alice, { from:dev });
      assert.equal(await pool.devaddr(), alice);

      await expectRevert(pool.dev(bob, { from:dev }),
        "MasterTokenPool::dev caller is not the devaddr");

      await pool.dev(bob, { from:alice });
      assert.equal(await pool.devaddr(), bob);
    });

    context('migrating to new subordinate pools', () => {
      beforeEach(async () => {
        this.pool = await MasterTokenPool.new(this.token.address, MILESTONES, 100000, this.pools, [1, 2], dev, { from:owner });
        await this.subordinate1.setTokenPool(this.pool.address);
        await this.subordinate2.setTokenPool(this.pool.address);

        this.subordinate3 = await MockSubordinateTokenPool.new();
        this.subordinate4 = await MockSubordinateTokenPool.new();
        this.subordinate5 = await MockSubordinateTokenPool.new();
        this.poolsAlt = [this.subordinate3.address, this.subordinate4.address, this.subordinate5.address];
      });

      it('only owner can setPools', async () => {
        const { pool, poolsAlt } = this;

        await expectRevert(pool.setPools(poolsAlt, [1, 2, 3]),
          "Ownable: caller is not the owner");

        await pool.setPools(poolsAlt, [1, 2, 3], { from:owner });

        assert.equal(await pool.pools(0), poolsAlt[0]);
        assert.equal(await pool.pools(1), poolsAlt[1]);
        assert.equal(await pool.pools(2), poolsAlt[2]);

        assert.equal(await pool.poolShare(0), '1');
        assert.equal(await pool.poolShare(1), '2');
        assert.equal(await pool.poolShare(2), '3');
        assert.equal(await pool.totalPoolShare(), '6');
      });

      it('setPools should revert if pool length does not match share length', async () => {
        const { pool, poolsAlt } = this;

        await expectRevert(pool.setPools(poolsAlt, [1, 2], { from:owner }),
          "MasterRewardPool::setPools: _pools and _poolShare must have the same length");

        await expectRevert(pool.setPools(poolsAlt, [1, 2, 3, 4], { from:owner }),
          "MasterRewardPool::setPools: _pools and _poolShare must have the same length");
      });

      it('setPools should revert if poolShare sums to 0', async () => {
        const { pool, poolsAlt } = this;

        await expectRevert(pool.setPools(poolsAlt, [0, 0, 0], { from:owner }),
          "MasterRewardPool::setPools: _poolShare must sum to > 0");

        await expectRevert(pool.setPools([], [], { from:owner }),
          "MasterRewardPool::setPools: _poolShare must sum to > 0");
      });
    })

    context('with subordinate pools', () => {
      beforeEach(async () => {
        this.pool = await MasterTokenPool.new(this.token.address, MILESTONES, 100000, this.pools, [1, 2], dev);
        await this.subordinate1.setTokenPool(this.pool.address);
        await this.subordinate2.setTokenPool(this.pool.address);
      });

      const getMilestoneRange = (milestone) => {
        if  (milestone < MILESTONES.length) {
          return [
            milestone === 0 ? 0 : MILESTONES[milestone - 1],
            MILESTONES[milestone]
          ]
        } else {
          const base = MILESTONES[MILESTONES.length - 1];
          const steps = milestone - MILESTONES.length;
          return [
            base + MILESTONE_STEP * steps,
            base + MILESTONE_STEP * (steps + 1)
          ]
        }
      }

      const bns = (val) =>  {
        return bn(val.toString()).toString();
      }

      const expectProgress = async(milestone, progress) => {
        const { pool } = this;

        const [start, goal] = getMilestoneRange(milestone);

        assert.equal(bns(await pool.milestone()), `${milestone}`);
        assert.equal(bns(await pool.milestoneStart()), `${start}`);
        assert.equal(bns(await pool.milestoneGoal()), `${goal}`);
        assert.equal(bns(await pool.milestoneProgress()), `${progress}`);
        assert.equal(await pool.canUnlock(), bn(progress).gte(bn(goal)));
      }

      it('progress should increase with token deposits', async () => {
        const { pool, token } = this;

        await expectProgress(0, 0);

        await token.transfer(pool.address, 1, { from:minter });
        await expectProgress(0, 1);

        await token.transfer(pool.address, 13, { from:minter });
        await expectProgress(0, 14);

        await token.transfer(pool.address, 70, { from:minter });
        await expectProgress(0, 84);

        await token.transfer(pool.address, 30, { from:minter });
        await expectProgress(0, 114);
      });

      it('unlocking should not affect progress until a milestone; then, should advance one.', async () => {
        const { pool, token } = this;

        await pool.unlock();
        await expectProgress(0, 0);

        await token.transfer(pool.address, 1, { from:minter });
        await pool.unlock();
        await expectProgress(0, 1);

        await token.transfer(pool.address, 13, { from:minter });
        await pool.unlock();
        await expectProgress(0, 14);

        await token.transfer(pool.address, 70, { from:minter });
        await pool.unlock();
        await expectProgress(0, 84);

        await token.transfer(pool.address, 30, { from:minter });
        await expectProgress(0, 114);
        await pool.unlock();
        await expectProgress(1, 114);

        await token.transfer(pool.address, 100, { from:minter });
        await pool.unlock();
        await expectProgress(1, 214);

        await token.transfer(pool.address, 885, { from:minter });
        await pool.unlock();
        await expectProgress(1, 1099);

        await token.transfer(pool.address, 1, { from:minter });
        await expectProgress(1, 1100);
        await pool.unlock();
        await expectProgress(2, 1100);
      });

      it('milestones should progress according to explicit bounds, then by expected steps', async () => {
        const { pool, token } = this;

        await expectProgress(0, 0);

        await token.transfer(pool.address, 99, { from:minter });
        await expectProgress(0, 99);
        await token.transfer(pool.address, 1, { from:minter });
        await expectProgress(0, 100);
        await pool.unlock();
        await expectProgress(1, 100);

        await token.transfer(pool.address, 999, { from:minter });
        await expectProgress(1, 1099);
        await token.transfer(pool.address, 1, { from:minter });
        await expectProgress(1, 1100);
        await pool.unlock();
        await expectProgress(2, 1100);

        await token.transfer(pool.address, 9999, { from:minter });
        await expectProgress(2, 11099);
        await token.transfer(pool.address, 1, { from:minter });
        await expectProgress(2, 11100);
        await pool.unlock();
        await expectProgress(3, 11100);

        await token.transfer(pool.address, 99999, { from:minter });
        await expectProgress(3, 111099);
        await token.transfer(pool.address, 1, { from:minter });
        await expectProgress(3, 111100);
        await pool.unlock();
        await expectProgress(4, 111100);

        await token.transfer(pool.address, 99999, { from:minter });
        await expectProgress(4, 211099);
        await token.transfer(pool.address, 1, { from:minter });
        await expectProgress(4, 211100);
        await pool.unlock();
        await expectProgress(5, 211100);

        await token.transfer(pool.address, 99999, { from:minter });
        await expectProgress(5, 311099);
        await token.transfer(pool.address, 1, { from:minter });
        await expectProgress(5, 311100);
        await pool.unlock();
        await expectProgress(6, 311100);
      });

      it('unlocking attempts should transfer 1/4 accumulated funds to dev', async () => {
        const { pool, token } = this;

        await pool.unlock();
        await expectProgress(0, 0);

        await token.transfer(pool.address, 8, { from:minter });
        await pool.unlock();
        await expectProgress(0, 8);
        assert.equal(await token.balanceOf(dev), '2');

        await token.transfer(pool.address, 32, { from:minter });
        await pool.unlock();
        await expectProgress(0, 40);
        assert.equal(await token.balanceOf(dev), '10');

        await token.transfer(pool.address, 40, { from:minter });
        await pool.unlock();
        await expectProgress(0, 80);
        assert.equal(await token.balanceOf(dev), '20');

        await token.transfer(pool.address, 40, { from:minter });
        await expectProgress(0, 120);
        await pool.unlock();
        await expectProgress(1, 120);
        assert.equal(await token.balanceOf(dev), '30');

        await token.transfer(pool.address, 976, { from:minter });
        await expectProgress(1, 1096);
        await pool.unlock();
        await expectProgress(1, 1096);
        assert.equal(await token.balanceOf(dev), '274');

        await token.transfer(pool.address, 8, { from:minter });
        await expectProgress(1, 1104);
        await pool.unlock();
        await expectProgress(2, 1104);
        assert.equal(await token.balanceOf(dev), '276');
      });

      it('unlocking should only progress at most 1 milestone, regardless of funds', async () => {
        const { pool, token } = this;

        await pool.unlock();
        await expectProgress(0, 0);

        await token.transfer(pool.address, 111100, { from:minter });
        await expectProgress(0, 111100);
        await pool.unlock();
        await expectProgress(1, 111100);
        assert.equal(await token.balanceOf(dev), '27775');
        await pool.unlock();
        await expectProgress(2, 111100);
        assert.equal(await token.balanceOf(dev), '27775');
        await pool.unlock();
        await expectProgress(3, 111100);
        assert.equal(await token.balanceOf(dev), '27775');
        await pool.unlock();
        await expectProgress(4, 111100);
        assert.equal(await token.balanceOf(dev), '27775');
        await pool.unlock();
        await expectProgress(4, 111100);
        assert.equal(await token.balanceOf(dev), '27775');
      });

      it('unlocking attempts should transfer 1/4 accumulated funds to dev even after last explicit milestone', async () => {
        const { pool, token } = this;

        await pool.unlock();
        await expectProgress(0, 0);

        await token.transfer(pool.address, 111100, { from:minter });
        await pool.unlock();  // 1
        await pool.unlock();  // 2
        await pool.unlock();  // 3
        await pool.unlock();  // 4
        await expectProgress(4, 111100);
        assert.equal(await token.balanceOf(dev), '27775');

        await token.transfer(pool.address, 4, { from:minter });
        await pool.unlock();
        await expectProgress(4, 111104);
        assert.equal(await token.balanceOf(dev), '27776');

        await token.transfer(pool.address, 100000, { from:minter });
        await pool.unlock();
        await expectProgress(5, 211104);
        assert.equal(await token.balanceOf(dev), '52776');
      });

      it('unlocking attempts should transfer 1/4 accumulated funds to dev after devaddr changes', async () => {
        const { pool, token } = this;

        await pool.unlock();
        await expectProgress(0, 0);

        await token.transfer(pool.address, 8, { from:minter });
        await pool.unlock();
        await expectProgress(0, 8);
        assert.equal(await token.balanceOf(dev), '2');

        await token.transfer(pool.address, 32, { from:minter });
        await pool.unlock();
        await expectProgress(0, 40);
        assert.equal(await token.balanceOf(dev), '10');

        await pool.dev(bob, { from:dev });

        await token.transfer(pool.address, 40, { from:minter });
        await pool.unlock();
        await expectProgress(0, 80);
        assert.equal(await token.balanceOf(dev), '10');
        assert.equal(await token.balanceOf(bob), '10');

        await token.transfer(pool.address, 40, { from:minter });
        await expectProgress(0, 120);
        await pool.unlock();
        await expectProgress(1, 120);
        assert.equal(await token.balanceOf(dev), '10');
        assert.equal(await token.balanceOf(bob), '20');
      });

      const expectFunds = async (milestone, progress, explicit = {}) => {
        let { dev:devFunds, pool:poolFunds } = explicit;
        const { token, subordinate1, subordinate2 } = this;

        const [start, goal] = getMilestoneRange(milestone);
        const poolshare1 = Math.floor(start / 4);
        const poolshare2 = Math.floor(start / 2);

        if (devFunds === void 0) {
          devFunds = Math.floor(progress / 4);
        }
        if (poolFunds === void 0) {
          poolFunds = progress - (devFunds + poolshare1 + poolshare2)
        }

        assert.equal(bns(await token.balanceOf(dev)), `${devFunds}`);
        assert.equal(bns(await token.balanceOf(subordinate1.address)), `${poolshare1}`);
        assert.equal(bns(await token.balanceOf(subordinate2.address)), `${poolshare2}`);
        assert.equal(bns(await token.balanceOf(this.pool.address)), `${poolFunds}`);
      }

      it('unlocking should distribute reward funds for the milestone (and no more) to subordinate pools', async () => {
        const { pool, token } = this;

        await pool.unlock();
        await expectProgress(0, 0);
        await expectFunds(0, 0);

        await token.transfer(pool.address, 8, { from:minter });
        await expectFunds(0, 8, { dev:0, pool:8 });
        await pool.unlock();
        await expectProgress(0, 8);
        await expectFunds(0, 8, { dev:2, pool:6 });

        await token.transfer(pool.address, 32, { from:minter });
        await expectFunds(0, 8, { dev:2, pool:38 });
        await pool.unlock();
        await expectProgress(0, 40);
        await expectFunds(0, 40, { dev:10, pool:30 });

        await token.transfer(pool.address, 80, { from:minter });
        await expectFunds(0, 8, { dev:10, pool:110 });
        await pool.unlock();
        await expectProgress(1, 120);
        await expectFunds(1, 120, { dev:30, pool:15 });

        await token.transfer(pool.address, 976, { from:minter });
        await expectFunds(1, 1096, { dev:30, pool:991 });
        await pool.unlock();
        await expectProgress(1, 1096);
        await expectFunds(1, 1096, { dev:274, pool:747 });

        await token.transfer(pool.address, 8, { from:minter });
        await expectFunds(1, 1104, { dev:274, pool:755 });
        await expectProgress(1, 1104);
        await pool.unlock();
        await expectProgress(2, 1104);
        await expectFunds(2, 1104, { dev:276, pool:3 });
      });

      it('unlocking should only distribute funds for at most 1 milestone, regardless of total', async () => {
        const { pool, token } = this;

        await pool.unlock();
        await expectProgress(0, 0);

        await token.transfer(pool.address, 111100, { from:minter });
        await expectProgress(0, 111100);
        await expectFunds(0, 111100, { dev:0 });
        await pool.unlock();
        await expectProgress(1, 111100);
        await expectFunds(1, 111100);
        await pool.unlock();
        await expectProgress(2, 111100);
        await expectFunds(2, 111100);
        await pool.unlock();
        await expectProgress(3, 111100);
        await expectFunds(3, 111100);
        await pool.unlock();
        await expectProgress(4, 111100);
        await expectFunds(4, 111100);
        await pool.unlock();
        await expectProgress(4, 111100);
      });

      it('unlocking attempts should transfer 1/4 accumulated funds to dev even after last explicit milestone', async () => {
        const { pool, token } = this;

        await pool.unlock();
        await expectProgress(0, 0);

        await token.transfer(pool.address, 111100, { from:minter });
        await expectFunds(0, 111100, { dev:0, pool:111100 });
        await pool.unlock();
        await pool.unlock();
        await pool.unlock();
        await pool.unlock();
        await expectProgress(4, 111100);
        await expectFunds(4, 111100);

        await token.transfer(pool.address, 4, { from:minter });
        await pool.unlock();
        await expectProgress(4, 111104);
        await expectFunds(4, 111104);

        await token.transfer(pool.address, 100000, { from:minter });
        await pool.unlock();
        await expectProgress(5, 211104);
        await expectFunds(5, 211104);
      });

      it('unlocking should emit Milestone events from pool and subordinates', async () => {
        const { pool, token } = this;

        let tx;

        out = await pool.unlock();
        tx = out.tx;
        await expectEvent.notEmitted.inTransaction(tx, pool, 'Milestone');
        await expectEvent.notEmitted.inTransaction(tx, this.subordinate1, 'Milestone');
        await expectEvent.notEmitted.inTransaction(tx, this.subordinate2, 'Milestone');
        // no events


        await token.transfer(pool.address, 8, { from:minter });
        out = await pool.unlock();
        tx = out.tx;
        await expectEvent.notEmitted.inTransaction(tx, pool, 'Milestone');
        await expectEvent.notEmitted.inTransaction(tx, this.subordinate1, 'Milestone');
        await expectEvent.notEmitted.inTransaction(tx, this.subordinate2, 'Milestone');

        await token.transfer(pool.address, 32, { from:minter });
        out = await pool.unlock();
        tx = out.tx;
        await expectEvent.notEmitted.inTransaction(tx, pool, 'Milestone');
        await expectEvent.notEmitted.inTransaction(tx, this.subordinate1, 'Milestone');
        await expectEvent.notEmitted.inTransaction(tx, this.subordinate2, 'Milestone');

        await token.transfer(pool.address, 80, { from:minter });
        await expectFunds(0, 8, { dev:10, pool:110 });
        out = await pool.unlock();
        tx = out.tx;
        await expectEvent.inTransaction(tx, pool, 'Milestone', { milestone:'0', start:'0', goal:'100', amount:'120' });
        await expectEvent.inTransaction(tx, this.subordinate1, 'Milestone', { milestone:'0', start:'0', goal:'100', amount:'120' });
        await expectEvent.inTransaction(tx, this.subordinate2, 'Milestone', { milestone:'0', start:'0', goal:'100', amount:'120' });

        await token.transfer(pool.address, 976, { from:minter });
        out = await pool.unlock();
        tx = out.tx;
        await expectEvent.notEmitted.inTransaction(tx, pool, 'Milestone');
        await expectEvent.notEmitted.inTransaction(tx, this.subordinate1, 'Milestone');
        await expectEvent.notEmitted.inTransaction(tx, this.subordinate2, 'Milestone');

        await token.transfer(pool.address, 8, { from:minter });
        out = await pool.unlock();
        tx = out.tx;
        await expectEvent.inTransaction(tx, pool, 'Milestone', { milestone:'1', start:'100', goal:'1100', amount:'1104' });
        await expectEvent.inTransaction(tx, this.subordinate1, 'Milestone', { milestone:'1', start:'100', goal:'1100', amount:'1104' });
        await expectEvent.inTransaction(tx, this.subordinate2, 'Milestone', { milestone:'1', start:'100', goal:'1100', amount:'1104' });
      })

      it('unlocking should properly stage subordinate updates ', async () => {
        const { pool, token } = this;

        let tx;

        out = await pool.unlock();
        tx = out.tx;
        await expectEvent.notEmitted.inTransaction(tx, this.subordinate1, 'AsSubordinate');
        await expectEvent.notEmitted.inTransaction(tx, this.subordinate2, 'AsSubordinate');
        // no events


        await token.transfer(pool.address, 8, { from:minter });
        out = await pool.unlock();
        tx = out.tx;
        await expectEvent.notEmitted.inTransaction(tx, this.subordinate1, 'AsSubordinate');
        await expectEvent.notEmitted.inTransaction(tx, this.subordinate2, 'AsSubordinate');

        await token.transfer(pool.address, 32, { from:minter });
        out = await pool.unlock();
        tx = out.tx;
        await expectEvent.notEmitted.inTransaction(tx, this.subordinate1, 'AsSubordinate');
        await expectEvent.notEmitted.inTransaction(tx, this.subordinate2, 'AsSubordinate');

        await token.transfer(pool.address, 80, { from:minter });
        await expectFunds(0, 8, { dev:10, pool:110 });
        out = await pool.unlock();
        tx = out.tx;
        await expectEvent.inTransaction(tx, this.subordinate1, 'AsSubordinate', { name:'BeforeUnlock', count:'0', milestone:'0', balance:'0', managerBalance:'90' });
        await expectEvent.inTransaction(tx, this.subordinate1, 'AsSubordinate', { name:'Unlock', count:'1', milestone:'1', balance:'25', managerBalance:'15' });
        await expectEvent.inTransaction(tx, this.subordinate1, 'AsSubordinate', { name:'AfterUnlock', count:'2', milestone:'1', balance:'25', managerBalance:'15' });
        await expectEvent.inTransaction(tx, this.subordinate2, 'AsSubordinate', { name:'BeforeUnlock', count:'0', milestone:'0', balance:'0', managerBalance:'90' });
        await expectEvent.inTransaction(tx, this.subordinate2, 'AsSubordinate', { name:'Unlock', count:'1', milestone:'1', balance:'50', managerBalance:'15' });
        await expectEvent.inTransaction(tx, this.subordinate2, 'AsSubordinate', { name:'AfterUnlock', count:'2', milestone:'1', balance:'50', managerBalance:'15' });

        await token.transfer(pool.address, 976, { from:minter });
        out = await pool.unlock();
        tx = out.tx;
        await expectEvent.notEmitted.inTransaction(tx, this.subordinate1, 'AsSubordinate');
        await expectEvent.notEmitted.inTransaction(tx, this.subordinate2, 'AsSubordinate');

        await token.transfer(pool.address, 8, { from:minter });
        out = await pool.unlock();
        tx = out.tx;
        await expectEvent.inTransaction(tx, this.subordinate1, 'AsSubordinate', { name:'BeforeUnlock', count:'3', milestone:'1', balance:'25', managerBalance:'753' });
        await expectEvent.inTransaction(tx, this.subordinate1, 'AsSubordinate', { name:'Unlock', count:'4', milestone:'2', balance:'275', managerBalance:'3' });
        await expectEvent.inTransaction(tx, this.subordinate1, 'AsSubordinate', { name:'AfterUnlock', count:'5', milestone:'2', balance:'275', managerBalance:'3' });
        await expectEvent.inTransaction(tx, this.subordinate2, 'AsSubordinate', { name:'BeforeUnlock', count:'3', milestone:'1', balance:'50', managerBalance:'753' });
        await expectEvent.inTransaction(tx, this.subordinate2, 'AsSubordinate', { name:'Unlock', count:'4', milestone:'2', balance:'550', managerBalance:'3' });
        await expectEvent.inTransaction(tx, this.subordinate2, 'AsSubordinate', { name:'AfterUnlock', count:'5', milestone:'2', balance:'550', managerBalance:'3' });
      });
    })
});
