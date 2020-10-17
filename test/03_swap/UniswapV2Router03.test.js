const MockUniswapV2Reporting = artifacts.require('MockUniswapV2Reporting');
const MockERC20 = artifacts.require('MockERC20');
const MockWETH = artifacts.require('MockWETH');
const UniswapV2Pair = artifacts.require('UniswapV2Pair');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');
const UniswapV2Router03 = artifacts.require('UniswapV2Router03');

const { expectEvent, time } = require('@openzeppelin/test-helpers');

const chai = require('chai');
const { expect } = chai;
const { MaxUint256, AddressZero, Zero } = require('ethers').constants;
const { solidity } = require('ethereum-waffle');

const { bn, s, expandTo18Decimals, getApprovalDigest, MINIMUM_LIQUIDITY } = require('../shared/utilities');
const { ecsign } = require('ethereumjs-util');

chai.use(solidity)

contract('UniswapV2Router03 (UniswapV2Router03 interface)', ([alice, bob, carol, minter, scrooge]) => {
  beforeEach(async () => {
    // deploy tokens
    const tokenA = await MockERC20.new('TOKEN_A', 'A', expandTo18Decimals(10000));
    const tokenB = await MockERC20.new('TOKEN_B', 'B', expandTo18Decimals(10000));
    this.WETH = await MockWETH.new();
    this.WETHPartner = await MockERC20.new('TOKEN_WP', 'WP', expandTo18Decimals(10000));

    // deploy factory
    this.factory = await UniswapV2Factory.new(minter);

    // deploy router
    this.router = await UniswapV2Router03.new(this.factory.address, this.WETH.address);

    // initialize
    await this.factory.createPair(tokenA.address, tokenB.address);
    const pairAddress = await this.factory.getPair(tokenA.address, tokenB.address);
    this.pair = await UniswapV2Pair.at(pairAddress);

    // order tokens
    const token0Address = await this.pair.token0();
    this.token0 = tokenA.address == token0Address ? tokenA : tokenB;
    this.token1 = tokenA.address == token0Address ? tokenB : tokenA;

    // WETH pair
    await this.factory.createPair(this.WETH.address, this.WETHPartner.address);
    const WETHPairAddress = await this.factory.getPair(this.WETH.address, this.WETHPartner.address);
    this.WETHPair = await UniswapV2Pair.at(WETHPairAddress);

    // create a wallet account
    this.wallet = await web3.eth.accounts.create();
  });

  afterEach(async () => {
      expect(bn(await web3.eth.getBalance(this.router.address))).to.eq(bn(0));
  });

  it('addLiquidityWithReferrer', async () => {
    const { token0, token1, router, pair, wallet } = this;
    const token0Amount = expandTo18Decimals(1)
    const token1Amount = expandTo18Decimals(4)

    const referrer = '0x0123deadBeef'

    const expectedLiquidity = expandTo18Decimals(2)
    await token0.approve(router.address, MaxUint256)
    await token1.approve(router.address, MaxUint256)
    const { tx } = await router.addLiquidityWithReferrer(
      token0.address,
      token1.address,
      token0Amount,
      token1Amount,
      0,
      0,
      wallet.address,
      referrer,
      MaxUint256
    );

    await expectEvent.inTransaction(tx, token0, 'Transfer', { from:alice, to:pair.address, value:token0Amount });
    await expectEvent.inTransaction(tx, token1, 'Transfer', { from:alice, to:pair.address, value:token1Amount });
    await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:AddressZero, value:MINIMUM_LIQUIDITY });
    await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:wallet.address, value:expectedLiquidity.sub(MINIMUM_LIQUIDITY) });
    await expectEvent.inTransaction(tx, pair, 'Sync', { reserve0:token0Amount.toString(), reserve1:token1Amount });
    await expectEvent.inTransaction(tx, pair, 'Mint', { sender:router.address, amount0:token0Amount.toString(16), amount1:token1Amount });

    expect(bn(await pair.balanceOf(wallet.address))).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
  })

  it('addLiquidityETHWithReferrer', async () => {
    const { WETHPair, WETHPartner, router, wallet } = this;
    const WETHPartnerAmount = expandTo18Decimals(1)
    const ETHAmount = expandTo18Decimals(4)

    const referrer = '0x0451';

    const expectedLiquidity = expandTo18Decimals(2)
    const WETHPairToken0 = await WETHPair.token0()
    await WETHPartner.transfer(scrooge, WETHPartnerAmount, { from:alice });
    await WETHPartner.approve(router.address, MaxUint256, { from:scrooge });
    const { tx } = await router.addLiquidityETHWithReferrer(
        WETHPartner.address,
        WETHPartnerAmount,
        WETHPartnerAmount,
        ETHAmount,
        wallet.address,
        referrer,
        MaxUint256,
        { value: ETHAmount, from:scrooge }
      )
    await expectEvent.inTransaction(tx, WETHPair, 'Transfer', { from:AddressZero, to:AddressZero, value:MINIMUM_LIQUIDITY });
    await expectEvent.inTransaction(tx, WETHPair, 'Transfer', { from:AddressZero, to:wallet.address, value:expectedLiquidity.sub(MINIMUM_LIQUIDITY) });
    await expectEvent.inTransaction(tx, WETHPair, 'Sync', { reserve0:WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount : ETHAmount, reserve1:WETHPairToken0 === WETHPartner.address ? ETHAmount : WETHPartnerAmount });
    await expectEvent.inTransaction(tx, WETHPair, 'Mint', { sender:router.address, amount0:WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount : ETHAmount, amount1:WETHPairToken0 === WETHPartner.address ? ETHAmount : WETHPartnerAmount });

    expect(bn(await WETHPair.balanceOf(wallet.address))).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
  })

  context('With reporting', () => {
    beforeEach(async () => {
      this.reporting = await MockUniswapV2Reporting.new();
      await this.factory.setReportingTo(this.reporting.address, { from:minter });
    })

    it('addLiquidity', async () => {
      const { token0, token1, router, pair, wallet, reporting } = this;
      const token0Amount = expandTo18Decimals(1)
      const token1Amount = expandTo18Decimals(4)

      const expectedLiquidity = expandTo18Decimals(2)
      await token0.approve(router.address, MaxUint256)
      await token1.approve(router.address, MaxUint256)
      const { tx } = await router.addLiquidity(
        token0.address,
        token1.address,
        token0Amount,
        token1Amount,
        0,
        0,
        wallet.address,
        MaxUint256
      );

      await expectEvent.inTransaction(tx, token0, 'Transfer', { from:alice, to:pair.address, value:token0Amount });
      await expectEvent.inTransaction(tx, token1, 'Transfer', { from:alice, to:pair.address, value:token1Amount });
      await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:AddressZero, value:MINIMUM_LIQUIDITY });
      await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:wallet.address, value:expectedLiquidity.sub(MINIMUM_LIQUIDITY) });
      await expectEvent.inTransaction(tx, pair, 'Sync', { reserve0:token0Amount.toString(), reserve1:token1Amount });
      await expectEvent.inTransaction(tx, pair, 'Mint', { sender:router.address, amount0:token0Amount.toString(16), amount1:token1Amount });

      // reporting
      await expectEvent.inTransaction(tx, reporting, 'AddLiquidity', { user:wallet.address, tokenA:token0.address, amountA:token0Amount, tokenB:token1.address, amountB:token1Amount, referrer:'0x'.padEnd(66, '0') });

      expect(bn(await pair.balanceOf(wallet.address))).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    })

    it('addLiquidityETH', async () => {
      const { WETHPair, WETHPartner, router, wallet, reporting } = this;
      const WETHPartnerAmount = expandTo18Decimals(1)
      const ETHAmount = expandTo18Decimals(4)

      const expectedLiquidity = expandTo18Decimals(2)
      const WETHPairToken0 = await WETHPair.token0()
      await WETHPartner.transfer(scrooge, WETHPartnerAmount, { from:alice });
      await WETHPartner.approve(router.address, MaxUint256, { from:scrooge });
      const { tx } = await router.addLiquidityETH(
          WETHPartner.address,
          WETHPartnerAmount,
          WETHPartnerAmount,
          ETHAmount,
          wallet.address,
          MaxUint256,
          { value: ETHAmount, from:scrooge }
        )
      await expectEvent.inTransaction(tx, WETHPair, 'Transfer', { from:AddressZero, to:AddressZero, value:MINIMUM_LIQUIDITY });
      await expectEvent.inTransaction(tx, WETHPair, 'Transfer', { from:AddressZero, to:wallet.address, value:expectedLiquidity.sub(MINIMUM_LIQUIDITY) });
      await expectEvent.inTransaction(tx, WETHPair, 'Sync', { reserve0:WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount : ETHAmount, reserve1:WETHPairToken0 === WETHPartner.address ? ETHAmount : WETHPartnerAmount });
      await expectEvent.inTransaction(tx, WETHPair, 'Mint', { sender:router.address, amount0:WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount : ETHAmount, amount1:WETHPairToken0 === WETHPartner.address ? ETHAmount : WETHPartnerAmount });

      // reporting
      await expectEvent.inTransaction(tx, reporting, 'AddLiquidityETH', { user:wallet.address, token:WETHPartner.address, amountToken:WETHPartnerAmount, amountETH:ETHAmount, referrer:'0x'.padEnd(66, '0') });

      expect(bn(await WETHPair.balanceOf(wallet.address))).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    })

    it('addLiquidityWithReferrer', async () => {
      const { token0, token1, router, pair, wallet, reporting } = this;
      const token0Amount = expandTo18Decimals(1)
      const token1Amount = expandTo18Decimals(4)

      const referrer = '0x12345678';

      const expectedLiquidity = expandTo18Decimals(2)
      await token0.approve(router.address, MaxUint256)
      await token1.approve(router.address, MaxUint256)
      const { tx } = await router.addLiquidityWithReferrer(
        token0.address,
        token1.address,
        token0Amount,
        token1Amount,
        0,
        0,
        wallet.address,
        referrer,
        MaxUint256
      );

      await expectEvent.inTransaction(tx, token0, 'Transfer', { from:alice, to:pair.address, value:token0Amount });
      await expectEvent.inTransaction(tx, token1, 'Transfer', { from:alice, to:pair.address, value:token1Amount });
      await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:AddressZero, value:MINIMUM_LIQUIDITY });
      await expectEvent.inTransaction(tx, pair, 'Transfer', { from:AddressZero, to:wallet.address, value:expectedLiquidity.sub(MINIMUM_LIQUIDITY) });
      await expectEvent.inTransaction(tx, pair, 'Sync', { reserve0:token0Amount.toString(), reserve1:token1Amount });
      await expectEvent.inTransaction(tx, pair, 'Mint', { sender:router.address, amount0:token0Amount.toString(16), amount1:token1Amount });

      // reporting
      await expectEvent.inTransaction(tx, reporting, 'AddLiquidity', { user:wallet.address, tokenA:token0.address, amountA:token0Amount, tokenB:token1.address, amountB:token1Amount, referrer:referrer.padEnd(66, '0') });

      expect(bn(await pair.balanceOf(wallet.address))).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    })

    it('addLiquidityETHWithReferrer', async () => {
      const { WETHPair, WETHPartner, router, wallet, reporting } = this;
      const WETHPartnerAmount = expandTo18Decimals(1)
      const ETHAmount = expandTo18Decimals(4)

      const referrer = '0x0123456789abcdef'

      const expectedLiquidity = expandTo18Decimals(2)
      const WETHPairToken0 = await WETHPair.token0()
      await WETHPartner.transfer(scrooge, WETHPartnerAmount, { from:alice });
      await WETHPartner.approve(router.address, MaxUint256, { from:scrooge });
      const { tx } = await router.addLiquidityETHWithReferrer(
          WETHPartner.address,
          WETHPartnerAmount,
          WETHPartnerAmount,
          ETHAmount,
          wallet.address,
          referrer,
          MaxUint256,
          { value: ETHAmount, from:scrooge }
        )
      await expectEvent.inTransaction(tx, WETHPair, 'Transfer', { from:AddressZero, to:AddressZero, value:MINIMUM_LIQUIDITY });
      await expectEvent.inTransaction(tx, WETHPair, 'Transfer', { from:AddressZero, to:wallet.address, value:expectedLiquidity.sub(MINIMUM_LIQUIDITY) });
      await expectEvent.inTransaction(tx, WETHPair, 'Sync', { reserve0:WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount : ETHAmount, reserve1:WETHPairToken0 === WETHPartner.address ? ETHAmount : WETHPartnerAmount });
      await expectEvent.inTransaction(tx, WETHPair, 'Mint', { sender:router.address, amount0:WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount : ETHAmount, amount1:WETHPairToken0 === WETHPartner.address ? ETHAmount : WETHPartnerAmount });

      // reporting
      await expectEvent.inTransaction(tx, reporting, 'AddLiquidityETH', { user:wallet.address, token:WETHPartner.address, amountToken:WETHPartnerAmount, amountETH:ETHAmount, referrer:referrer.padEnd(66, '0') });

      expect(bn(await WETHPair.balanceOf(wallet.address))).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    })
  });
});
