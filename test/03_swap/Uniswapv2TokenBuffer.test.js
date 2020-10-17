const UniswapV2TokenBuffer = artifacts.require('UniswapV2TokenBuffer');
const MockERC20 = artifacts.require('MockERC20');
const UniswapV2Pair = artifacts.require('UniswapV2Pair');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');

contract('UniswapV2TokenBuffer', ([alice, bob, minter]) => {
    beforeEach(async () => {
        this.factory = await UniswapV2Factory.new(alice, { from: alice });
        this.standard = await MockERC20.new('STANDARD', 'STD', '200000000', { from: minter });
        await this.standard.transfer(alice, '100000000', { from: minter });
        this.weth = await MockERC20.new('WETH', 'WETH', '100000000', { from: minter });
        this.token1 = await MockERC20.new('TOKEN1', 'TOKEN', '100000000', { from: minter });
        this.token2 = await MockERC20.new('TOKEN2', 'TOKEN2', '100000000', { from: minter });
        this.buffer = await UniswapV2TokenBuffer.new(this.factory.address, bob, this.standard.address, this.weth.address);
        this.standardWETH = await UniswapV2Pair.at((await this.factory.createPair(this.weth.address, this.standard.address)).logs[0].args.pair);
        this.wethToken1 = await UniswapV2Pair.at((await this.factory.createPair(this.weth.address, this.token1.address)).logs[0].args.pair);
        this.wethToken2 = await UniswapV2Pair.at((await this.factory.createPair(this.weth.address, this.token2.address)).logs[0].args.pair);
        this.token1Token2 = await UniswapV2Pair.at((await this.factory.createPair(this.token1.address, this.token2.address)).logs[0].args.pair);
    });

    it('should convert LP tokens to standard token successfully through swaps', async () => {
        await this.factory.setFeeTo(this.buffer.address, { from: alice });
        await this.weth.transfer(this.standardWETH.address, '10000000', { from: minter });
        await this.standard.transfer(this.standardWETH.address, '10000000', { from: minter });
        await this.standardWETH.mint(minter);
        await this.weth.transfer(this.wethToken1.address, '10000000', { from: minter });
        await this.token1.transfer(this.wethToken1.address, '10000000', { from: minter });
        await this.wethToken1.mint(minter);
        await this.weth.transfer(this.wethToken2.address, '10000000', { from: minter });
        await this.token2.transfer(this.wethToken2.address, '10000000', { from: minter });
        await this.wethToken2.mint(minter);
        await this.token1.transfer(this.token1Token2.address, '10000000', { from: minter });
        await this.token2.transfer(this.token1Token2.address, '10000000', { from: minter });
        await this.token1Token2.mint(minter);
        // Fake some revenue
        await this.token1.transfer(this.token1Token2.address, '100000', { from: minter });
        await this.token2.transfer(this.token1Token2.address, '100000', { from: minter });
        await this.token1Token2.sync();
        await this.token1.transfer(this.token1Token2.address, '10000000', { from: minter });
        await this.token2.transfer(this.token1Token2.address, '10000000', { from: minter });
        await this.token1Token2.mint(minter);
        // Maker should have the LP now
        assert.equal((await this.token1Token2.balanceOf(this.buffer.address)).valueOf(), '16528');
        // After calling convert, bob should have CHKN value at ~1/6 of revenue
        await this.buffer.convert(this.token1.address, this.token2.address);
        assert.equal((await this.standard.balanceOf(bob)).valueOf(), '32965');
        assert.equal((await this.token1Token2.balanceOf(this.buffer.address)).valueOf(), '0');
        // Should also work for CHKN-ETH pair
        await this.standard.transfer(this.standardWETH.address, '100000', { from: minter });
        await this.weth.transfer(this.standardWETH.address, '100000', { from: minter });
        await this.standardWETH.sync();
        await this.standard.transfer(this.standardWETH.address, '10000000', { from: minter });
        await this.weth.transfer(this.standardWETH.address, '10000000', { from: minter });
        await this.standardWETH.mint(minter);
        assert.equal((await this.standardWETH.balanceOf(this.buffer.address)).valueOf(), '16537');
        await this.buffer.convert(this.standard.address, this.weth.address);
        assert.equal((await this.standard.balanceOf(bob)).valueOf(), '66249');
        assert.equal((await this.standardWETH.balanceOf(this.buffer.address)).valueOf(), '0');
    });
});
