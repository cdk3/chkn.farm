const MockERC20 = artifacts.require('MockERC20');
const UniswapV2Pair = artifacts.require('UniswapV2Pair');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');

const { expectEvent, time } = require('@openzeppelin/test-helpers');

const chai = require('chai');
const { expect } = chai;
const { MaxUint256, AddressZero, Zero } = require('ethers').constants;
const { solidity } = require('ethereum-waffle');

const { bn, s, expandTo18Decimals, getApprovalDigest, encodePrice, MINIMUM_LIQUIDITY } = require('../shared/utilities');
const { ecsign } = require('ethereumjs-util');

chai.use(solidity)

contract('UniswapV2Pair', ([alice, bob, carol, minter, scrooge]) => {
  beforeEach(async () => {
    // deploy tokens
    const tokenA = await MockERC20.new('TOKEN_A', 'A', expandTo18Decimals(10000));
    const tokenB = await MockERC20.new('TOKEN_B', 'B', expandTo18Decimals(10000));

    // deploy factory
    this.factory = await UniswapV2Factory.new(minter);

    // initialize
    await this.factory.createPair(tokenA.address, tokenB.address);
    const pairAddress = await this.factory.getPair(tokenA.address, tokenB.address);
    this.pair = await UniswapV2Pair.at(pairAddress);

    // order tokens
    const token0Address = await this.pair.token0();
    this.token0 = tokenA.address == token0Address ? tokenA : tokenB;
    this.token1 = tokenA.address == token0Address ? tokenB : tokenA;

    // create a wallet account
    this.wallet = await web3.eth.accounts.create();
  });

  it('mint', async () => {
    const { pair, wallet, token0, token1 } = this;
    const token0Amount = expandTo18Decimals(1)
    const token1Amount = expandTo18Decimals(4)
    await token0.transfer(pair.address, token0Amount)
    await token1.transfer(pair.address, token1Amount)

    const expectedLiquidity = expandTo18Decimals(2)
    const { tx } = await pair.mint(wallet.address);
    await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:AddressZero, value:MINIMUM_LIQUIDITY });
    await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:wallet.address, value:expectedLiquidity.sub(MINIMUM_LIQUIDITY) });
    await expectEvent.inTransaction(tx, pair, 'Sync', { reserve0:token0Amount, reserve1:token1Amount });
    await expectEvent.inTransaction(tx, pair, 'Mint', { sender:alice, amount0:token0Amount, amount1:token1Amount });

    expect(bn(await pair.totalSupply())).to.eq(expectedLiquidity)
    expect(bn(await pair.balanceOf(wallet.address))).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    expect(bn(await token0.balanceOf(pair.address))).to.eq(token0Amount)
    expect(bn(await token1.balanceOf(pair.address))).to.eq(token1Amount)
    const reserves = await pair.getReserves()
    expect(bn(reserves[0])).to.eq(token0Amount)
    expect(bn(reserves[1])).to.eq(token1Amount)
  })

  const addLiquidity = async (token0Amount, token1Amount) => {
    const { token0, token1, pair, wallet } = this;
    await token0.transfer(pair.address, token0Amount)
    await token1.transfer(pair.address, token1Amount)
    await pair.mint(alice)
  }
  const swapTestCases = [
    [1, 5, 10, '1662497915624478906'],
    [1, 10, 5, '453305446940074565'],

    [2, 5, 10, '2851015155847869602'],
    [2, 10, 5, '831248957812239453'],

    [1, 10, 10, '906610893880149131'],
    [1, 100, 100, '987158034397061298'],
    [1, 1000, 1000, '996006981039903216']
  ].map(a => a.map(n => (typeof n === 'string' ? bn(n) : expandTo18Decimals(n))))
  swapTestCases.forEach((swapTestCase, i) => {
    it(`getInputPrice:${i}`, async () => {
      const { pair, wallet, token0, token1 } = this;
      const [swapAmount, token0Amount, token1Amount, expectedOutputAmount] = swapTestCase
      await addLiquidity(token0Amount, token1Amount)
      await token0.transfer(pair.address, swapAmount)
      await expect(pair.swap(0, expectedOutputAmount.add(1), wallet.address, '0x')).to.be.revertedWith(
        'UniswapV2: K'
      )
      await pair.swap(0, expectedOutputAmount, wallet.address, '0x')
    })
  })

  const optimisticTestCases = [
    ['997000000000000000', 5, 10, 1], // given amountIn, amountOut = floor(amountIn * .997)
    ['997000000000000000', 10, 5, 1],
    ['997000000000000000', 5, 5, 1],
    [1, 5, 5, '1003009027081243732'] // given amountOut, amountIn = ceiling(amountOut / .997)
  ].map(a => a.map(n => (typeof n === 'string' ? bn(n) : expandTo18Decimals(n))))
  optimisticTestCases.forEach((optimisticTestCase, i) => {
    it(`optimistic:${i}`, async () => {
      const { pair, wallet, token0, token1 } = this;
      const [outputAmount, token0Amount, token1Amount, inputAmount] = optimisticTestCase
      await addLiquidity(token0Amount, token1Amount)
      await token0.transfer(pair.address, inputAmount)
      await expect(pair.swap(outputAmount.add(1), 0, wallet.address, '0x')).to.be.revertedWith(
        'UniswapV2: K'
      )
      await pair.swap(outputAmount, 0, wallet.address, '0x')
    })
  })

  it('swap:token0', async () => {
    const { pair, wallet, token0, token1 } = this;
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    await addLiquidity(token0Amount, token1Amount)

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = bn('1662497915624478906')
    await token0.transfer(pair.address, swapAmount)
    const { tx } = await pair.swap(0, expectedOutputAmount, wallet.address, '0x');
    await expectEvent.inTransaction(tx, token1, 'Transfer', { from:pair.address, to:wallet.address, value:expectedOutputAmount });
    await expectEvent.inTransaction(tx, pair, 'Sync', { reserve0:token0Amount.add(swapAmount), reserve1:token1Amount.sub(expectedOutputAmount) });
    await expectEvent.inTransaction(tx, pair, 'Swap', { sender:alice, amount0In:swapAmount, amount1In:bn(0), amount0Out:bn(0), amount1Out:expectedOutputAmount, to:wallet.address });

    const reserves = await pair.getReserves()
    expect(bn(reserves[0])).to.eq(token0Amount.add(swapAmount))
    expect(bn(reserves[1])).to.eq(token1Amount.sub(expectedOutputAmount))
    expect(bn(await token0.balanceOf(pair.address))).to.eq(token0Amount.add(swapAmount))
    expect(bn(await token1.balanceOf(pair.address))).to.eq(token1Amount.sub(expectedOutputAmount))
    const totalSupplyToken0 = bn(await token0.totalSupply())
    const totalSupplyToken1 = bn(await token1.totalSupply())
    expect(bn(await token0.balanceOf(alice))).to.eq(totalSupplyToken0.sub(token0Amount).sub(swapAmount))
    expect(bn(await token1.balanceOf(wallet.address))).to.eq(expectedOutputAmount);
  })

  it('swap:token1', async () => {
    const { pair, wallet, token0, token1 } = this;
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    await addLiquidity(token0Amount, token1Amount)

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = bn('453305446940074565')
    await token1.transfer(pair.address, swapAmount)
    const { tx } = await pair.swap(expectedOutputAmount, 0, wallet.address, '0x');
    await expectEvent.inTransaction(tx, token0, 'Transfer', { from:pair.address, to:wallet.address, value:expectedOutputAmount });
    await expectEvent.inTransaction(tx, pair, 'Sync', { reserve0:token0Amount.sub(expectedOutputAmount), reserve1:token1Amount.add(swapAmount) });
    await expectEvent.inTransaction(tx, pair, 'Swap', { sender:alice, amount0In:bn(0), amount1In:swapAmount, amount0Out:expectedOutputAmount, amount1Out:bn(0), to:wallet.address });

    const reserves = await pair.getReserves()
    expect(bn(reserves[0])).to.eq(token0Amount.sub(expectedOutputAmount))
    expect(bn(reserves[1])).to.eq(token1Amount.add(swapAmount))
    expect(bn(await token0.balanceOf(pair.address))).to.eq(token0Amount.sub(expectedOutputAmount))
    expect(bn(await token1.balanceOf(pair.address))).to.eq(token1Amount.add(swapAmount))
    const totalSupplyToken0 = bn(await token0.totalSupply())
    const totalSupplyToken1 = bn(await token1.totalSupply())
    expect(bn(await token0.balanceOf(wallet.address))).to.eq(expectedOutputAmount)
    expect(bn(await token1.balanceOf(alice))).to.eq(totalSupplyToken1.sub(token1Amount).sub(swapAmount))
  })

  /* TODO: restore gas tests
  it('swap:gas', async () => {
    const { pair, wallet, token0, token1 } = this;
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    await addLiquidity(token0Amount, token1Amount)

    // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
    await time.advanceBlock();
    await pair.sync()

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = bn('453305446940074565')
    await token1.transfer(pair.address, swapAmount)

    await time.advanceBlock();
    const tx = await pair.swap(expectedOutputAmount, 0, wallet.address, '0x')
    const receipt = await tx.wait()
    expect(receipt.gasUsed).to.eq(73462)
  })
  */

  it('burn', async () => {
    const { pair, wallet, token0, token1 } = this;
    const token0Amount = expandTo18Decimals(3)
    const token1Amount = expandTo18Decimals(3)
    await addLiquidity(token0Amount, token1Amount)

    const expectedLiquidity = expandTo18Decimals(3)
    await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    const { tx } = await pair.burn(wallet.address);
    await expectEvent.inTransaction(tx, pair, 'Transfer', { from:pair.address, to:AddressZero, value:expectedLiquidity.sub(MINIMUM_LIQUIDITY) });
    await expectEvent.inTransaction(tx, token0, 'Transfer', { from:pair.address, to:wallet.address, value:token0Amount.sub(1000) });
    await expectEvent.inTransaction(tx, token1, 'Transfer', { from:pair.address, to:wallet.address, value:token1Amount.sub(1000) });
    await expectEvent.inTransaction(tx, pair, 'Sync', { reserve0:bn(1000), reserve1:bn(1000) });
    await expectEvent.inTransaction(tx, pair, 'Burn', { sender:alice, amount0:token0Amount.sub(1000), amount1:token1Amount.sub(1000), to:wallet.address });

    expect(bn(await pair.balanceOf(wallet.address))).to.eq(0)
    expect(bn(await pair.totalSupply())).to.eq(MINIMUM_LIQUIDITY)
    expect(bn(await token0.balanceOf(pair.address))).to.eq(1000)
    expect(bn(await token1.balanceOf(pair.address))).to.eq(1000)
    const totalSupplyToken0 = bn(await token0.totalSupply())
    const totalSupplyToken1 = bn(await token1.totalSupply())
    expect(bn(await token0.balanceOf(wallet.address))).to.eq(token0Amount.sub(1000))
    expect(bn(await token1.balanceOf(wallet.address))).to.eq(token1Amount.sub(1000))
  })

  /* TODO Restore ability to mine blocks at specific timestamps
  it('price{0,1}CumulativeLast', async () => {
    const { pair, wallet, token0, token1 } = this;
    const token0Amount = expandTo18Decimals(3)
    const token1Amount = expandTo18Decimals(3)
    await addLiquidity(token0Amount, token1Amount)

    const blockTimestamp = (await pair.getReserves())[2]
    await mineBlock(provider, blockTimestamp + 1)
    await pair.sync()

    const initialPrice = encodePrice(token0Amount, token1Amount)
    expect(bn(await pair.price0CumulativeLast())).to.eq(initialPrice[0])
    expect(bn(await pair.price1CumulativeLast())).to.eq(initialPrice[1])
    expect(bn((await pair.getReserves())[2])).to.eq(blockTimestamp + 1)

    const swapAmount = expandTo18Decimals(3)
    await token0.transfer(pair.address, swapAmount)
    await mineBlock(provider, blockTimestamp + 10)
    // swap to a new price eagerly instead of syncing
    await pair.swap(0, expandTo18Decimals(1), wallet.address, '0x') // make the price nice

    expect(bn(await pair.price0CumulativeLast())).to.eq(initialPrice[0].mul(10))
    expect(bn(await pair.price1CumulativeLast())).to.eq(initialPrice[1].mul(10))
    expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 10)

    await mineBlock(provider, blockTimestamp + 20)
    await pair.sync()

    const newPrice = encodePrice(expandTo18Decimals(6), expandTo18Decimals(2))
    expect(bn(await pair.price0CumulativeLast())).to.eq(initialPrice[0].mul(10).add(newPrice[0].mul(10)))
    expect(bn(await pair.price1CumulativeLast())).to.eq(initialPrice[1].mul(10).add(newPrice[1].mul(10)))
    expect((await pair.getReserves())[2]).to.eq(blockTimestamp + 20)
  })
  */

  it('feeTo:off', async () => {
    const { pair, wallet, token0, token1 } = this;
    const token0Amount = expandTo18Decimals(1000)
    const token1Amount = expandTo18Decimals(1000)
    await addLiquidity(token0Amount, token1Amount)

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = bn('996006981039903216')
    await token1.transfer(pair.address, swapAmount)
    await pair.swap(expectedOutputAmount, 0, wallet.address, '0x')

    const expectedLiquidity = expandTo18Decimals(1000)
    await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    await pair.burn(wallet.address)
    expect(bn(await pair.totalSupply())).to.eq(MINIMUM_LIQUIDITY)
  })

  it('feeTo:on', async () => {
    const { pair, wallet, token0, token1, factory } = this;
    await factory.setFeeTo(bob, { from:minter });

    const token0Amount = expandTo18Decimals(1000)
    const token1Amount = expandTo18Decimals(1000)
    await addLiquidity(token0Amount, token1Amount)

    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = bn('996006981039903216')
    await token1.transfer(pair.address, swapAmount)
    await pair.swap(expectedOutputAmount, 0, wallet.address, '0x')

    const expectedLiquidity = expandTo18Decimals(1000)
    await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    await pair.burn(wallet.address)
    expect(bn(await pair.totalSupply())).to.eq(MINIMUM_LIQUIDITY.add('249750499251388'))
    expect(bn(await pair.balanceOf(bob))).to.eq('249750499251388')

    // using 1000 here instead of the symbolic MINIMUM_LIQUIDITY because the amounts only happen to be equal...
    // ...because the initial liquidity amounts were equal
    expect(bn(await token0.balanceOf(pair.address))).to.eq(bn(1000).add('249501683697445'))
    expect(bn(await token1.balanceOf(pair.address))).to.eq(bn(1000).add('250000187312969'))
  })

  it('mintingFeeTo:off', async () => {
    const { pair, wallet, token0, token1 } = this;
    const token0Amount = expandTo18Decimals(1)
    const token1Amount = expandTo18Decimals(4)
    await token0.transfer(pair.address, token0Amount)
    await token1.transfer(pair.address, token1Amount)

    const expectedLiquidity = expandTo18Decimals(2)
    const { tx } = await pair.mint(wallet.address);
    await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:AddressZero, value:MINIMUM_LIQUIDITY });
    await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:wallet.address, value:expectedLiquidity.sub(MINIMUM_LIQUIDITY) });
    await expectEvent.inTransaction(tx, pair, 'Sync', { reserve0:token0Amount, reserve1:token1Amount });
    await expectEvent.inTransaction(tx, pair, 'Mint', { sender:alice, amount0:token0Amount, amount1:token1Amount });

    expect(bn(await pair.totalSupply())).to.eq(expectedLiquidity)
    expect(bn(await pair.balanceOf(wallet.address))).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    expect(bn(await token0.balanceOf(pair.address))).to.eq(token0Amount)
    expect(bn(await token1.balanceOf(pair.address))).to.eq(token1Amount)
    const reserves = await pair.getReserves()
    expect(bn(reserves[0])).to.eq(token0Amount)
    expect(bn(reserves[1])).to.eq(token1Amount)
  })

  it('mintingFeeTo:on', async () => {
    const { pair, wallet, token0, token1, factory } = this;
    await factory.setMintingFeeTo(bob, { from:minter });
    const token0Amount = expandTo18Decimals(1)
    const token1Amount = expandTo18Decimals(4)
    await token0.transfer(pair.address, token0Amount)
    await token1.transfer(pair.address, token1Amount)

    const expectedLiquidity = expandTo18Decimals(2);
    const expectedUnreserved = expectedLiquidity.sub(MINIMUM_LIQUIDITY);
    const expectedFee = expectedUnreserved.div(20);
    const expectedLP = expectedUnreserved.sub(expectedFee);
    const { tx } = await pair.mint(wallet.address);
    await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:AddressZero, value:MINIMUM_LIQUIDITY });
    await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:wallet.address, value:expectedLP });
    await expectEvent.inTransaction(tx, pair, 'Sync', { reserve0:token0Amount, reserve1:token1Amount });
    await expectEvent.inTransaction(tx, pair, 'Mint', { sender:alice, amount0:token0Amount, amount1:token1Amount });

    expect(bn(await pair.totalSupply())).to.eq(expectedLiquidity)
    expect(bn(await pair.balanceOf(wallet.address))).to.eq(expectedLP)
    expect(bn(await pair.balanceOf(bob))).to.eq(expectedFee)
    expect(bn(await token0.balanceOf(pair.address))).to.eq(token0Amount)
    expect(bn(await token1.balanceOf(pair.address))).to.eq(token1Amount)
    const reserves = await pair.getReserves()
    expect(bn(reserves[0])).to.eq(token0Amount)
    expect(bn(reserves[1])).to.eq(token1Amount)
  })

  it('mintingFeeTo:off,suspended', async () => {
    const { pair, wallet, token0, token1, factory } = this;
    await factory.setMintingFeeSuspended(true, { from:minter });
    const token0Amount = expandTo18Decimals(1)
    const token1Amount = expandTo18Decimals(4)
    await token0.transfer(pair.address, token0Amount)
    await token1.transfer(pair.address, token1Amount)

    const expectedLiquidity = expandTo18Decimals(2)
    const { tx } = await pair.mint(wallet.address);
    await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:AddressZero, value:MINIMUM_LIQUIDITY });
    await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:wallet.address, value:expectedLiquidity.sub(MINIMUM_LIQUIDITY) });
    await expectEvent.inTransaction(tx, pair, 'Sync', { reserve0:token0Amount, reserve1:token1Amount });
    await expectEvent.inTransaction(tx, pair, 'Mint', { sender:alice, amount0:token0Amount, amount1:token1Amount });

    expect(bn(await pair.totalSupply())).to.eq(expectedLiquidity)
    expect(bn(await pair.balanceOf(wallet.address))).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    expect(bn(await token0.balanceOf(pair.address))).to.eq(token0Amount)
    expect(bn(await token1.balanceOf(pair.address))).to.eq(token1Amount)
    const reserves = await pair.getReserves()
    expect(bn(reserves[0])).to.eq(token0Amount)
    expect(bn(reserves[1])).to.eq(token1Amount)
  })

  it('mintingFeeTo:on,suspended', async () => {
    const { pair, wallet, token0, token1, factory } = this;
    await factory.setMintingFeeTo(bob, { from:minter });
    await factory.setMintingFeeSuspended(true, { from:minter });
    const token0Amount = expandTo18Decimals(1)
    const token1Amount = expandTo18Decimals(4)
    await token0.transfer(pair.address, token0Amount)
    await token1.transfer(pair.address, token1Amount)

    const expectedLiquidity = expandTo18Decimals(2)
    const { tx } = await pair.mint(wallet.address);
    await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:AddressZero, value:MINIMUM_LIQUIDITY });
    await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:wallet.address, value:expectedLiquidity.sub(MINIMUM_LIQUIDITY) });
    await expectEvent.inTransaction(tx, pair, 'Sync', { reserve0:token0Amount, reserve1:token1Amount });
    await expectEvent.inTransaction(tx, pair, 'Mint', { sender:alice, amount0:token0Amount, amount1:token1Amount });

    expect(bn(await pair.totalSupply())).to.eq(expectedLiquidity)
    expect(bn(await pair.balanceOf(wallet.address))).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    expect(bn(await pair.balanceOf(bob))).to.eq(bn(0));
    expect(bn(await token0.balanceOf(pair.address))).to.eq(token0Amount)
    expect(bn(await token1.balanceOf(pair.address))).to.eq(token1Amount)
    const reserves = await pair.getReserves()
    expect(bn(reserves[0])).to.eq(token0Amount)
    expect(bn(reserves[1])).to.eq(token1Amount)
  })

  it('mintingFeeTo:on,unsuspended', async () => {
    const { pair, wallet, token0, token1, factory } = this;
    await factory.setMintingFeeTo(bob, { from:minter });
    const token0Amount = expandTo18Decimals(1)
    const token1Amount = expandTo18Decimals(4)
    await token0.transfer(pair.address, token0Amount)
    await token1.transfer(pair.address, token1Amount)

    const expectedLiquidity = expandTo18Decimals(2);
    const expectedUnreserved = expectedLiquidity.sub(MINIMUM_LIQUIDITY);
    const expectedFee = expectedUnreserved.div(20);
    const expectedLP = expectedUnreserved.sub(expectedFee);
    await factory.setMintingFeeSuspended(true, { from:minter });
    await factory.setMintingFeeSuspended(false, { from:minter });
    const { tx } = await pair.mint(wallet.address);
    await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:AddressZero, value:MINIMUM_LIQUIDITY });
    await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:wallet.address, value:expectedLP });
    await expectEvent.inTransaction(tx, pair, 'Sync', { reserve0:token0Amount, reserve1:token1Amount });
    await expectEvent.inTransaction(tx, pair, 'Mint', { sender:alice, amount0:token0Amount, amount1:token1Amount });

    expect(bn(await pair.totalSupply())).to.eq(expectedLiquidity)
    expect(bn(await pair.balanceOf(wallet.address))).to.eq(expectedLP)
    expect(bn(await pair.balanceOf(bob))).to.eq(expectedFee)
    expect(bn(await token0.balanceOf(pair.address))).to.eq(token0Amount)
    expect(bn(await token1.balanceOf(pair.address))).to.eq(token1Amount)
    const reserves = await pair.getReserves()
    expect(bn(reserves[0])).to.eq(token0Amount)
    expect(bn(reserves[1])).to.eq(token1Amount)
  })
});
