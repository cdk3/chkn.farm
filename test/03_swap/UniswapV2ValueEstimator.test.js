const MockRouterEventEmitter = artifacts.require('MockRouterEventEmitter');
const MockERC20 = artifacts.require('MockERC20');
const MockWETH = artifacts.require('MockWETH');
const UniswapV2Pair = artifacts.require('UniswapV2Pair');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');
const UniswapV2Router03 = artifacts.require('UniswapV2Router03');
const UniswapV2ValueEstimator = artifacts.require('UniswapV2ValueEstimator');

const { expectEvent, time } = require('@openzeppelin/test-helpers');

const chai = require('chai');
const { expect } = chai;
const { MaxUint256, AddressZero, Zero } = require('ethers').constants;
const { solidity } = require('ethereum-waffle');

const { bn, s, expandTo18Decimals, getApprovalDigest, MINIMUM_LIQUIDITY } = require('../shared/utilities');
const { ecsign } = require('ethereumjs-util');

chai.use(solidity)

contract('UniswapV2ValueEstimator', ([alice, bob, carol, minter, reserve, scrooge]) => {
  beforeEach(async () => {
    // deploy tokens
    const tokenA = await MockERC20.new('TOKEN_A', 'A', expandTo18Decimals(10000));
    const tokenB = await MockERC20.new('TOKEN_B', 'B', expandTo18Decimals(10000));
    this.WETH = await MockWETH.new();
    this.WETHPartner = await MockERC20.new('TOKEN_WP', 'WP', expandTo18Decimals(10000));

    // deploy factory
    this.factory = await UniswapV2Factory.new(minter);

    // deploy estimator
    this.estimator = await UniswapV2ValueEstimator.new(this.factory.address, this.WETH.address);

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
    this.tokenA = tokenA;
    this.tokenB = tokenB;

    // WETH pair
    await this.factory.createPair(this.WETH.address, this.WETHPartner.address);
    const WETHPairAddress = await this.factory.getPair(this.WETH.address, this.WETHPartner.address);
    this.WETHPair = await UniswapV2Pair.at(WETHPairAddress);

    // WETH and tokenA pair
    await this.factory.createPair(this.WETH.address, tokenA.address);
    const WETHTokenAddress = await this.factory.getPair(this.WETH.address, tokenA.address);
    this.WETHTokenAPair = await UniswapV2Pair.at(WETHTokenAddress);

    // Event emitter
    this.routerEventEmitter = await MockRouterEventEmitter.new();

    // create a wallet account
    this.wallet = await web3.eth.accounts.create();
  });

  afterEach(async () => {
      expect(bn(await web3.eth.getBalance(this.router.address))).to.eq(bn(0));
  });

  it('factory, WETH', async () => {
    const { router, factory, WETH } = this;
    expect(await router.factory()).to.eq(factory.address)
    expect(await router.WETH()).to.eq(WETH.address)
  })

  const addLiquidity = async (token0Amount, token1Amount) => {
    const { token0, token1, pair, wallet } = this;
    await token0.transfer(pair.address, token0Amount)
    await token1.transfer(pair.address, token1Amount)
    await pair.mint(alice)
  }

  context('one token to ETH', () => {
    const WETHPartnerAmount = expandTo18Decimals(5)
    const ETHAmount = expandTo18Decimals(10)
    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = bn('1662497915624478906')

    beforeEach(async () => {
      const { router, WETH, WETHPartner, WETHPair, wallet } = this;
      await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
      await WETH.deposit({ value: ETHAmount, from:scrooge })
      await WETH.transfer(WETHPair.address, ETHAmount, { from:scrooge })
      await WETHPair.mint(wallet.address)
    })

    it('happy path', async () => {
      const { estimator, WETH, WETHPartner } = this;
      const value = await estimator.estimateValueETH([WETHPartner.address], [swapAmount]);
      assert.equal(bn(value.toString()).toString(), expectedOutputAmount.toString());
    })
  })

  context('two tokens to ETH', () => {
    const TokenAAmount = expandTo18Decimals(25)
    const WETHPartnerAmount = expandTo18Decimals(5)
    const ETHAmount = expandTo18Decimals(10)

    const swapAmountPartner = expandTo18Decimals(1)
    const swapAmountA = expandTo18Decimals(2)

    const expectedOutputAmount = bn('2401180585847491427')

    beforeEach(async () => {
      const { router, tokenA, WETHTokenAPair, WETH, WETHPartner, WETHPair, wallet } = this;
      await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
      await WETH.deposit({ value: ETHAmount, from:scrooge })
      await WETH.transfer(WETHPair.address, ETHAmount, { from:scrooge })
      await WETHPair.mint(wallet.address)

      await tokenA.transfer(WETHTokenAPair.address, TokenAAmount)
      await WETH.deposit({ value: ETHAmount, from:scrooge })
      await WETH.transfer(WETHTokenAPair.address, ETHAmount, { from:scrooge })
      await WETHTokenAPair.mint(wallet.address)
    })

    it('happy path', async () => {
      const { estimator, WETH, WETHPartner, tokenA } = this;
      const value = await estimator.estimateValueETH([WETHPartner.address, tokenA.address], [swapAmountPartner, swapAmountA]);
      assert.equal(bn(value.toString()).toString(), expectedOutputAmount.toString());
    })
  })

  context('two tokens to ETH, one with no liquidity', () => {
    const TokenAAmount = expandTo18Decimals(25)
    const WETHPartnerAmount = expandTo18Decimals(5)
    const ETHAmount = expandTo18Decimals(10)

    const swapAmountPartner = expandTo18Decimals(1)
    const swapAmountA = expandTo18Decimals(2)

    const expectedOutputAmount = bn('1662497915624478906')

    beforeEach(async () => {
      const { router, tokenA, WETHTokenAPair, WETH, WETHPartner, WETHPair, wallet } = this;
      await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
      await WETH.deposit({ value: ETHAmount, from:scrooge })
      await WETH.transfer(WETHPair.address, ETHAmount, { from:scrooge })
      await WETHPair.mint(wallet.address)
    })

    it('happy path', async () => {
      const { estimator, WETH, WETHPartner, tokenA } = this;
      const value = await estimator.estimateValueETH([WETHPartner.address, tokenA.address], [swapAmountPartner, swapAmountA]);
      assert.equal(bn(value.toString()).toString(), expectedOutputAmount.toString());
    })
  })

  context('two tokens to ETH, neither with liquidity', () => {
    const TokenAAmount = expandTo18Decimals(25)
    const WETHPartnerAmount = expandTo18Decimals(5)
    const ETHAmount = expandTo18Decimals(10)

    const swapAmountPartner = expandTo18Decimals(1)
    const swapAmountA = expandTo18Decimals(2)

    const expectedOutputAmount = bn('0')

    beforeEach(async () => {

    })

    it('happy path', async () => {
      const { estimator, WETH, WETHPartner, tokenA } = this;
      const value = await estimator.estimateValueETH([WETHPartner.address, tokenA.address], [swapAmountPartner, swapAmountA]);
      assert.equal(bn(value.toString()).toString(), expectedOutputAmount.toString());
    })
  })

  context('two tokens to ETH, one non-existent', () => {
    const TokenAAmount = expandTo18Decimals(25)
    const WETHPartnerAmount = expandTo18Decimals(5)
    const ETHAmount = expandTo18Decimals(10)

    const swapAmountPartner = expandTo18Decimals(1)
    const swapAmountA = expandTo18Decimals(2)

    const expectedOutputAmount = bn('1662497915624478906')

    beforeEach(async () => {
      const { router, tokenA, WETHTokenAPair, WETH, WETHPartner, WETHPair, wallet } = this;
      await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
      await WETH.deposit({ value: ETHAmount, from:scrooge })
      await WETH.transfer(WETHPair.address, ETHAmount, { from:scrooge })
      await WETHPair.mint(wallet.address)
    })

    it('happy path', async () => {
      const { estimator, WETH, WETHPartner, tokenB } = this;
      const value = await estimator.estimateValueETH([WETHPartner.address, tokenB.address], [swapAmountPartner, swapAmountA]);
      assert.equal(bn(value.toString()).toString(), expectedOutputAmount.toString());
    })
  })

  context('one token to ETH, another _is_ ETH', () => {
    const TokenAAmount = expandTo18Decimals(25)
    const WETHPartnerAmount = expandTo18Decimals(5)
    const ETHAmount = expandTo18Decimals(10)

    const swapAmountPartner = expandTo18Decimals(1)

    const expectedOutputAmount = bn('1662497915624478906').add(ETHAmount)

    beforeEach(async () => {
      const { router, tokenA, WETHTokenAPair, WETH, WETHPartner, WETHPair, wallet } = this;
      await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
      await WETH.deposit({ value: ETHAmount, from:scrooge })
      await WETH.transfer(WETHPair.address, ETHAmount, { from:scrooge })
      await WETHPair.mint(wallet.address)
    })

    it('happy path', async () => {
      const { estimator, WETH, WETHPartner, tokenB } = this;
      const value = await estimator.estimateValueETH([WETHPartner.address, WETH.address], [swapAmountPartner, ETHAmount]);
      assert.equal(bn(value.toString()).toString(), expectedOutputAmount.toString());
    })
  })
});
