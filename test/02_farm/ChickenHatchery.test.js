const { expectRevert } = require('@openzeppelin/test-helpers');
const ChickenTokenFinal = artifacts.require('ChickenTokenFinal');
const ChickenHatchery = artifacts.require('ChickenHatchery');

contract('ChickenHatchery', ([alice, bob, carol]) => {
    beforeEach(async () => {
        this.chicken = await ChickenTokenFinal.new({ from: alice });
        this.hatchery = await ChickenHatchery.new(this.chicken.address, { from: alice });
        this.chicken.mint(alice, '100', { from: alice });
        this.chicken.mint(bob, '100', { from: alice });
        this.chicken.mint(carol, '100', { from: alice });
    });

    it('should not allow enter if not enough approve', async () => {
        await expectRevert(
            this.hatchery.enter('100', { from: alice }),
            'ERC20: transfer amount exceeds allowance',
        );
        await this.chicken.approve(this.hatchery.address, '50', { from: alice });
        await expectRevert(
            this.hatchery.enter('100', { from: alice }),
            'ERC20: transfer amount exceeds allowance',
        );
        await this.chicken.approve(this.hatchery.address, '100', { from: alice });
        await this.hatchery.enter('100', { from: alice });
        assert.equal((await this.hatchery.balanceOf(alice)).valueOf(), '100');
    });

    it('should not allow withdraw more than what you have', async () => {
        await this.chicken.approve(this.hatchery.address, '100', { from: alice });
        await this.hatchery.enter('100', { from: alice });
        await expectRevert(
            this.hatchery.leave('200', { from: alice }),
            'ERC20: burn amount exceeds balance',
        );
    });

    it('should work with more than one participant', async () => {
        await this.chicken.approve(this.hatchery.address, '100', { from: alice });
        await this.chicken.approve(this.hatchery.address, '100', { from: bob });
        // Alice enters and gets 20 shares. Bob enters and gets 10 shares.
        await this.hatchery.enter('20', { from: alice });
        await this.hatchery.enter('10', { from: bob });
        assert.equal((await this.hatchery.balanceOf(alice)).valueOf(), '20');
        assert.equal((await this.hatchery.balanceOf(bob)).valueOf(), '10');
        assert.equal((await this.chicken.balanceOf(this.hatchery.address)).valueOf(), '30');
        // ChickenHatchery get 20 more CHKNs from an external source.
        await this.chicken.transfer(this.hatchery.address, '20', { from: carol });
        // Alice deposits 10 more CHKNs. She should receive 10*30/50 = 6 shares.
        await this.hatchery.enter('10', { from: alice });
        assert.equal((await this.hatchery.balanceOf(alice)).valueOf(), '26');
        assert.equal((await this.hatchery.balanceOf(bob)).valueOf(), '10');
        // Bob withdraws 5 shares. He should receive 5*60/36 = 8 shares
        await this.hatchery.leave('5', { from: bob });
        assert.equal((await this.hatchery.balanceOf(alice)).valueOf(), '26');
        assert.equal((await this.hatchery.balanceOf(bob)).valueOf(), '5');
        assert.equal((await this.chicken.balanceOf(this.hatchery.address)).valueOf(), '52');
        assert.equal((await this.chicken.balanceOf(alice)).valueOf(), '70');
        assert.equal((await this.chicken.balanceOf(bob)).valueOf(), '98');
    });
});
