const { bigNumberify, keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack, getAddress } = require('ethers').utils;

const MINIMUM_LIQUIDITY = bigNumberify(10).pow(3)

const PERMIT_TYPEHASH = keccak256(
  toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
)

function expandToDecimals(n, d) {
  return bn(n).mul(bn(10).pow(d));
}

function expandTo18Decimals(n) {
  return bigNumberify(n).mul(bigNumberify(10).pow(18))
}

const bn = (val) => {
    if (typeof val === 'object' && val !== null && 'valueOf' in val) {
        return bn(val.valueOf().toString());
    }
    if (typeof val === 'string' && val.includes(',')) {
        vals = val.split(',');
        arr = [];
        for (const v of vals) {
          arr.push(bn(v));
        }
        return arr;
    }
    return bigNumberify(val);
}

const s = (val) => {
  if (Array.isArray(val)) {
      arr = [];
      for (const v of val) {
        arr.push(s(v));
      }
      return arr;
  } else if (typeof val === 'object' && val !== null && 'valueOf' in val) {
      return val.valueOf().toString();
  } else if (typeof val === 'object' && val !== null && 'toString' in val) {
      return val.toString();
  }
  return `${val}`;
}

function getDomainSeparator(name, tokenAddress) {
  return keccak256(
    defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        keccak256(toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
        keccak256(toUtf8Bytes(name)),
        keccak256(toUtf8Bytes('1')),
        1,
        tokenAddress
      ]
    )
  )
}

async function getApprovalDigest(
  token,
  approve,
  nonce,
  deadline
) {
  const name = await token.name()
  const DOMAIN_SEPARATOR = getDomainSeparator(name, token.address)
  console.log(`getApprovalDigest encoding permit ${PERMIT_TYPEHASH}`);
  console.log(`getApprovalDigest owner ${approve.owner}`);
  console.log(`getApprovalDigest spender ${approve.spender}`);
  console.log(`getApprovalDigest value ${approve.value}`);
  console.log(`getApprovalDigest nonce ${nonce}`);
  console.log(`getApprovalDigest deadline ${deadline}`);
  return keccak256(
    solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      [
        '0x19',
        '0x01',
        DOMAIN_SEPARATOR,
        keccak256(
          defaultAbiCoder.encode(
            ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
            [PERMIT_TYPEHASH, approve.owner, approve.spender, approve.value, nonce, deadline]
          )
        )
      ]
    )
  )
}

function encodePrice(reserve0, reserve1) {
  return [reserve1.mul(bigNumberify(2).pow(112)).div(reserve0), reserve0.mul(bigNumberify(2).pow(112)).div(reserve1)]
}

function getCreate2Address(
  factoryAddress,
  [tokenA, tokenB],
  bytecode
) {
  const [token0, token1] = bigNumberify(tokenA).lt(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
  const create2Inputs = [
    '0xff',
    factoryAddress,
    keccak256(solidityPack(['address', 'address'], [token0, token1])),
    keccak256(bytecode)
  ]
  const sanitizedInputs = `0x${create2Inputs.map(i => i.slice(2)).join('')}`
  return getAddress(`0x${keccak256(sanitizedInputs).slice(-40)}`)
}

module.exports = exports = {
  MINIMUM_LIQUIDITY,
  getAddress,
  expandToDecimals,
  expandTo18Decimals,
  getApprovalDigest,
  encodePrice,
  getCreate2Address,
  bn,
  s
};
