const MockUniswapV2Library = artifacts.require('MockUniswapV2Library');
const MockERC20 = artifacts.require('MockERC20');
const UniswapV2Pair = artifacts.require('UniswapV2Pair');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');

const chai = require('chai');
const { expect } = chai;
const bigNumberify = require('ethers').utils.bigNumberify;
const { MaxUint256 } = require('ethers').constants;
const { solidity } = require('ethereum-waffle');

const { expandTo18Decimals, getApprovalDigest, MINIMUM_LIQUIDITY } = require('../shared/utilities');
const { ecsign } = require('ethereumjs-util');

chai.use(solidity)

contract('UniswapV2Library', ([alice, bob, carol, minter]) => {
  beforeEach(async () => {
    // deploy library
    this.library = await MockUniswapV2Library.new();

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
  });

  it('pairFor', async () => {
      const { library, factory, pair, token0, token1 } = this;
      const address = await this.library.pairFor(factory.address, token0.address, token1.address);

      assert.equal(address, pair.address, `UniswapV2Library.pairFor should use hex'${web3.utils.keccak256(UniswapV2Pair._json.bytecode).slice(2)}'`);
      // NOTE: the pairs are created with create2, so when the Pair contract changes
      // the library needs an updated bytecode to correctly predict deployment addresses.
  })
});
