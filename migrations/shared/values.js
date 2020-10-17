const { bigNumberify:bn } = require('ethers').utils;
const { AddressZero } = require('ethers').constants;

const scale = 1000000000;

function expandToDecimals(n, d) {
  return bn(n).mul(bn(10).pow(d));
}

function expandTo18Decimals(n) {
  return expandToDecimals(n, 18);
}

function expandTo6Decimals(n) {
  return expandToDecimals(n, 6);
}

// babylonian method (https://en.wikipedia.org/wiki/Methods_of_computing_square_roots#Babylonian_method)
function sqrt(y) {
  y = bn(y);   // ensure BigNumber
  if (y.gt(3)) {
    let z = y;
    let x = y.div(2).add(1);
    while (x.lt(z)) {
        z = x;
        x = y.div(x).add(x).div(2);
    }
    return z;
  } else if (y != 0) {
      return 1;
  }
}

// expand to the full token e18 or e6 representation the number of
// tokens to equal one ether. This is based on the decimals of the token
// (how many wei to equal one full token unit) and the ether-per-full-unit
// (how many full ether, 1.0, to equal one full token, 1.0)
function expandTokenToOneEther(etherPer, decimals) {
  // get one token representation
  const one = expandToDecimals(1, decimals);
  return one.mul(scale).div(Math.round(scale * etherPer));
}

