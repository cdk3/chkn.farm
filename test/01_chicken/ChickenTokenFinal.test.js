const { expectRevert } = require('@openzeppelin/test-helpers');
const ChickenTokenFinal = artifacts.require('ChickenTokenFinal');

contract('ChickenTokenFinal', ([alice, bob, carol]) => {
    const MINTER_ROLE = web3.utils.soliditySha3('MINTER_ROLE');

    beforeEach(async () => {
        this.chicken = await ChickenTokenFinal.new({ from: alice });
    });

    it('should have correct name and symbol and decimal', async () => {
        const name = await this.chicken.name();
        const symbol = await this.chicken.symbol();
        const decimals = await this.chicken.decimals();
        const cap = await this.chicken.cap();
        assert.equal(name.valueOf(), 'ChickenToken');
        assert.equal(symbol.valueOf(), 'CHKN');
        assert.equal(decimals.valueOf(), '18');
        assert.equal(cap.valueOf(), '580000000000000000000000000');
    });

    it('should only allow owner to mint token', async () => {
        await this.chicken.mint(alice, '100', { from: alice });
        await this.chicken.mint(bob, '1000', { from: alice });
        await expectRevert(
            this.chicken.mint(carol, '1000', { from: bob }),
            "ChickenToken::mint: not authorized",
        );
        const totalSupply = await this.chicken.totalSupply();
        const aliceBal = await this.chicken.balanceOf(alice);
        const bobBal = await this.chicken.balanceOf(bob);
        const carolBal = await this.chicken.balanceOf(carol);
        assert.equal(totalSupply.valueOf(), '1100');
        assert.equal(aliceBal.valueOf(), '100');
        assert.equal(bobBal.valueOf(), '1000');
        assert.equal(carolBal.valueOf(), '0');
    });

    it('should supply token transfers properly', async () => {
        await this.chicken.mint(alice, '100', { from: alice });
        await this.chicken.mint(bob, '1000', { from: alice });
        await this.chicken.transfer(carol, '10', { from: alice });
        await this.chicken.transfer(carol, '100', { from: bob });
        const totalSupply = await this.chicken.totalSupply();
        const aliceBal = await this.chicken.balanceOf(alice);
        const bobBal = await this.chicken.balanceOf(bob);
        const carolBal = await this.chicken.balanceOf(carol);
        assert.equal(totalSupply.valueOf(), '1100');
        assert.equal(aliceBal.valueOf(), '90');
        assert.equal(bobBal.valueOf(), '900');
        assert.equal(carolBal.valueOf(), '110');
    });

    it('should fail if you try to do bad transfers', async () => {
        await this.chicken.mint(alice, '100', { from: alice });
        await expectRevert(
            this.chicken.transfer(carol, '110', { from: alice }),
            'ERC20: transfer amount exceeds balance',
        );
        await expectRevert(
            this.chicken.transfer(carol, '1', { from: bob }),
            'ERC20: transfer amount exceeds balance',
        );
    });

    it('should fail if you try to mint more than the cap', async () => {
        await this.chicken.mint(alice, '570000000000000000000000000', { from: alice }); // 10M left
        await expectRevert(
          this.chicken.mint(alice, '10000000000000000000000001', { from: alice }),
          'ERC20Capped: cap exceeded'
        );
        await this.chicken.mint(alice, '9999999999999999999999999', { from: alice }); // 1 left
        await expectRevert(
          this.chicken.mint(alice, '10000000000000000000000001', { from: alice }),
          'ERC20Capped: cap exceeded'
        );
        await expectRevert(
          this.chicken.mint(alice, '2', { from: alice }),
          'ERC20Capped: cap exceeded'
        );
        await this.chicken.mint(alice, '1', { from: alice }); // 1 left
        await expectRevert(
          this.chicken.mint(alice, '10000000000000000000000001', { from: alice }),
          'ERC20Capped: cap exceeded'
        );
        await expectRevert(
          this.chicken.mint(alice, '2', { from: alice }),
          'ERC20Capped: cap exceeded'
        );
        await expectRevert(
          this.chicken.mint(alice, '1', { from: alice }),
          'ERC20Capped: cap exceeded'
        );
        await this.chicken.mint(alice, '0', { from: alice }); // fine to mint 0
    });
  });
