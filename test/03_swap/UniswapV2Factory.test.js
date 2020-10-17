const MockERC20 = artifacts.require('MockERC20');
const UniswapV2Pair = artifacts.require('UniswapV2Pair');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');

const { expectEvent, time } = require('@openzeppelin/test-helpers');

const chai = require('chai');
const { expect } = chai;
const { MaxUint256, AddressZero, Zero } = require('ethers').constants;
const { solidity } = require('ethereum-waffle');

const { bn, s, expandTo18Decimals, getApprovalDigest, encodePrice, getCreate2Address, getAddress, MINIMUM_LIQUIDITY } = require('../shared/utilities');
const { ecsign } = require('ethereumjs-util');

chai.use(solidity)

const TEST_ADDRESSES = [
  '0x1000000000000000000000000000000000000000',
  '0x2000000000000000000000000000000000000000'
]

contract('UniswapV2Factory', ([alice, bob, carol, minter, scrooge]) => {
  beforeEach(async () => {
    // deploy factory
    this.factory = await UniswapV2Factory.new(minter);

    // create a wallet account
    this.wallet = await web3.eth.accounts.create();
  });

  it('feeTo, feeToSetter, allPairsLength', async () => {
    const { factory } = this;
    expect(await factory.feeTo()).to.eq(AddressZero)
    expect(await factory.feeToSetter()).to.eq(minter)
    expect(await factory.reportingTo()).to.eq(AddressZero);
    expect(await factory.mintingFeeTo()).to.eq(AddressZero);
    expect(await factory.mintingFeeSuspended()).to.eq(false);
    expect(await factory.feeSuspendedSetter()).to.eq(AddressZero);
    expect(await factory.migrator()).to.eq(AddressZero);
    expect(bn(await factory.allPairsLength())).to.eq(0)
  })

  const createPair = async (tokens) => {
    const { factory } = this;
    const bytecode = UniswapV2Pair._json.bytecode;
    const create2Address = getCreate2Address(factory.address, tokens, bytecode)
    const { tx } = await factory.createPair(...tokens);
    const [token0, token1] = bn(tokens[0]).lt(tokens[1]) ? [tokens[0], tokens[1]].map(getAddress) : [tokens[1], tokens[0]].map(getAddress);
    await expectEvent.inTransaction(tx, factory, 'PairCreated', { token0, token1, pair:create2Address });

    await expect(factory.createPair(...tokens)).to.be.reverted // UniswapV2: PAIR_EXISTS
    await expect(factory.createPair(...tokens.slice().reverse())).to.be.reverted // UniswapV2: PAIR_EXISTS
    expect(await factory.getPair(...tokens)).to.eq(create2Address)
    expect(await factory.getPair(...tokens.slice().reverse())).to.eq(create2Address)
    expect(await factory.allPairs(0)).to.eq(create2Address)
    expect(bn(await factory.allPairsLength())).to.eq(bn(1))

    const pair = await UniswapV2Pair.at(create2Address);
    expect(await pair.factory()).to.eq(factory.address)
    expect(await pair.token0()).to.eq(token0)
    expect(await pair.token1()).to.eq(token1)
  }

  it('createPair', async () => {
    await createPair(TEST_ADDRESSES)
  })

  it('createPair:reverse', async () => {
    await createPair(TEST_ADDRESSES.slice().reverse())
  })

  it('createPair:problem inputs',  async() => {
    await createPair(['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2']);
  })

  /* TODO: restore gas-based testing
  it('createPair:gas', async () => {
    const { factory } = this;
    const { receipt } = await factory.createPair(...TEST_ADDRESSES)
    expect(receipt.gasUsed).to.eq(2512920)
  })
  */

  it('setFeeTo', async () => {
    const { factory, wallet } = this;
    await expect(factory.setFeeTo(wallet.address)).to.be.revertedWith('UniswapV2: FORBIDDEN')
    await factory.setFeeTo(wallet.address, { from:minter });
    expect(await factory.feeTo()).to.eq(wallet.address)
  })

  it('setFeeToSetter', async () => {
    const { factory, wallet } = this;
    await expect(factory.setFeeToSetter(bob)).to.be.revertedWith('UniswapV2: FORBIDDEN')
    await factory.setFeeToSetter(bob, { from:minter })
    expect(await factory.feeToSetter()).to.eq(bob)
    await expect(factory.setFeeToSetter(wallet.address, { from:minter })).to.be.revertedWith('UniswapV2: FORBIDDEN')
  })

  it('setReportingTo', async () => {
    const { factory, wallet } = this;
    await expect(factory.setReportingTo(wallet.address)).to.be.revertedWith('UniswapV2: FORBIDDEN')
    await factory.setReportingTo(wallet.address, { from:minter });
    expect(await factory.reportingTo()).to.eq(wallet.address)
  })

  it('setMintingFeeTo', async () => {
    const { factory, wallet } = this;
    await expect(factory.setMintingFeeTo(wallet.address)).to.be.revertedWith('UniswapV2: FORBIDDEN')
    await factory.setMintingFeeTo(wallet.address, { from:minter });
    expect(await factory.mintingFeeTo()).to.eq(wallet.address)
  })

  it('setFeeSuspendedSetter', async () => {
    const { factory, wallet } = this;
    await expect(factory.setFeeSuspendedSetter(carol)).to.be.revertedWith('UniswapV2: FORBIDDEN')
    await factory.setFeeSuspendedSetter(carol, { from:minter });
    expect(await factory.feeSuspendedSetter()).to.eq(carol)

    await factory.setFeeSuspendedSetter(bob, { from:minter });
    expect(await factory.feeSuspendedSetter()).to.eq(bob);

    await expect(factory.setFeeSuspendedSetter(wallet.address, { from:carol })).to.be.revertedWith('UniswapV2: FORBIDDEN')
    await factory.setFeeSuspendedSetter(wallet.address, { from:bob });
    expect(await factory.feeSuspendedSetter()).to.eq(wallet.address)
  })

  it('setMigrator', async () => {
    const { factory, wallet } = this;
    await expect(factory.setMigrator(wallet.address)).to.be.revertedWith('UniswapV2: FORBIDDEN')
    await factory.setMigrator(wallet.address, { from:minter });
    expect(await factory.migrator()).to.eq(wallet.address)
  })
});