module.exports = exports = ({ network, web3 }) => {
  values = {};

  // standardize network name
  if (network === 'rinkeby-fork') network = 'rinkeby';
  if (network === 'mainnet-fork') network = 'mainnet';

  // token addresses
  const tokens = values['tokens'] = values['token'] = {
    mainnet: {
      AMPL: '0xd46ba6d942050d489dbd938a2c909a5d5039a161',
      COMP: '0xc00e94cb662c3520282e6f5717214004a7f26888',
      DAI: '0x6b175474e89094c44da98b954eedeac495271d0f',
      LEND: '0x80fB784B7eD66730e8b1DBd9820aFD29931aab03',
      LINK: '0x514910771af9ca656af840dff83e8264ecf986ca',
      SNX: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
      sUSD: '0x57ab1ec28d129707052df4df418d58a2d46d5f51',
      SUSHI: '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2',
      UNI: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      YFI: '0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e',
      YFII: '0xa1d0E215a23d7030842FC67cE582a6aFa3CCaB83',
      zero: AddressZero
    },
    rinkeby: {
      DAI: '0x2448eE2641d78CC42D7AD76498917359D961A783',
      USDT: '0xfb1d709cb959ac0ea14cad0927eabc7832e65058',
      WETH: '0xc778417e063141139fce010982780140aa0cd5ab',
      WEENUS: '0xaFF4481D10270F50f203E0763e2597776068CBc5',
      zero: AddressZero
    },
    test: {
      zero: AddressZero,
      USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7'
    }
  }[network];

  // chicken token holders
  const chickenFinalHolders = values['chickenHolders'] = values['chickenHolder'] = {
    mainnet: [
      { address: '0xE5B972973C68423171AC71b1D4413d3a0BfE17dc', amount:bn('945756274098112459429857')},
      { address: '0xB1005777bA7Adf7DA40d9E6864872fAA59476B03', amount:bn('571428302218494728573853')}
    ],
    rinkeby: [
      { address: '0x056Af6cE5d1E042Fe94F72e327F5bEE0409658C1', amount:expandTo18Decimals(2685000) },
      { address: '0x258E30bd203471992A6CFB51700DE337b92d3772', amount:expandTo18Decimals(2000) }
    ],
    test: []
  }[network]

  const ONE_DAY = 6512;
  const ONE_WEEK = 45590;
  const blocks = values['blocks'] = values['block'] = {
    mainnet: {
      start: bn('10971740')   // approx. 11 AM PDT October 1st.
    },
    rinkeby: {
      start: bn('7260177')
    },
    test: {
      start: bn('0')
    }
  }[network]
  blocks['endBonus'] = blocks.start.add(bn(ONE_WEEK).mul(2));
  blocks['endDevBonus'] = blocks.start.add(bn(ONE_WEEK).mul(52));

  // fry cook inputs
  const finalStart = bn('10983258');    // hit 3.5 days at 9:30 EST Oct. 6th: block 11006050.0
  const fryCook = values['fryCook'] = {
    start: finalStart,
    endBonus: finalStart.add(bn(ONE_WEEK).mul(2)),
    endDevBonus: finalStart.add(bn(ONE_WEEK).mul(52)),
    chickenPerBlock: expandTo18Decimals(100)
  }
  // devaddr; if undefined, migration will fail
  fryCook['devaddr'] = {
    mainnet: '0x2e72D3318A49Be40B6E9D13214c9e04b28160157',
    rinkeby: '0x2e72D3318A49Be40B6E9D13214c9e04b28160157',
    test: AddressZero
  }[network]

  const timelock = values['timelock'] = {
    owner: '0x1fC83Eaf8aE5d92289719B8E104690F14A223B05',
    delay: '172800'     // 2 days, in seconds
  }

  // fry cook pools.
  // estimate $200 value to get "early bird" bonus; snapshot
  const POOL_ETH = 0.285;   // 0.285 ETH, approx. $100
  const POOL_WEI = expandToDecimals(285, 15);   // 0.285 ETH, approx. $100
  const POOL_GRACE = blocks.start.add(bn(ONE_DAY));
  const POOL_BONUS = 100;
  const POOL_HALVING = 48840;  // approx 1/4 month. By month 1, from 100 to 7.1. By month 2, approx 1.4.
  const tokenPool = ({tokenA, tokenB, amountAPerEther, amountBPerEther, alloc}) => {
    // values are "# of ether to equal 1"
    return {
      alloc: alloc === undefined ? bn(10) : bn(Math.round(alloc * 10)),
      tokenA,
      tokenB,
      min: sqrt((amountAPerEther.mul(scale * POOL_ETH).div(scale)).mul((amountBPerEther).mul(scale * POOL_ETH).div(scale))),
      bonus: POOL_BONUS,
      halving: POOL_HALVING,
      grace: POOL_GRACE
    }
  }
  const oneEtherOf = {
    AMPL: expandTokenToOneEther(0.002162, 9),
    CHKN: expandTokenToOneEther(0.01, 18),
    COMP: expandTokenToOneEther(0.399350, 18),
    DAI: expandTokenToOneEther(0.002858, 18),
    LEND: expandTokenToOneEther(0.001567, 18),
    LINK: expandTokenToOneEther(0.030739, 18),
    SNX: expandTokenToOneEther(0.013744, 18),
    sUSD: expandTokenToOneEther(0.002829, 6),
    SUSHI: expandTokenToOneEther(0.004043, 18),
    UNI: expandTokenToOneEther(0.014204, 18),
    USDC: expandTokenToOneEther(0.002829, 6),
    USDT: expandTokenToOneEther(0.002829, 6),
    WETH: expandTokenToOneEther(1, 18),
    YFI: expandTokenToOneEther(72.099323, 18),
    YFII: expandTokenToOneEther(8.599497, 18),

    WEENUS: expandTokenToOneEther(0.1, 18)    // token with faucet on Rinkeby
  }
  const pool = (tokenA, tokenB, alloc) => {
    return tokenPool({ tokenA, tokenB, amountAPerEther: oneEtherOf[tokenA], amountBPerEther: oneEtherOf[tokenB], alloc });
  }
  const pools = values['pools'] = values['pool'] = {
    mainnet: [
      pool('CHKN', 'WETH', 4),
      pool('CHKN', 'USDT'),
      pool('CHKN', 'UNI'),
      pool('CHKN', 'SUSHI'),
      pool('USDT', 'WETH'),
      pool('USDC', 'WETH'),
      pool('DAI', 'WETH'),
      pool('LINK', 'WETH'),
      pool('UNI', 'WETH'),
      pool('DAI', 'USDT'),
      pool('YFII', 'WETH'),
      pool('LEND', 'WETH'),
      pool('SNX', 'WETH'),
      pool('YFI', 'WETH'),
      pool('AMPL', 'WETH')
    ],
    rinkeby: [
      pool('CHKN', 'WETH', 4),
      pool('CHKN', 'USDT'),
      pool('DAI', 'WETH'),
      pool('WEENUS', 'WETH'),
      pool('CHKN', 'WEENUS')
    ],
    test: [

    ]
  }[network]

  if (web3) {
    const roles = values['roles'] = values['role'] = {
      router: web3.utils.soliditySha3('ROUTER_ROLE'),
      admin: web3.utils.soliditySha3('ADMIN_ROLE'),
      manager: web3.utils.soliditySha3('MANAGER_ROLE'),
      reporter: web3.utils.soliditySha3('REPORTER_ROLE'),
      minter: web3.utils.soliditySha3('MINTER_ROLE'),
      migrator: web3.utils.soliditySha3('MIGRATOR_ROLE'),
      executive: web3.utils.soliditySha3('EXECUTIVE_ROLE'),
      headChef: web3.utils.soliditySha3('HEAD_CHEF_ROLE'),
      sousChef: web3.utils.soliditySha3('SOUS_CHEF_ROLE'),
      waitstaff: web3.utils.soliditySha3('WAITSTAFF_ROLE'),
    }
  }

  const expandTo6DecMillion = (val) => {
    // input of 1 = 1,000,000.000000
    // expand to 6 decimals, expand to 6 zeroes.
    return expandToDecimals(val, 12);
  }

  const rewardPool = values['rewardPool'] = {
    token: tokens['USDT'],
    milestones: [
      expandTo6DecMillion(10).div(20).toString(),  // 5% of 10 million
      expandTo6DecMillion(25).div(20).toString(),  // 5% of 25 million
      expandTo6DecMillion(50).div(20).toString(),  // 5% of 50 million
      expandTo6DecMillion(100).div(20).toString(),  // 5% of 100 million
      expandTo6DecMillion(250).div(20).toString(),  // 5% of 250 million
      expandTo6DecMillion(500).div(20).toString(),  // 5% of 500 million
      expandTo6DecMillion(1000).div(20).toString(),  // 5% of 1 billion
      expandTo6DecMillion(2000).div(20).toString(),  // 5% of 2 billion
      expandTo6DecMillion(5000).div(20).toString(),  // 5% of 5 billion
      expandTo6DecMillion(10000).div(20).toString(),  // 5% of 10 billion
    ],
    step: expandTo6DecMillion(1000).div(20).toString(),  // 5% of 1 billion
    shares: {
      referral: 65,
      stake: 10
    }
  }
  rewardPool.devaddr = {  // if undefined, migration will fail
    test: AddressZero
  }[network];

  const me = values['me'] = {
    mainnet: '0x258E30bd203471992A6CFB51700DE337b92d3772',
    rinkeby: '0x258E30bd203471992A6CFB51700DE337b92d3772'
  }[network];


  return values;
}
