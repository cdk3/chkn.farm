const MockRouterEventEmitter = artifacts.require('MockRouterEventEmitter');
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

contract('UniswapV2Router03 (UniswapV2Router01 interface)', ([alice, bob, carol, minter, scrooge]) => {
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

  it('addLiquidity', async () => {
    const { token0, token1, router, pair, wallet } = this;
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

    expect(bn(await pair.balanceOf(wallet.address))).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
  })

  it('addLiquidityETH', async () => {
    const { WETHPair, WETHPartner, router, wallet } = this;
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

    expect(bn(await WETHPair.balanceOf(wallet.address))).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
  })

  const addLiquidity = async (token0Amount, token1Amount) => {
    const { token0, token1, pair, wallet } = this;
    await token0.transfer(pair.address, token0Amount)
    await token1.transfer(pair.address, token1Amount)
    await pair.mint(alice)
  }
  it('removeLiquidity', async () => {
    const { pair, router, token0, token1, wallet } = this;
    const token0Amount = expandTo18Decimals(1)
    const token1Amount = expandTo18Decimals(4)
    await addLiquidity(token0Amount, token1Amount)
    await token0.transfer(wallet.address, await token0.balanceOf(alice), { from:alice });
    await token1.transfer(wallet.address, await token1.balanceOf(alice), { from:alice });


    const expectedLiquidity = expandTo18Decimals(2)
    await pair.approve(router.address, MaxUint256)
    const { tx } = await router.removeLiquidity(
        token0.address,
        token1.address,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        0,
        0,
        wallet.address,
        MaxUint256
      );
    await expectEvent.inTransaction(tx, pair, 'Transfer', { from:alice, to:pair.address, value:expectedLiquidity.sub(MINIMUM_LIQUIDITY) });
    await expectEvent.inTransaction(tx, pair, 'Transfer', { from:pair.address, to:AddressZero, value:expectedLiquidity.sub(MINIMUM_LIQUIDITY) });
    await expectEvent.inTransaction(tx, token0, 'Transfer', { from:pair.address, to:wallet.address, value:token0Amount.sub(500) });
    await expectEvent.inTransaction(tx, token1, 'Transfer', { from:pair.address, to:wallet.address, value:token1Amount.sub(2000) });
    await expectEvent.inTransaction(tx, pair, 'Sync', { reserve0:bn(500), reserve1:bn(2000) });
    await expectEvent.inTransaction(tx, pair, 'Burn', { sender:router.address, amount0:token0Amount.sub(500), amount1:token1Amount.sub(2000), to:wallet.address });

    expect(bn(await pair.balanceOf(wallet.address))).to.eq(bn(0))
    const totalSupplyToken0 = bn(await token0.totalSupply());
    const totalSupplyToken1 = bn(await token1.totalSupply());
    expect(bn(await token0.balanceOf(wallet.address))).to.eq(totalSupplyToken0.sub(500))
    expect(bn(await token1.balanceOf(wallet.address))).to.eq(totalSupplyToken1.sub(2000))
  })

  it('removeLiquidityETH', async () => {
    const { WETHPartner, WETH, WETHPair, router, wallet } = this;
    const WETHPartnerAmount = expandTo18Decimals(1)
    const ETHAmount = expandTo18Decimals(4)
    await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
    await WETH.deposit({ value: ETHAmount })
    await WETH.transfer(WETHPair.address, ETHAmount)
    await WETHPair.mint(alice)

    await WETH.transfer(wallet.address, await WETH.balanceOf(alice), { from:alice });
    await WETHPartner.transfer(wallet.address, await WETHPartner.balanceOf(alice), { from:alice });

    const expectedLiquidity = expandTo18Decimals(2)
    const WETHPairToken0 = await WETHPair.token0()
    await WETHPair.approve(router.address, MaxUint256)
    const { tx } = await router.removeLiquidityETH(
        WETHPartner.address,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        0,
        0,
        wallet.address,
        MaxUint256
      );
    await expectEvent.inTransaction(tx, WETHPair, 'Transfer', { from:alice, to:WETHPair.address, value:expectedLiquidity.sub(MINIMUM_LIQUIDITY) });
    await expectEvent.inTransaction(tx, WETHPair, 'Transfer', { from:WETHPair.address, to:AddressZero, value:expectedLiquidity.sub(MINIMUM_LIQUIDITY) });
    await expectEvent.inTransaction(tx, WETH, 'Transfer', { src:WETHPair.address, dst:router.address, wad:ETHAmount.sub(2000) });
    await expectEvent.inTransaction(tx, WETHPartner, 'Transfer', { from:WETHPair.address, to:router.address, value:WETHPartnerAmount.sub(500) });
    await expectEvent.inTransaction(tx, WETHPartner, 'Transfer', { from:router.address, to:wallet.address, value:WETHPartnerAmount.sub(500) });
    await expectEvent.inTransaction(tx, WETHPair, 'Sync', { reserve0:bn(WETHPairToken0 === WETHPartner.address ? 500 : 2000), reserve1:bn(WETHPairToken0 === WETHPartner.address ? 2000 : 500) });
    await expectEvent.inTransaction(tx, WETHPair, 'Burn', { sender:router.address, amount0:WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount.sub(500) : ETHAmount.sub(2000), amount1:WETHPairToken0 === WETHPartner.address ? ETHAmount.sub(2000) : WETHPartnerAmount.sub(500), to:router.address });

    expect(bn(await WETHPair.balanceOf(wallet.address))).to.eq(bn(0))
    const totalSupplyWETHPartner = bn(await WETHPartner.totalSupply())
    const totalSupplyWETH = bn(await WETH.totalSupply())
    expect(bn(await WETHPartner.balanceOf(wallet.address))).to.eq(totalSupplyWETHPartner.sub(500))
    expect(bn(await WETH.balanceOf(wallet.address))).to.eq(totalSupplyWETH.sub(2000))
  })

  // TODO: restore permit testing when we fix signatures
  /*
  it('removeLiquidityWithPermit', async () => {
    const { pair, router, token0, token1, wallet } = this;
    const token0Amount = expandTo18Decimals(1)
    const token1Amount = expandTo18Decimals(4)
    await addLiquidity(token0Amount, token1Amount)

    const expectedLiquidity = expandTo18Decimals(2)

    const nonce = await pair.nonces(wallet.address)
    const digest = await getApprovalDigest(
      pair,
      { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
      nonce,
      MaxUint256
    )

    const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

    await router.removeLiquidityWithPermit(
      token0.address,
      token1.address,
      expectedLiquidity.sub(MINIMUM_LIQUIDITY),
      0,
      0,
      wallet.address,
      MaxUint256,
      false,
      v,
      r,
      s
    )
  })

  it('removeLiquidityETHWithPermit', async () => {
    const { WETHPartner, WETH, WETHPair, wallet, router } = this;
    const WETHPartnerAmount = expandTo18Decimals(1)
    const ETHAmount = expandTo18Decimals(4)
    await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
    await WETH.deposit({ value: ETHAmount })
    await WETH.transfer(WETHPair.address, ETHAmount)
    await WETHPair.mint(wallet.address)

    const expectedLiquidity = expandTo18Decimals(2)

    const nonce = await WETHPair.nonces(wallet.address)
    const digest = await getApprovalDigest(
      WETHPair,
      { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
      nonce,
      MaxUint256
    )

    const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

    await router.removeLiquidityETHWithPermit(
      WETHPartner.address,
      expectedLiquidity.sub(MINIMUM_LIQUIDITY),
      0,
      0,
      wallet.address,
      MaxUint256,
      false,
      v,
      r,
      s
    )
  })
  */

  context('swapExactTokensForTokens', () => {
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    const swapAmount = expandTo18Decimals(1)
    const expectedOutputAmount = bn('1662497915624478906')

    beforeEach(async () => {
      const { router, token0 } = this;
      await addLiquidity(token0Amount, token1Amount)
      await token0.approve(router.address, MaxUint256)
    })

    it('happy path', async () => {
      const { router, token0, token1, pair, wallet } = this;
      const { tx } = await router.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, token1.address],
        wallet.address,
        MaxUint256
      );
      await expectEvent.inTransaction(tx, token0, 'Transfer', { from:alice, to:pair.address, value:swapAmount });
      await expectEvent.inTransaction(tx, token1, 'Transfer', { from:pair.address, to:wallet.address, value:expectedOutputAmount });
      await expectEvent.inTransaction(tx, pair, 'Sync', { reserve0:token0Amount.add(swapAmount), reserve1:token1Amount.sub(expectedOutputAmount) });
      await expectEvent.inTransaction(tx, pair, 'Swap', {
        sender:router.address,
        amount0In:swapAmount,
        amount1In:bn(0),
        amount0Out:bn(0),
        amount1Out:expectedOutputAmount,
        to:wallet.address
      });
    })

    it('amounts', async () => {
      const { router, token0, token1, pair, wallet, routerEventEmitter } = this;
      await token0.approve(routerEventEmitter.address, MaxUint256)
      const { tx } = await routerEventEmitter.swapExactTokensForTokens(
          router.address,
          swapAmount,
          0,
          [token0.address, token1.address],
          wallet.address,
          MaxUint256
        )
      ;
      await expectEvent.inTransaction(tx, routerEventEmitter, 'Amounts', { amounts:s([swapAmount, expectedOutputAmount]) });
    })

    /* TODO: restore gas usage test
    it('gas', async () => {
      const { router, token0, token1, pair, wallet } = this;
      // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
      await time.advanceBlock();
      await pair.sync()

      await token0.approve(router.address, MaxUint256)
      await time.advanceBlock();
      const { receipt } = await router.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, token1.address],
        wallet.address,
        MaxUint256
      );

      expect(receipt.gasUsed).to.eq(101898)
    }).retries(3)
    */
  })

  context('swapTokensForExactTokens', () => {
    const token0Amount = expandTo18Decimals(5)
    const token1Amount = expandTo18Decimals(10)
    const expectedSwapAmount = bn('557227237267357629')
    const outputAmount = expandTo18Decimals(1)

    beforeEach(async () => {
      await addLiquidity(token0Amount, token1Amount)
    })

    it('happy path', async () => {
      const { router, token0, token1, pair, wallet } = this;
      await token0.approve(router.address, MaxUint256)
      const { tx } = await router.swapTokensForExactTokens(
        outputAmount,
        MaxUint256,
        [token0.address, token1.address],
        wallet.address,
        MaxUint256
      );
      await expectEvent.inTransaction(tx, token0, 'Transfer', { from:alice, to:pair.address, value:expectedSwapAmount });
      await expectEvent.inTransaction(tx, token1, 'Transfer', { from:pair.address, to:wallet.address, value:outputAmount });
      await expectEvent.inTransaction(tx, pair, 'Sync', { reserve0:token0Amount.add(expectedSwapAmount), reserve1:token1Amount.sub(outputAmount) });
      await expectEvent.inTransaction(tx, pair, 'Swap', {
        sender:router.address,
        amount0In:expectedSwapAmount,
        amount1In:bn(0),
        amount0Out:bn(0),
        amount1Out:outputAmount,
        to:wallet.address
      });
    })

    it('amounts', async () => {
      const { router, token0, token1, pair, wallet, routerEventEmitter } = this;
      await token0.approve(routerEventEmitter.address, MaxUint256)
      const { tx } = await routerEventEmitter.swapTokensForExactTokens(
        router.address,
        outputAmount,
        MaxUint256,
        [token0.address, token1.address],
        wallet.address,
        MaxUint256
      );
      await expectEvent.inTransaction(tx, routerEventEmitter, 'Amounts', { amounts:s([expectedSwapAmount, outputAmount]) });
    })

    context('swapExactETHForTokens', () => {
      const WETHPartnerAmount = expandTo18Decimals(10)
      const ETHAmount = expandTo18Decimals(5)
      const swapAmount = expandTo18Decimals(1)
      const expectedOutputAmount = bn('1662497915624478906')

      beforeEach(async () => {
        const { router, WETH, WETHPartner, WETHPair, wallet, token0 } = this;
        await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
        await WETH.deposit({ value: ETHAmount })
        await WETH.transfer(WETHPair.address, ETHAmount)
        await WETHPair.mint(wallet.address)

        await token0.approve(router.address, MaxUint256)
      })

      it('happy path', async () => {
        const { router, WETH, WETHPartner, WETHPair, wallet } = this;
        const WETHPairToken0 = await WETHPair.token0()
        const { tx } = await router.swapExactETHForTokens(0, [WETH.address, WETHPartner.address], wallet.address, MaxUint256, {
            value: swapAmount
        });
        await expectEvent.inTransaction(tx, WETH, 'Transfer', { src:router.address, dst:WETHPair.address, wad:swapAmount });
        await expectEvent.inTransaction(tx, WETHPartner, 'Transfer', { from:WETHPair.address, to:wallet.address, value:expectedOutputAmount });
        await expectEvent.inTransaction(tx, WETHPair, 'Sync', { reserve0:WETHPairToken0 === WETHPartner.address
              ? WETHPartnerAmount.sub(expectedOutputAmount)
              : ETHAmount.add(swapAmount), reserve1:WETHPairToken0 === WETHPartner.address
              ? ETHAmount.add(swapAmount)
              : WETHPartnerAmount.sub(expectedOutputAmount)
           });
        await expectEvent.inTransaction(tx, WETHPair, 'Swap', {
          sender:router.address,
          amount0In:bn(WETHPairToken0 === WETHPartner.address ? 0 : swapAmount),
          amount1In:bn(WETHPairToken0 === WETHPartner.address ? swapAmount : 0),
          amount0Out:bn(WETHPairToken0 === WETHPartner.address ? expectedOutputAmount : 0),
          amount1Out:bn(WETHPairToken0 === WETHPartner.address ? 0 : expectedOutputAmount),
          to:wallet.address
        });
      })

      it('amounts', async () => {
        const { router, WETH, WETHPartner, WETHPair, wallet, routerEventEmitter } = this;
        const { tx } = await routerEventEmitter.swapExactETHForTokens(
          router.address,
          0,
          [WETH.address, WETHPartner.address],
          wallet.address,
          MaxUint256,
          {
            value: swapAmount
          }
        );
        await expectEvent.inTransaction(tx, routerEventEmitter, 'Amounts', { amounts:s([swapAmount, expectedOutputAmount]) });
      })

      /* TODO: restore gas usage test
      it('gas', async () => {
        const { router, WETH, WETHPartner, WETHPair, wallet, pair } = this;
        const WETHPartnerAmount = expandTo18Decimals(10)
        const ETHAmount = expandTo18Decimals(5)
        await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
        await WETH.deposit({ value: ETHAmount })
        await WETH.transfer(WETHPair.address, ETHAmount)
        await WETHPair.mint(wallet.address)

        // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
        await time.advanceBlock();
        await pair.sync()

        const swapAmount = expandTo18Decimals(1)
        await time.advanceBlock();
        const { receipt } = await router.swapExactETHForTokens(
          0,
          [WETH.address, WETHPartner.address],
          wallet.address,
          MaxUint256,
          {
            value: swapAmount
          }
        )
        expect(receipt.gasUsed).to.eq(138770);
      }).retries(3)
      */
    })

    context('swapTokensForExactETH', () => {
      const WETHPartnerAmount = expandTo18Decimals(5)
      const ETHAmount = expandTo18Decimals(10)
      const expectedSwapAmount = bn('557227237267357629')
      const outputAmount = expandTo18Decimals(1)

      beforeEach(async () => {
        const { router, WETH, WETHPartner, WETHPair, wallet } = this;
        await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
        await WETH.deposit({ value: ETHAmount })
        await WETH.transfer(WETHPair.address, ETHAmount)
        await WETHPair.mint(wallet.address)
      })

      it('happy path', async () => {
        const { router, WETH, WETHPartner, WETHPair, wallet } = this;
        await WETHPartner.approve(router.address, MaxUint256)
        const WETHPairToken0 = await WETHPair.token0()
        const { tx } = await router.swapTokensForExactETH(
            outputAmount,
            MaxUint256,
            [WETHPartner.address, WETH.address],
            wallet.address,
            MaxUint256
          )
        ;
        await expectEvent.inTransaction(tx, WETHPartner, 'Transfer', { from:alice, to:WETHPair.address, value:expectedSwapAmount });
        await expectEvent.inTransaction(tx, WETH, 'Transfer', { src:WETHPair.address, dst:router.address, wad:outputAmount });
        await expectEvent.inTransaction(tx, WETHPair, 'Sync', {
          reserve0:WETHPairToken0 === WETHPartner.address
              ? WETHPartnerAmount.add(expectedSwapAmount)
              : ETHAmount.sub(outputAmount),
          reserve1:WETHPairToken0 === WETHPartner.address
            ? ETHAmount.sub(outputAmount)
            : WETHPartnerAmount.add(expectedSwapAmount)
         });
        await expectEvent.inTransaction(tx, WETHPair, 'Swap', {
          sender:router.address,
          amount0In:bn(WETHPairToken0 === WETHPartner.address ? expectedSwapAmount : 0),
          amount1In:bn(WETHPairToken0 === WETHPartner.address ? 0 : expectedSwapAmount),
          amount0Out:bn(WETHPairToken0 === WETHPartner.address ? 0 : outputAmount),
          amount1Out:bn(WETHPairToken0 === WETHPartner.address ? outputAmount : 0),
          to:router.address
        });
      })

      it('amounts', async () => {
        const { router, WETH, WETHPartner, WETHPair, wallet, routerEventEmitter } = this;
        await WETHPartner.approve(routerEventEmitter.address, MaxUint256)
        const { tx } = await routerEventEmitter.swapTokensForExactETH(
            router.address,
            outputAmount,
            MaxUint256,
            [WETHPartner.address, WETH.address],
            wallet.address,
            MaxUint256
          )
        ;
        await expectEvent.inTransaction(tx, routerEventEmitter, 'Amounts', { amounts:s([expectedSwapAmount, outputAmount]) });
      })
    })

    context('swapExactTokensForETH', () => {
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
        const { router, WETH, WETHPartner, WETHPair, wallet } = this;
        await WETHPartner.approve(router.address, MaxUint256)
        const WETHPairToken0 = await WETHPair.token0()
        const { tx } = await router.swapExactTokensForETH(
            swapAmount,
            0,
            [WETHPartner.address, WETH.address],
            wallet.address,
            MaxUint256
          )
        ;
        await expectEvent.inTransaction(tx, WETHPartner, 'Transfer', { from:alice, to:WETHPair.address, value:swapAmount });
        await expectEvent.inTransaction(tx, WETH, 'Transfer', { src:WETHPair.address, dst:router.address, wad:expectedOutputAmount });
        await expectEvent.inTransaction(tx, WETHPair, 'Sync', {
          reserve0:WETHPairToken0 === WETHPartner.address
            ? WETHPartnerAmount.add(swapAmount)
            : ETHAmount.sub(expectedOutputAmount),
          reserve1:WETHPairToken0 === WETHPartner.address
            ? ETHAmount.sub(expectedOutputAmount)
            : WETHPartnerAmount.add(swapAmount)
         });
        await expectEvent.inTransaction(tx, WETHPair, 'Swap', {
          sender:router.address,
          amount0In:bn(WETHPairToken0 === WETHPartner.address ? swapAmount : 0),
          amount1In:bn(WETHPairToken0 === WETHPartner.address ? 0 : swapAmount),
          amount0Out:bn(WETHPairToken0 === WETHPartner.address ? 0 : expectedOutputAmount),
          amount1Out:bn(WETHPairToken0 === WETHPartner.address ? expectedOutputAmount : 0),
          to:router.address
        });
      })

      it('amounts', async () => {
        const { router, WETH, WETHPartner, WETHPair, wallet, routerEventEmitter } = this;
        await WETHPartner.approve(routerEventEmitter.address, MaxUint256)
        const { tx } = await routerEventEmitter.swapExactTokensForETH(
            router.address,
            swapAmount,
            0,
            [WETHPartner.address, WETH.address],
            wallet.address,
            MaxUint256
          )
        ;
        await expectEvent.inTransaction(tx, routerEventEmitter, 'Amounts', { amounts:s([swapAmount, expectedOutputAmount]) });
      })
    })

    context('swapETHForExactTokens', () => {
      const WETHPartnerAmount = expandTo18Decimals(10)
      const ETHAmount = expandTo18Decimals(5)
      const expectedSwapAmount = bn('557227237267357629')
      const outputAmount = expandTo18Decimals(1)

      beforeEach(async () => {
        const { router, WETH, WETHPartner, WETHPair, wallet } = this;
        await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
        await WETH.deposit({ value: ETHAmount, from:scrooge });
        await WETH.transfer(WETHPair.address, ETHAmount, { from:scrooge });
        await WETHPair.mint(wallet.address)
      })

      it('happy path', async () => {
        const { router, WETH, WETHPartner, WETHPair, wallet } = this;
        const WETHPairToken0 = await WETHPair.token0()
        const { tx } = await router.swapETHForExactTokens(
          outputAmount,
          [WETH.address, WETHPartner.address],
          wallet.address,
          MaxUint256,
          {
            value: expectedSwapAmount
          }
        );

        await expectEvent.inTransaction(tx, WETH, 'Transfer', { src:router.address, dst:WETHPair.address, wad:expectedSwapAmount });
        await expectEvent.inTransaction(tx, WETHPartner, 'Transfer', { from:WETHPair.address, to:wallet.address, value:outputAmount });
        await expectEvent.inTransaction(tx, WETHPair, 'Sync', {
        reserve0:WETHPairToken0 === WETHPartner.address
            ? WETHPartnerAmount.sub(outputAmount)
            : ETHAmount.add(expectedSwapAmount),
        reserve1:WETHPairToken0 === WETHPartner.address
            ? ETHAmount.add(expectedSwapAmount)
            : WETHPartnerAmount.sub(outputAmount)
         });
        await expectEvent.inTransaction(tx, WETHPair, 'Swap', {
          sender:router.address,
          amount0In:bn(WETHPairToken0 === WETHPartner.address ? 0 : expectedSwapAmount),
          amount1In:bn(WETHPairToken0 === WETHPartner.address ? expectedSwapAmount : 0),
          amount0Out:bn(WETHPairToken0 === WETHPartner.address ? outputAmount : 0),
          amount1Out:bn(WETHPairToken0 === WETHPartner.address ? 0 : outputAmount),
          to:wallet.address
        });
      })

      it('amounts', async () => {
        const { router, WETH, WETHPartner, WETHPair, wallet, routerEventEmitter } = this;
        const { tx } = await routerEventEmitter.swapETHForExactTokens(
          router.address,
          outputAmount,
          [WETH.address, WETHPartner.address],
          wallet.address,
          MaxUint256,
          {
            value: expectedSwapAmount
          }
        );

        await expectEvent.inTransaction(tx, routerEventEmitter, 'Amounts', { amounts:s([expectedSwapAmount, outputAmount]) });
      })
    })
  })
});
