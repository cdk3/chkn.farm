const { expectRevert, time } = require('@openzeppelin/test-helpers');
const ethers = require('ethers');
const ChickenTokenFinal = artifacts.require('ChickenTokenFinal');
const FryCookFinal = artifacts.require('FryCookFinal');
const Timelock = artifacts.require('Timelock');
const GovernorAlpha = artifacts.require('GovernorAlpha');
const MockERC20 = artifacts.require('MockERC20');

function encodeParameters(types, values) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}

contract('Governor', ([alice, minter, dev]) => {

    const MINTER_ROLE = web3.utils.soliditySha3('MINTER_ROLE');
    const EXECUTIVE_ROLE = web3.utils.soliditySha3('EXECUTIVE_ROLE');
    const HEAD_CHEF_ROLE = web3.utils.soliditySha3('HEAD_CHEF_ROLE');

    /*
    it('TODO TODO TODO: restore this test!', async () => {

    });
    */

    it('should work', async () => {
        this.chicken = await ChickenTokenFinal.new({ from: alice });
        await this.chicken.delegate(dev, { from: dev });
        this.cook = await FryCookFinal.new(this.chicken.address, dev, '100', '0', '0', '1000000', { from: alice });
        await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
        this.lp = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
        this.lp2 = await MockERC20.new('LPToken2', 'LP2', '10000000000', { from: minter });
        await this.cook.add('100', this.lp.address, '0', '1', '100000', '1', true, { from: alice });
        await this.lp.approve(this.cook.address, '1000', { from: minter });
        await this.cook.deposit(0, '100', { from: minter });
        // Perform another deposit to make sure some CHKNs are minted in that 1 block.
        await this.cook.deposit(0, '100', { from: minter });
        assert.equal((await this.chicken.totalSupply()).valueOf(), '110');  // 10% dev share
        assert.equal((await this.chicken.balanceOf(minter)).valueOf(), '100');
        assert.equal((await this.chicken.balanceOf(dev)).valueOf(), '10');
        // Transfer ownership to timelock contract
        this.timelock = await Timelock.new(alice, time.duration.days(2), { from: alice });
        this.gov = await GovernorAlpha.new(this.timelock.address, this.chicken.address, alice, { from: alice });
        await this.timelock.setPendingAdmin(this.gov.address, { from: alice });
        await this.gov.__acceptAdmin({ from: alice });
        await this.cook.grantRole(EXECUTIVE_ROLE, this.timelock.address, { from: alice });
        await this.cook.grantRole(HEAD_CHEF_ROLE, this.timelock.address, { from: alice });
        await this.cook.renounceRole(EXECUTIVE_ROLE, alice, { from: alice });
        await this.cook.renounceRole(HEAD_CHEF_ROLE, alice, { from: alice });
        await expectRevert(
            this.cook.add('100', this.lp2.address, '0', '1', '100000', '1', true, { from: alice }),
            'add: not authorized',
        );
        await expectRevert(
            this.gov.propose(
                [this.cook.address], ['0'], ['add(uint256,address,uint256,uint256,uint256,uint256,bool)'],
                [encodeParameters(['uint256', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'bool'], ['100', this.lp2.address, 0, 1, 100000, 1, true])],
                'Add LP2',
                { from: alice },
            ),
            'GovernorAlpha::propose: proposer votes below proposal threshold',
        );
        await this.gov.propose(
            [this.cook.address], ['0'], ['add(uint256,address,uint256,uint256,uint256,uint256,bool)'],
            [encodeParameters(['uint256', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'bool'], ['100', this.lp2.address, 0, 1, 100000, 1, true])],
            'Add LP2',
            { from: dev },
        );
        await time.advanceBlock();
        await this.gov.castVote('1', true, { from: dev });
        await expectRevert(this.gov.queue('1'), "GovernorAlpha::queue: proposal can only be queued if it is succeeded");
        console.log("Advancing 17280 blocks. Will take a while...");
        for (let i = 0; i < 17280; ++i) {
            await time.advanceBlock();
        }
        await this.gov.queue('1');
        await expectRevert(this.gov.execute('1'), "Timelock::executeTransaction: Transaction hasn't surpassed time lock.");
        await time.increase(time.duration.days(3));
        await this.gov.execute('1');
        assert.equal((await this.cook.poolLength()).valueOf(), '2');
    });
});
