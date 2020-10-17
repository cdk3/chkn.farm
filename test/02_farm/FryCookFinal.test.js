const { expectRevert, time } = require('@openzeppelin/test-helpers');
const ChickenTokenFinal = artifacts.require('ChickenTokenFinal');
const FryCookFinal = artifacts.require('FryCookFinal');
const MockERC20 = artifacts.require('MockERC20');

const { bn } = require('../shared/utilities');

contract('FryCookFinal', ([alice, bob, carol, dev, minter, executive, head, sous, waiter]) => {
    const MINTER_ROLE = web3.utils.soliditySha3('MINTER_ROLE');
    const EXECUTIVE_ROLE = web3.utils.soliditySha3('EXECUTIVE_ROLE');
    const HEAD_CHEF_ROLE = web3.utils.soliditySha3('HEAD_CHEF_ROLE');
    const SOUS_CHEF_ROLE = web3.utils.soliditySha3('SOUS_CHEF_ROLE');
    const WAITSTAFF_ROLE = web3.utils.soliditySha3('WAITSTAFF_ROLE');

    const ROLES = [EXECUTIVE_ROLE, HEAD_CHEF_ROLE, SOUS_CHEF_ROLE, WAITSTAFF_ROLE];
    const ROLE_ADDRESS = {};
    const ADDRESS_ROLE = {};
    ROLE_ADDRESS[EXECUTIVE_ROLE] = executive;
    ROLE_ADDRESS[HEAD_CHEF_ROLE] = head;
    ROLE_ADDRESS[SOUS_CHEF_ROLE] = sous;
    ROLE_ADDRESS[WAITSTAFF_ROLE] = waiter;
    for (const role in ROLE_ADDRESS) {
      ADDRESS_ROLE[ROLE_ADDRESS[role]] = role;
    }

    beforeEach(async () => {
        this.chicken = await ChickenTokenFinal.new({ from: alice });
    });

    it('should set correct state variables', async () => {
        this.cook = await FryCookFinal.new(this.chicken.address, dev, '1000', '0', '1000', '1000', { from: alice });
        await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
        const chicken = await this.cook.chicken();
        const devaddr = await this.cook.devaddr();
        assert.equal(chicken.valueOf(), this.chicken.address);
        assert.equal(devaddr.valueOf(), dev);
        assert.equal((await this.chicken.hasRole(MINTER_ROLE, this.cook.address)).toString(), 'true');
        assert.equal((await this.cook.hasRole(EXECUTIVE_ROLE, alice)).toString(), 'true');
        assert.equal((await this.cook.hasRole(HEAD_CHEF_ROLE, alice)).toString(), 'true');
    });

    it('should allow dev and only dev to update dev', async () => {
        this.cook = await FryCookFinal.new(this.chicken.address, dev, '1000', '0', '1000', '1000', { from: alice });
        assert.equal((await this.cook.devaddr()).valueOf(), dev);
        await expectRevert(this.cook.dev(bob, { from: bob }), 'FryCookFinal::dev: wut?');
        await this.cook.dev(bob, { from: dev });
        assert.equal((await this.cook.devaddr()).valueOf(), bob);
        await this.cook.dev(alice, { from: bob });
        assert.equal((await this.cook.devaddr()).valueOf(), alice);
    })

    it('should set correct bonus stage transitions', async () => {
      this.cook = await FryCookFinal.new(this.chicken.address, dev, '1000', '500', '2500', '4500', { from: alice });
      assert.equal((await this.cook.startBlock()).valueOf(), '500');
      assert.equal((await this.cook.bonusStage2Block()).valueOf(), '1000');
      assert.equal((await this.cook.bonusStage3Block()).valueOf(), '1500');
      assert.equal((await this.cook.bonusStage4Block()).valueOf(), '2000');
      assert.equal((await this.cook.bonusEndBlock()).valueOf(), '2500');
      assert.equal((await this.cook.devBonusStage2Block()).valueOf(), '1500');
      assert.equal((await this.cook.devBonusStage3Block()).valueOf(), '2500');
      assert.equal((await this.cook.devBonusStage4Block()).valueOf(), '3500');
      assert.equal((await this.cook.devBonusEndBlock()).valueOf(), '4500');
    });

    context('With ERC/LP token added to the field', () => {
        beforeEach(async () => {
            this.lp = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
            await this.lp.transfer(alice, '1000', { from: minter });
            await this.lp.transfer(bob, '1000', { from: minter });
            await this.lp.transfer(carol, '1000', { from: minter });
            this.lp2 = await MockERC20.new('LPToken2', 'LP2', '10000000000', { from: minter });
            await this.lp2.transfer(alice, '1000', { from: minter });
            await this.lp2.transfer(bob, '1000', { from: minter });
            await this.lp2.transfer(carol, '1000', { from: minter });
        });

        it('should allow emergency withdraw', async () => {
            // 100 per block farming rate starting at block 100 with bonus until block 1000
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '100', '100', '1000', '1000', { from: alice });
            await this.cook.add('100', this.lp.address, '0', '1', '100000', '1', true);
            await this.lp.approve(this.cook.address, '1000', { from: bob });
            await this.cook.deposit(0, '100', { from: bob });
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '900');
            await this.cook.emergencyWithdraw(0, { from: bob });
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1000');
        });

        it('should give out CHKNs only after farming time', async () => {
            // 100 per block farming rate starting at block 100000 with bonus until block 1000
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '100', '100', '1000', '1000', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            await this.cook.add('100', this.lp.address, '0', '1', '100000', '1', true);
            await this.lp.approve(this.cook.address, '1000', { from: bob });
            await this.cook.deposit(0, '100', { from: bob });
            await time.advanceBlockTo('89');
            await this.cook.deposit(0, '0', { from: bob }); // block 90
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '0');
            await time.advanceBlockTo('94');
            await this.cook.deposit(0, '0', { from: bob }); // block 95
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '0');
            await time.advanceBlockTo('99');
            await this.cook.deposit(0, '0', { from: bob }); // block 100
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '0');
            await time.advanceBlockTo('100');
            await this.cook.deposit(0, '0', { from: bob }); // block 101
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '2000');  // 20x mult
            await time.advanceBlockTo('104');
            await this.cook.deposit(0, '0', { from: bob }); // block 105
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '10000');
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '1000');
            assert.equal((await this.chicken.totalSupply()).valueOf(), '11000');
        });

        it('should not distribute CHKNs if no one deposit', async () => {
            // 100 per block farming rate starting at block 200 with bonus until block 1000
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '100', '200', '10000', '10000', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            await this.cook.add('100', this.lp.address, '0', '1', '100000', '1', true);
            await this.lp.approve(this.cook.address, '1000', { from: bob });
            await time.advanceBlockTo('199');
            assert.equal((await this.chicken.totalSupply()).valueOf(), '0');
            await time.advanceBlockTo('204');
            assert.equal((await this.chicken.totalSupply()).valueOf(), '0');
            await time.advanceBlockTo('209');
            await this.cook.deposit(0, '10', { from: bob }); // block 210
            assert.equal((await this.chicken.totalSupply()).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '0');
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '990');
            await time.advanceBlockTo('219');
            await this.cook.withdraw(0, '10', { from: bob }); // block 220
            assert.equal((await this.chicken.totalSupply()).valueOf(), '22000');
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '20000');
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '2000');
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1000');
        });

        it('should distribute CHKNs properly for each staker', async () => {
            // 100 per block farming rate starting at block 300 with bonus until block 1000
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '50', '300', '10000', '10000', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            await this.cook.add('100', this.lp.address, '0', '1', '100000', '1', true);
            await this.lp.approve(this.cook.address, '1000', { from: alice });
            await this.lp.approve(this.cook.address, '1000', { from: bob });
            await this.lp.approve(this.cook.address, '1000', { from: carol });
            // Alice deposits 10 LPs at block 310
            await time.advanceBlockTo('309');
            await this.cook.deposit(0, '10', { from: alice });
            // Bob deposits 20 LPs at block 314
            await time.advanceBlockTo('313');
            await this.cook.deposit(0, '20', { from: bob });
            // Carol deposits 30 LPs at block 318
            await time.advanceBlockTo('317');
            await this.cook.deposit(0, '30', { from: carol });
            // Alice deposits 10 more LPs at block 320. At this point:
            //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
            //   FryCookFinal should have the remaining: 10000 - 5666 = 4334
            await time.advanceBlockTo('319')
            await this.cook.deposit(0, '10', { from: alice });
            assert.equal((await this.chicken.totalSupply()).valueOf(), '11000');
            assert.equal((await this.chicken.balanceOf(alice)).valueOf(), '5666');
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(carol)).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(this.cook.address)).valueOf(), '4334');
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '1000');
            // Bob withdraws 5 LPs at block 330. At this point:
            //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
            await time.advanceBlockTo('329')
            await this.cook.withdraw(0, '5', { from: bob });
            assert.equal((await this.chicken.totalSupply()).valueOf(), '22000');
            assert.equal((await this.chicken.balanceOf(alice)).valueOf(), '5666');
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '6190');
            assert.equal((await this.chicken.balanceOf(carol)).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(this.cook.address)).valueOf(), '8144');
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '2000');
            // Alice withdraws 20 LPs at block 340.
            // Bob withdraws 15 LPs at block 350.
            // Carol withdraws 30 LPs at block 360.
            await time.advanceBlockTo('339')
            await this.cook.withdraw(0, '20', { from: alice });
            await time.advanceBlockTo('349')
            await this.cook.withdraw(0, '15', { from: bob });
            await time.advanceBlockTo('359')
            await this.cook.withdraw(0, '30', { from: carol });
            assert.equal((await this.chicken.totalSupply()).valueOf(), '55000');
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '5000');
            // Alice should have: 5666 + 10*2/7*1000 + 10*2/6.5*1000 = 11600
            assert.equal((await this.chicken.balanceOf(alice)).valueOf(), '11600');
            // Bob should have: 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '11831');
            // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
            assert.equal((await this.chicken.balanceOf(carol)).valueOf(), '26568');
            // All of them should have 1000 LPs back.
            assert.equal((await this.lp.balanceOf(alice)).valueOf(), '1000');
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1000');
            assert.equal((await this.lp.balanceOf(carol)).valueOf(), '1000');
        });

        it('should reject attempts to add an LP token pool twice', async () => {
            // 100 per block farming rate starting at block 100 with bonus until block 1000
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '100', '100', '1000', '1000', { from: alice });
            await this.cook.add('100', this.lp.address, '0', '1', '100000', '1', true);
            await expectRevert(this.cook.add('100', this.lp.address, '0', '1', '100000', '1', true), 'FryCookFinal::add: lpToken already added');
            await this.cook.add('100', this.lp2.address, '0', '1', '100000', '1', true);
            await expectRevert(this.cook.add('100', this.lp2.address, '100', '10', '1000', '4', false), 'FryCookFinal::add: lpToken already added');
        });

        it('should give proper CHKNs allocation to each pool', async () => {
            // 100 per block farming rate starting at block 400 with bonus until block 1000
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '50', '400', '10000', '10000', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            await this.lp.approve(this.cook.address, '1000', { from: alice });
            await this.lp2.approve(this.cook.address, '1000', { from: bob });
            // Add first LP to the pool with allocation 1
            await this.cook.add('10', this.lp.address, '0', '1', '100000', '1', true);
            // Alice deposits 10 LPs at block 410
            await time.advanceBlockTo('409');
            await this.cook.deposit(0, '10', { from: alice });
            // Add LP2 to the pool with allocation 2 at block 420
            await time.advanceBlockTo('419');
            await this.cook.add('20', this.lp2.address, '0', '1', '100000', '1', true);
            // Alice should have 10*1000 pending reward
            assert.equal((await this.cook.pendingChicken(0, alice)).valueOf(), '10000');
            // Bob deposits 10 LP2s at block 425
            await time.advanceBlockTo('424');
            await this.cook.deposit(1, '5', { from: bob });
            // Alice should have 10000 + 5*1/3*1000 = 11666 pending reward
            assert.equal((await this.cook.pendingChicken(0, alice)).valueOf(), '11666');
            await time.advanceBlockTo('430');
            // At block 430. Bob should get 5*2/3*1000 = 3333. Alice should get ~1666 more.
            assert.equal((await this.cook.pendingChicken(0, alice)).valueOf(), '13333');
            assert.equal((await this.cook.pendingChicken(1, bob)).valueOf(), '3333');
        });

        it('should give 15x bonus CHKNs after the first bonus stage ends', async () => {
            // 100 per block farming rate starting at block 500 with bonus until block 900.
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '100', '500', '900', '10000', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            await this.lp.approve(this.cook.address, '1000', { from: alice });
            await this.cook.add('1', this.lp.address, '0', '1', '100000', '1', true);
            // Alice deposits 10 LPs at block 590
            await time.advanceBlockTo('589');
            await this.cook.deposit(0, '10', { from: alice });
            // At block 605, she should have 2000*10 + 1500*5 = 27500 pending.
            await time.advanceBlockTo('605');
            assert.equal((await this.cook.pendingChicken(0, alice)).valueOf(), '27500');
            // At block 606, Alice withdraws all pending rewards and should get 29000.
            await this.cook.deposit(0, '0', { from: alice });
            assert.equal((await this.cook.pendingChicken(0, alice)).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(alice)).valueOf(), '29000');
        });

        it('should give 10x bonus CHKNs after the second bonus stage ends', async () => {
            // 100 per block farming rate starting at block 500 with bonus until block 900.
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '100', '500', '900', '10000', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            await this.lp.approve(this.cook.address, '1000', { from: alice });
            await this.cook.add('1', this.lp.address, '0', '1', '100000', '1', true);
            // Alice deposits 10 LPs at block 690
            await time.advanceBlockTo('689');
            await this.cook.deposit(0, '10', { from: alice });
            // At block 705, she should have 1500*10 + 1000*5 = 20000 pending.
            await time.advanceBlockTo('705');
            assert.equal((await this.cook.pendingChicken(0, alice)).valueOf(), '20000');
            // At block 706, Alice withdraws all pending rewards and should get 21000.
            await this.cook.deposit(0, '0', { from: alice });
            assert.equal((await this.cook.pendingChicken(0, alice)).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(alice)).valueOf(), '21000');
        });

        it('should give 5x bonus CHKNs after the third bonus stage ends', async () => {
            // 100 per block farming rate starting at block 500 with bonus until block 900.
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '100', '500', '900', '10000', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            await this.lp.approve(this.cook.address, '1000', { from: alice });
            await this.cook.add('1', this.lp.address, '0', '1', '100000', '1', true);
            // Alice deposits 10 LPs at block 790
            await time.advanceBlockTo('789');
            await this.cook.deposit(0, '10', { from: alice });
            // At block 805, she should have 1000*10 + 500*5 = 12500 pending.
            await time.advanceBlockTo('805');
            assert.equal((await this.cook.pendingChicken(0, alice)).valueOf(), '12500');
            // At block 806, Alice withdraws all pending rewards and should get 13000.
            await this.cook.deposit(0, '0', { from: alice });
            assert.equal((await this.cook.pendingChicken(0, alice)).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(alice)).valueOf(), '13000');
        });

        it('should stop giving bonus CHKNs after the bonus period ends', async () => {
            // 100 per block farming rate starting at block 500 with bonus until block 900.
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '100', '500', '900', '10000', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            await this.lp.approve(this.cook.address, '1000', { from: alice });
            await this.cook.add('1', this.lp.address, '0', '1', '100000', '1', true);
            // Alice deposits 10 LPs at block 890
            await time.advanceBlockTo('889');
            await this.cook.deposit(0, '10', { from: alice });
            // At block 805, she should have 500*10 + 100*5 = 5500 pending.
            await time.advanceBlockTo('905');
            assert.equal((await this.cook.pendingChicken(0, alice)).valueOf(), '5500');
            // At block 906, Alice withdraws all pending rewards and should get 5600.
            await this.cook.deposit(0, '0', { from: alice });
            assert.equal((await this.cook.pendingChicken(0, alice)).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(alice)).valueOf(), '5600');
        });

        it('should give 8.33% dev share after first dev bonus stage ends', async () => {
            // 100 per block farming rate. Dev share decreases every 100 blocks.
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '100', '1000', '1000', '1400', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            await this.lp.approve(this.cook.address, '1000', { from: alice });
            await this.cook.add('1', this.lp.address, '0', '1', '100000', '1', true);
            // Alice deposits 10 LPs at block 1089
            await time.advanceBlockTo('1088');
            await this.cook.deposit(0, '10', { from: alice });
            // At block 1099, dev has earned 10% of 100*10 = 100.
            await time.advanceBlockTo('1098');
            await this.cook.deposit(0, '0', { from: alice });
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '100');
            // At block 1104, dev has earned 100 + 8.333% of 100*5 = 141.
            await time.advanceBlockTo('1103');
            await this.cook.deposit(0, '0', { from: alice });
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '141');
        });

        it('should give 6.25% dev share after second dev bonus stage ends', async () => {
            // 100 per block farming rate. Dev share decreases every 100 blocks.
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '100', '1000', '1000', '1400', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            await this.lp.approve(this.cook.address, '1000', { from: alice });
            await this.cook.add('1', this.lp.address, '0', '1', '100000', '1', true);
            // Alice deposits 10 LPs at block 1189
            await time.advanceBlockTo('1188');
            await this.cook.deposit(0, '10', { from: alice });
            // At block 1199, dev has earned 8.33% of 100*10 = 83.
            await time.advanceBlockTo('1198');
            await this.cook.deposit(0, '0', { from: alice });
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '83');
            // At block 1204, dev has earned 83 + 6.25% of 100*5 = 114.
            await time.advanceBlockTo('1203');
            await this.cook.deposit(0, '0', { from: alice });
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '114');
        });

        it('should give 4% dev share after third dev bonus stage ends', async () => {
            // 100 per block farming rate. Dev share decreases every 100 blocks.
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '100', '1000', '1000', '1400', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            await this.lp.approve(this.cook.address, '1000', { from: alice });
            await this.cook.add('1', this.lp.address, '0', '1', '100000', '1', true);
            // Alice deposits 10 LPs at block 1289
            await time.advanceBlockTo('1288');
            await this.cook.deposit(0, '10', { from: alice });
            // At block 1299, dev has earned 6.25% of 100*10 = 62.
            await time.advanceBlockTo('1298');
            await this.cook.deposit(0, '0', { from: alice });
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '62');
            // At block 1304, dev has earned 62 + 4% of 100*5 = 82.
            await time.advanceBlockTo('1303');
            await this.cook.deposit(0, '0', { from: alice });
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '82');
        });

        it('should give 2% dev share after dev bonus period ends', async () => {
            // 100 per block farming rate. Dev share decreases every 100 blocks.
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '100', '1000', '1000', '1400', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            await this.lp.approve(this.cook.address, '1000', { from: alice });
            await this.cook.add('1', this.lp.address, '0', '1', '100000', '1', true);
            // Alice deposits 10 LPs at block 1389
            await time.advanceBlockTo('1388');
            await this.cook.deposit(0, '10', { from: alice });
            // At block 1399, dev has earned 4% of 100*10 = 40.
            await time.advanceBlockTo('1398');
            await this.cook.deposit(0, '0', { from: alice });
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '40');
            // At block 1404, dev has earned 40 + 2% of 100*5 = 50.
            await time.advanceBlockTo('1403');
            await this.cook.deposit(0, '0', { from: alice });
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '50');
        });

        it('should appropriately calculate early-bird-bonuses at exact halving blocks', async () => {
            // 100 per block farming rate starting at block 300 with bonus until block 1000
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '50', '300', '10000', '10000', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            // 33x early bird stake for investors with at least 0 deposited
            await this.cook.add('100', this.lp.address, '0', '33', '100000', '10', true);
            await this.cook.add('100', this.lp2.address, '0', '17', '200000', '4', true);

            // any block up to and including end-of-grace has full bonus (with precision)
            assert.equal((await this.cook.getEarlyBirdMultiplier(0, 0)).valueOf(), '33000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(1000, 0)).valueOf(), '33000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(99999, 0)).valueOf(), '33000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(100000, 0)).valueOf(), '33000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(0, 1)).valueOf(), '17000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(1000, 1)).valueOf(), '17000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(99999, 1)).valueOf(), '17000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(199999, 1)).valueOf(), '17000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(200000, 1)).valueOf(), '17000000000000');

            // each halving period should cut bonus in half (multiplier above 1x).
            assert.equal((await this.cook.getEarlyBirdMultiplier(100010, 0)).valueOf(), '17000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(100020, 0)).valueOf(), '9000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(100030, 0)).valueOf(), '5000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(100040, 0)).valueOf(), '3000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(100050, 0)).valueOf(), '2000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(100060, 0)).valueOf(), '1500000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(100070, 0)).valueOf(), '1250000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(100080, 0)).valueOf(), '1125000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(100090, 0)).valueOf(), '1062500000000');

            assert.equal((await this.cook.getEarlyBirdMultiplier(200004, 1)).valueOf(), '9000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(200008, 1)).valueOf(), '5000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(200012, 1)).valueOf(), '3000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(200016, 1)).valueOf(), '2000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(200020, 1)).valueOf(), '1500000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(200024, 1)).valueOf(), '1250000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(200028, 1)).valueOf(), '1125000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(200032, 1)).valueOf(), '1062500000000');
        });

        it('should linearly interpolate early-bird divisors between exact halving blocks', async () => {
            // 100 per block farming rate starting at block 300 with bonus until block 1000
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '50', '300', '10000', '10000', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            // 33x early bird stake for investors with at least 0 deposited
            await this.cook.add('100', this.lp.address, '0', '33', '100000', '10', true);
            await this.cook.add('100', this.lp2.address, '0', '17', '200000', '4', true);

            // each halving period should cut bonus in half (multiplier above 1x).
            // the calculation is interpolated between halving moments,
            // linearly in the _divisor_. e.g. for lp 0:
            // mult = 1 + 32 / (1 + 1*(1/10))       block 100001
            // mult = 1 + 32 / (1 + 1*(2/10))       block 100002
            // mult = 1 + 32 / (1 + 1*(5/10))       block 100005
            // mult = 1 + 32 / (2 + 2*(5/10))       block 100015
            assert.equal((await this.cook.getEarlyBirdMultiplier(100001, 0)).valueOf(), '30090909090909');
            assert.equal((await this.cook.getEarlyBirdMultiplier(100002, 0)).valueOf(), '27666666666666');
            assert.equal((await this.cook.getEarlyBirdMultiplier(100005, 0)).valueOf(), '22333333333333');
            assert.equal((await this.cook.getEarlyBirdMultiplier(100008, 0)).valueOf(), '18777777777777');
            assert.equal((await this.cook.getEarlyBirdMultiplier(100011, 0)).valueOf(), '15545454545454');
            assert.equal((await this.cook.getEarlyBirdMultiplier(100012, 0)).valueOf(), '14333333333333');
            assert.equal((await this.cook.getEarlyBirdMultiplier(100015, 0)).valueOf(), '11666666666666');
            assert.equal((await this.cook.getEarlyBirdMultiplier(100016, 0)).valueOf(), '11000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(100018, 0)).valueOf(), '9888888888888');

            assert.equal((await this.cook.getEarlyBirdMultiplier(200001, 1)).valueOf(), '13800000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(200002, 1)).valueOf(), '11666666666666');
            assert.equal((await this.cook.getEarlyBirdMultiplier(200003, 1)).valueOf(), '10142857142857');
            assert.equal((await this.cook.getEarlyBirdMultiplier(200005, 1)).valueOf(), '7400000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(200006, 1)).valueOf(), '6333333333333');
            assert.equal((await this.cook.getEarlyBirdMultiplier(200007, 1)).valueOf(), '5571428571428');
            assert.equal((await this.cook.getEarlyBirdMultiplier(200008, 1)).valueOf(), '5000000000000');
        });

        it('should flatline early-bird bonuses after enough blocks', async () => {
            // 100 per block farming rate starting at block 300 with bonus until block 1000
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '50', '300', '10000', '10000', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            // 33x early bird stake for investors with at least 0 deposited
            await this.cook.add('100', this.lp.address, '0', '33', '100000', '10', true);
            await this.cook.add('100', this.lp2.address, '0', '17', '200000', '4', true);

            // any block up to and including end-of-grace has full bonus (with precision)
            assert.equal((await this.cook.getEarlyBirdMultiplier(101200, 0)).valueOf(), '1000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(200000, 0)).valueOf(), '1000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(200480, 1)).valueOf(), '1000000000000');
            assert.equal((await this.cook.getEarlyBirdMultiplier(300000, 1)).valueOf(), '1000000000000');
        });

        it('should distribute early-bird-bonus CHKNs properly for each staker above minimum', async () => {
            // a note on expected values: integer truncation occurs at each actual
            // balance update. e.g. as represented below, perform the indicated
            // arithmetic to determine expected balance, THEN truncate
            // (don't truncate at each step). If that result carries through to
            // a later balance calculation, use the truncated value as input.

            // 100 per block farming rate starting at block 300 with bonus until block 1000
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '50', '300', '10000', '10000', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            // 2x early bird stake for investors with at least 20 deposited
            await this.cook.add('100', this.lp.address, '20', '2', '100000', '1', true);
            await this.lp.approve(this.cook.address, '1000', { from: alice });
            await this.lp.approve(this.cook.address, '1000', { from: bob });
            await this.lp.approve(this.cook.address, '1000', { from: carol });
            // Alice deposits 10 LPs at block 1510
            await time.advanceBlockTo('1509');
            await this.cook.deposit(0, '10', { from: alice });
            // Bob deposits 20 LPs at block 1514
            await time.advanceBlockTo('1513');
            await this.cook.deposit(0, '20', { from: bob });
            // Carol deposits 30 LPs at block 1518
            await time.advanceBlockTo('1517');
            await this.cook.deposit(0, '30', { from: carol });
            // Alice deposits 10 more LPs at block 1520. At this point:
            //   Alice should have: 4*1000 + 4*1/5*1000 + 2*1/11*1000 = 4981
            //   FryCookFinal should have the remaining: 10000 - 4981 = 5019
            await time.advanceBlockTo('1519')
            await this.cook.deposit(0, '10', { from: alice });
            assert.equal((await this.chicken.totalSupply()).valueOf(), '11000');
            assert.equal((await this.chicken.balanceOf(alice)).valueOf(), '4981');
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(carol)).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(this.cook.address)).valueOf(), '5019');
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '1000');
            // Bob withdraws 5 LPs at block 1530. At this point:
            //   Bob should have: 4*4/5*1000 + 2*4/11*1000 + 10*4/14*1000 = 6784
            await time.advanceBlockTo('1529')
            await this.cook.withdraw(0, '5', { from: bob });
            assert.equal((await this.chicken.totalSupply()).valueOf(), '22000');
            assert.equal((await this.chicken.balanceOf(alice)).valueOf(), '4981');
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '6784');
            assert.equal((await this.chicken.balanceOf(carol)).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(this.cook.address)).valueOf(), '8235');
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '2000');
            // Alice withdraws 20 LPs at block 1540.
            // Bob withdraws 15 LPs at block 1550.
            // Carol withdraws 30 LPs at block 1560.
            await time.advanceBlockTo('1539')
            await this.cook.withdraw(0, '20', { from: alice });
            await time.advanceBlockTo('1549')
            await this.cook.withdraw(0, '15', { from: bob });
            await time.advanceBlockTo('1559')
            await this.cook.withdraw(0, '30', { from: carol });
            assert.equal((await this.chicken.totalSupply()).valueOf(), '55000');
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '5000');
            // Alice should have: 4981 + 10*4/14*1000 + 10*4/11.5*1000 = 11316
            assert.equal((await this.chicken.balanceOf(alice)).valueOf(), '11316');
            // Bob should have: 6784 + 10*1.5/11.5 * 1000 + 10*1.5/7.5*1000 = 10088
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '10088');
            // Carol should have: 2*6/11*1000 + 10*6/14*1000 + 10*6/11.5*1000 + 10*6/7.5*1000 + 10*1000 = 28594
            assert.equal((await this.chicken.balanceOf(carol)).valueOf(), '28594');
            // All of them should have 1000 LPs back.
            assert.equal((await this.lp.balanceOf(alice)).valueOf(), '1000');
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1000');
            assert.equal((await this.lp.balanceOf(carol)).valueOf(), '1000');
        });

        it('should distribute early-bird-bonus CHKNs properly for each staker above minimum w/in window', async () => {
            // a note on expected values: integer truncation occurs at each actual
            // balance update. e.g. as represented below, perform the indicated
            // arithmetic to determine expected balance, THEN truncate
            // (don't truncate at each step). If that result carries through to
            // a later balance calculation, use the truncated value as input.

            // 100 per block farming rate starting at block 300 with bonus until block 1000
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '50', '300', '100000', '100000', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            // 2x early bird stake for investors with at least 20 deposited BEFORE block 1619
            await this.cook.add('100', this.lp.address, '20', '5', '1618', '1', true);
            await this.lp.approve(this.cook.address, '1000', { from: alice });
            await this.lp.approve(this.cook.address, '1000', { from: bob });
            await this.lp.approve(this.cook.address, '1000', { from: carol });
            // Alice deposits 10 LPs at block 1610
            await time.advanceBlockTo('1609');
            await this.cook.deposit(0, '10', { from: alice });
            // Bob deposits 20 LPs at block 1614; qualifies @5
            await time.advanceBlockTo('1613');
            await this.cook.deposit(0, '20', { from: bob });
            // Carol deposits 30 LPs at block 1618; qualifies @5
            await time.advanceBlockTo('1617');
            await this.cook.deposit(0, '30', { from: carol });
            // Alice deposits 10 more LPs at block 1620, AFTER early-bird bonus. At this point:
            //   Alice should have: 4*1000 + 4*1/11*1000 + 2*1/26*1000 = 4440
            //   FryCookFinal should have the remaining: 10000 - 4440 = 5560
            await time.advanceBlockTo('1619')
            await this.cook.deposit(0, '10', { from: alice });  // qualifies @2
            assert.equal((await this.chicken.totalSupply()).valueOf(), '11000');
            assert.equal((await this.chicken.balanceOf(alice)).valueOf(), '4440');
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(carol)).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(this.cook.address)).valueOf(), '5560');
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '1000');
            // Bob withdraws 5 LPs at block 1630. At this point:
            //   Bob should have: 4*10/11*1000 + 2*10/26*1000 + 10*10/29*1000 = 7853
            await time.advanceBlockTo('1629')
            await this.cook.withdraw(0, '5', { from: bob });
            assert.equal((await this.chicken.totalSupply()).valueOf(), '22000');
            assert.equal((await this.chicken.balanceOf(alice)).valueOf(), '4440');
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '7853');
            assert.equal((await this.chicken.balanceOf(carol)).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(this.cook.address)).valueOf(), '7707');
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '2000');
            // Alice withdraws 20 LPs at block 1640.
            // Bob withdraws 15 LPs at block 1650.
            // Carol withdraws 30 LPs at block 1660.
            await time.advanceBlockTo('1639')
            await this.cook.withdraw(0, '20', { from: alice });
            await time.advanceBlockTo('1649')
            await this.cook.withdraw(0, '15', { from: bob });
            await time.advanceBlockTo('1659')
            await this.cook.withdraw(0, '30', { from: carol });
            assert.equal((await this.chicken.totalSupply()).valueOf(), '55000');
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '5000');
            // Alice should have: 4440 + 10*4/29*1000 + 10*4/20.5*1000 = 7770
            assert.equal((await this.chicken.balanceOf(alice)).valueOf(), '7770');
            // Bob should have: 7853 + 10*1.5/20.5 * 1000 + 10*1.5/16.5*1000 = 9493
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '9493');
            // Carol should have: 2*15/26*1000 + 10*15/29*1000 + 10*15/20.5*1000 + 10*15/16.5*1000 + 10*1000 = 32734
            assert.equal((await this.chicken.balanceOf(carol)).valueOf(), '32734');
            // All of them should have 1000 LPs back.
            assert.equal((await this.lp.balanceOf(alice)).valueOf(), '1000');
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1000');
            assert.equal((await this.lp.balanceOf(carol)).valueOf(), '1000');
        });

        it('should allow executive (creator) to grant roles and renounce own', async () => {
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '50', '300', '100000', '100000', { from: alice });

            await this.cook.grantRole(EXECUTIVE_ROLE, executive, { from: alice });
            await this.cook.grantRole(HEAD_CHEF_ROLE, head, { from: alice });
            await this.cook.grantRole(SOUS_CHEF_ROLE, sous, { from: alice });
            await this.cook.grantRole(WAITSTAFF_ROLE, waiter, { from: alice });

            // should have assigned roles and no others
            for (const address in ADDRESS_ROLE) {
              for (const role of ROLES) {
                assert.equal((await this.cook.hasRole(role, address)).toString(), `${role === ADDRESS_ROLE[address]}`);
              }
            }

            await this.cook.renounceRole(EXECUTIVE_ROLE, alice, { from: alice });
            await this.cook.renounceRole(HEAD_CHEF_ROLE, alice, { from: alice });
            assert.equal((await this.cook.hasRole(EXECUTIVE_ROLE, alice)).toString(), 'false');
            assert.equal((await this.cook.hasRole(HEAD_CHEF_ROLE, alice)).toString(), 'false');
        });

        it('should distribute CHKNs properly for each staker, up to chicken cap', async () => {
            // 100 per block farming rate starting at block 1700 with bonus until block 100000
            // mint enough to exhaust supply after 16000 more (technically 15000 + 1000 for dev based on order of ops)
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '50', '1700', '100000', '100000', { from: alice });
            await this.chicken.mint(minter, '579999999999999999999984000', { from: alice });
            await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
            await this.cook.add('100', this.lp.address, '0', '1', '100000', '1', true);
            await this.lp.approve(this.cook.address, '1000', { from: alice });
            await this.lp.approve(this.cook.address, '1000', { from: bob });
            await this.lp.approve(this.cook.address, '1000', { from: carol });
            // Alice deposits 10 LPs at block 1710
            await time.advanceBlockTo('1709');
            await this.cook.deposit(0, '10', { from: alice });
            // Bob deposits 20 LPs at block 1714
            await time.advanceBlockTo('1713');
            await this.cook.deposit(0, '20', { from: bob });
            // Carol deposits 30 LPs at block 1718
            await time.advanceBlockTo('1717');
            await this.cook.deposit(0, '30', { from: carol });
            // Alice deposits 10 more LPs at block 1720. At this point:
            //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
            //   FryCookFinal should have the remaining: 10000 - 5666 = 4334
            await time.advanceBlockTo('1719')
            await this.cook.deposit(0, '10', { from: alice });
            assert.equal((await this.chicken.totalSupply()).valueOf(), '579999999999999999999995000');
            assert.equal((await this.chicken.balanceOf(alice)).valueOf(), '5666');
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(carol)).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(this.cook.address)).valueOf(), '4334');
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '1000');
            // Bob withdraws 5 LPs at block 1730; token supply exhausted at 2125. At this point:
            //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 5*2/7*1000 = 4761
            await time.advanceBlockTo('1729')
            await this.cook.withdraw(0, '5', { from: bob });
            assert.equal((await this.chicken.totalSupply()).valueOf(), '580000000000000000000000000');
            assert.equal((await this.chicken.balanceOf(alice)).valueOf(), '5666');
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '4761');
            assert.equal((await this.chicken.balanceOf(carol)).valueOf(), '0');
            assert.equal((await this.chicken.balanceOf(this.cook.address)).valueOf(), '4573');
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '1000');
            // Alice withdraws 20 LPs at block 1740.
            // Bob withdraws 15 LPs at block 1750.
            // Carol withdraws 30 LPs at block 1760.
            await time.advanceBlockTo('1739')
            await this.cook.withdraw(0, '20', { from: alice });
            await time.advanceBlockTo('1749')
            await this.cook.withdraw(0, '15', { from: bob });
            await time.advanceBlockTo('1759')
            await this.cook.withdraw(0, '30', { from: carol });
            assert.equal((await this.chicken.totalSupply()).valueOf(), '580000000000000000000000000');
            assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '1000');
            // Alice should have: 5666 + 5*2/7*1000 = 7094
            assert.equal((await this.chicken.balanceOf(alice)).valueOf(), '7094');
            // Bob should have: 4761
            assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '4761');
            // Carol should have: 2*3/6*1000 + 5*3/7*1000 ~= 3143
            assert.equal((await this.chicken.balanceOf(carol)).valueOf(), '3143');
            // All of them should have 1000 LPs back.
            assert.equal((await this.lp.balanceOf(alice)).valueOf(), '1000');
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1000');
            assert.equal((await this.lp.balanceOf(carol)).valueOf(), '1000');
        });

        context('With all roles assigned', () => {
            beforeEach(async () => {
                this.cook = await FryCookFinal.new(this.chicken.address, dev, '50', '300', '100000', '100000', { from: alice });
                await this.cook.grantRole(EXECUTIVE_ROLE, executive, { from: alice });
                await this.cook.grantRole(HEAD_CHEF_ROLE, head, { from: alice });
                await this.cook.grantRole(SOUS_CHEF_ROLE, sous, { from: alice });
                await this.cook.grantRole(WAITSTAFF_ROLE, waiter, { from: alice });
                await this.cook.renounceRole(EXECUTIVE_ROLE, alice, { from: alice });
                await this.cook.renounceRole(HEAD_CHEF_ROLE, alice, { from: alice });
            });

            it('should only allow executive to grant roles', async () => {
                for (const role of ROLES) {
                  for (const from of [alice, head, sous, waiter]) {
                    await expectRevert(this.cook.grantRole(role, bob, { from }), 'AccessControl: sender must be an admin to grant');
                  }
                }

                for (const role of ROLES) {
                  await this.cook.grantRole(role, bob, { from: executive });
                  assert.equal((await this.cook.hasRole(role, bob)).toString(), 'true');
                }
            });

            it('should allow only head chef to add pools', async () => {
                for (const role of ROLES) {
                  for (const from of [alice, executive, sous, waiter]) {
                    await expectRevert(this.cook.add('1', this.lp.address, '0', '1', '100000', '1', true, { from }), 'FryCookFinal::add: not authorized');
                  }
                }

                await this.cook.add('1', this.lp.address, '0', '1', '100000', '1', true, { from: head });
                assert.equal((await this.cook.poolLength()).valueOf().toString(), '1');
            });

            it('should allow only head chef or sous chef to set pool allocation', async () => {
                await this.cook.add('1', this.lp.address, '0', '1', '100000', '1', true, { from: head });
                await this.cook.add('1', this.lp2.address, '0', '1', '100000', '1', true, { from: head });

                for (const role of ROLES) {
                  for (const from of [alice, executive, waiter]) {
                    await expectRevert(this.cook.set(0, 2, true, { from }), 'FryCookFinal::set: not authorized');
                  }
                }

                await this.cook.set(0, 2, true, { from: head });
                await this.cook.set(1, 5, true, { from: sous });

                assert.equal((await this.cook.poolInfo(0)).allocPoint, '2');
                assert.equal((await this.cook.poolInfo(1)).allocPoint, '5');
            });

            it('should allow only executive to set migrator', async () => {
                for (const role of ROLES) {
                  for (const from of [alice, head, sous, waiter]) {
                    await expectRevert(this.cook.setMigrator(bob, { from }), 'FryCookFinal::setMigrator: not authorized');
                  }
                }

                await this.cook.setMigrator(bob, { from: executive });
                assert.equal((await this.cook.migrator()), bob);
            });

            it('should allow only waitstaff to depositTo', async () => {
                await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
                await this.cook.add('100', this.lp.address, '0', '1', '0', '1', true, { from: head });
                await this.lp.transfer(executive, '1000', { from: minter });
                await this.lp.transfer(head, '1000', { from: minter });
                await this.lp.transfer(sous, '1000', { from: minter });
                await this.lp.transfer(waiter, '1000', { from: minter });
                await this.lp.approve(this.cook.address, '1000', { from: alice });
                await this.lp.approve(this.cook.address, '1000', { from: bob });
                await this.lp.approve(this.cook.address, '1000', { from: carol });
                await this.lp.approve(this.cook.address, '1000', { from: executive });
                await this.lp.approve(this.cook.address, '1000', { from: head });
                await this.lp.approve(this.cook.address, '1000', { from: sous });
                await this.lp.approve(this.cook.address, '1000', { from: waiter });

                for (const role of ROLES) {
                  for (const from of [alice, bob, executive, head, sous]) {
                    await expectRevert(this.cook.depositTo(0, 100, bob, { from }), 'FryCookFinal::depositTo: not authorized');
                  }
                }

                // invest 100 coins from bob at 2010
                await time.advanceBlockTo('2009');
                await this.cook.depositTo(0, 100, bob, { from: waiter });
                assert.equal((await this.lp.balanceOf(this.cook.address)).valueOf().toString(), '100');
                assert.equal((await this.lp.balanceOf(waiter)).valueOf().toString(), '900');

                // bob withdraws at 2020, having earned 10 * 1000 chicken
                await time.advanceBlockTo('2019');
                await this.cook.withdraw(0, 100, { from: bob });
                assert.equal((await this.lp.balanceOf(this.cook.address)).valueOf().toString(), '0');
                assert.equal((await this.lp.balanceOf(waiter)).valueOf().toString(), '900');
                assert.equal((await this.lp.balanceOf(bob)).valueOf().toString(), '1100');
                assert.equal((await this.chicken.balanceOf(bob)).valueOf().toString(), '10000');
            });

            it('should allow only waitstaff to withdrawFrom', async () => {
                await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
                await this.cook.add('100', this.lp.address, '0', '1', '0', '1', true, { from: head });
                await this.lp.transfer(executive, '1000', { from: minter });
                await this.lp.transfer(head, '1000', { from: minter });
                await this.lp.transfer(sous, '1000', { from: minter });
                await this.lp.transfer(waiter, '1000', { from: minter });
                await this.lp.approve(this.cook.address, '1000', { from: alice });
                await this.lp.approve(this.cook.address, '1000', { from: bob });
                await this.lp.approve(this.cook.address, '1000', { from: carol });
                await this.lp.approve(this.cook.address, '1000', { from: executive });
                await this.lp.approve(this.cook.address, '1000', { from: head });
                await this.lp.approve(this.cook.address, '1000', { from: sous });
                await this.lp.approve(this.cook.address, '1000', { from: waiter });

                // invest 100 coins from bob at 2110
                await time.advanceBlockTo('2109');
                await this.cook.deposit(0, 100, { from: bob });
                assert.equal((await this.lp.balanceOf(this.cook.address)).valueOf().toString(), '100');
                assert.equal((await this.lp.balanceOf(bob)).valueOf().toString(), '900');

                for (const role of ROLES) {
                  for (const from of [alice, bob, executive, head, sous]) {
                    await expectRevert(this.cook.withdrawFrom(0, 100, bob, { from }), 'FryCookFinal::withdrawFrom: not authorized');
                  }
                }

                // bob withdraws at 2140, having earned 30 * 1000 chicken
                await time.advanceBlockTo('2139');
                await this.cook.withdrawFrom(0, 100, bob, { from: waiter });
                assert.equal((await this.lp.balanceOf(this.cook.address)).valueOf().toString(), '0');
                assert.equal((await this.lp.balanceOf(waiter)).valueOf().toString(), '1100');
                assert.equal((await this.lp.balanceOf(bob)).valueOf().toString(), '900');
                assert.equal((await this.chicken.balanceOf(bob)).valueOf().toString(), '30000');
            });
        });

        it('should allow emergencyWithdraw after migrationDeposit', async () => {
            // 100 per block farming rate starting at block 100 with bonus until block 1000
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '100', '100', '1000', '1000', { from: alice });
            await this.cook.add('100', this.lp.address, '0', '1', '100000', '1', true);
            await this.lp.approve(this.cook.address, '1000', { from: alice });
            await this.cook.migrateDeposit(0, '100', false, '1', bob, { from: alice });
            assert.equal((await this.lp.balanceOf(alice)).valueOf(), '900');
            await this.cook.emergencyWithdraw(0, { from: bob });
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1100');
        });

        it('should have expected amount and score after migrationDeposit', async () => {
            // 100 per block farming rate starting at block 100 with bonus until block 1000
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '100', '100', '1000', '1000', { from: alice });
            await this.cook.add('100', this.lp.address, '0', '1', '100000', '1', true);
            await this.lp.approve(this.cook.address, '1000', { from: alice });
            await this.cook.migrateDeposit(0, '100', false, '1', bob, { from: alice });
            const poolInfo = await this.cook.poolInfo(0);
            const userInfo = await this.cook.userInfo(0, bob);
            assert.equal(bn(poolInfo.totalScore.valueOf().toString()).toString(), '100');
            assert.equal(bn(userInfo.amount.valueOf().toString()).toString(), '100');
            assert.equal(bn(userInfo.score.valueOf().toString()).toString(), '100');
            assert.equal(bn(userInfo.earlyBirdMult.valueOf().toString()).toString(), '1000000000000');
            assert.equal((await this.lp.balanceOf(alice)).valueOf(), '900');
            await this.cook.emergencyWithdraw(0, { from: bob });
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1100');
        });

        it('should have expected amount, score, and earlyBirdMult after migrationDeposit', async () => {
            // 100 per block farming rate starting at block 100 with bonus until block 1000
            this.cook = await FryCookFinal.new(this.chicken.address, dev, '100', '100', '1000', '1000', { from: alice });
            await this.cook.add('100', this.lp.address, '0', '1', '100000', '1', true);
            await this.lp.approve(this.cook.address, '1000', { from: alice });
            await this.cook.migrateDeposit(0, '100', true, '2000000000000', bob, { from: alice });
            const poolInfo = await this.cook.poolInfo(0);
            const userInfo = await this.cook.userInfo(0, bob);
            assert.equal(bn(poolInfo.totalScore.valueOf().toString()).toString(), '200');
            assert.equal(bn(userInfo.amount.valueOf().toString()).toString(), '100');
            assert.equal(bn(userInfo.score.valueOf().toString()).toString(), '200');
            assert.equal(userInfo.earlyBird.valueOf().toString(), 'true');
            assert.equal(bn(userInfo.earlyBirdMult.valueOf().toString()).toString(), '2000000000000');
            assert.equal((await this.lp.balanceOf(alice)).valueOf(), '900');
            await this.cook.emergencyWithdraw(0, { from: bob });
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1100');
        });
    });
});
