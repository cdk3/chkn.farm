const ChickenTokenFinal = artifacts.require("ChickenTokenFinal");
const FryCookFinal = artifacts.require("FryCookFinal");
const UniswapV2Factory = artifacts.require("UniswapV2Factory");

const values = require('./shared/values');

// Populates the FryCookFinal with an initial collection of pools.
// ASSUMPTION: the FryCookFinal's startBlock has not been reached; otherwise,
// the fact that we don't force a full pool update at each addition is a bug.
// Written to be "resumable" if it fails an initial time, checking for the
// previous insertion of an lpToken to decide whether to run the `add` operation
// or skip it. Note: this is NOT intended to be rerun if the initial set of pools
// is expanded with more later; pools added later should appear in a different
// migration file. This is because: restarting / resuming might potentially
// alter the intended order of pools and thus their `pid`s, and because we deliberately
// wait until the end to update pools, a dangerous choice if the FryCookFinal has already started.
module.exports = function (deployer, network) {
  const { tokens, pools } = values({ network, web3 });

  deployer.then(async () => {
    const cook = await FryCookFinal.deployed();
    const factory = await UniswapV2Factory.deployed();

    // get CHKN token address
    if (!tokens['CHKN']) tokens['CHKN'] = (await ChickenTokenFinal.deployed()).address;

    // add pools
    const tokenPoolData = [];
    for (const pool of pools) {
      const { tokenA, tokenB } = pool;
      console.log(`considering pool ${tokenA} -- ${tokenB}`);
      const [token0Name, token1Name] = tokens[tokenA] < tokens[tokenB] ? [tokenA, tokenB] : [tokenB, tokenA];
      const [token0, token1] = [tokens[token0Name], tokens[token1Name]];
      let lpToken = await factory.getPair(token0, token1);
      if  (lpToken == tokens.zero) {  // create the pair
        await factory.createPair(token0, token1);
        lpToken = await factory.getPair(token0, token1);
      }
      let pid = parseInt((await cook.tokenPid(lpToken)).valueOf(), 16);
      if (!(await cook.hasToken(lpToken))) {
        pid = await cook.poolLength();
        await cook.add(pool.alloc, lpToken, pool.min, pool.bonus, pool.grace, pool.halving, false);
      }

      let tokenAddresses, symbol, tokenSymbol;
      if (token0Name === 'WETH') {
        tokenAddresses = { 1: token1 };
        symbol = `${token1Name}-ETH UNI-V2 CLP`;
        tokenSymbol = token1Name;
      } else if (token1Name === 'WETH') {
        tokenAddresses = { 1: token0 };
        symbol = `${token0Name}-ETH UNI-V2 CLP`;
        tokenSymbol = token0Name;
      } else {
        tokenAddresses = {
          1: token0,
          2: token1
        };
        symbol = `${tokenA}-${tokenB} UNI-V2 CLP`;
        tokenSymbol = `${tokenA}-${tokenB}`;
      }

      tokenPoolData.push({
        pid,
        lpAddresses: { 1: lpToken },
        tokenAddresses,
        symbol,
        tokenSymbol
      });
    }
    // mass update
    await cook.massUpdatePools();

    if (tokenPoolData.length > 0) {
      console.log(`${JSON.stringify(tokenPoolData, null, 2)}`);
    }
  });
};
