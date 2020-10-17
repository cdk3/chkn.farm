const { expectRevert, time } = require('@openzeppelin/test-helpers');
const ethers = require('ethers');
const MockOwnable = artifacts.require('MockOwnable');
const Timelock = artifacts.require('Timelock');
const MockERC20 = artifacts.require('MockERC20');
const ChickenTokenFinal = artifacts.require('ChickenTokenFinal');
const FryCookFinal = artifacts.require('FryCookFinal');

function encodeParameters(types, values) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}

contract('Timelock', ([alice, bob, carol, dev, minter]) => {

    const MINTER_ROLE = web3.utils.soliditySha3('MINTER_ROLE');
    const EXECUTIVE_ROLE = web3.utils.soliditySha3('EXECUTIVE_ROLE');
    const HEAD_CHEF_ROLE = web3.utils.soliditySha3('HEAD_CHEF_ROLE');

    beforeEach(async () => {
        this.ownable = await MockOwnable.new({ from: alice });
        this.timelock = await Timelock.new(bob, '259200', { from: alice });
    });

    it('should not allow non-owner to do operation', async () => {
        await this.ownable.transferOwnership(this.timelock.address, { from: alice });
        await expectRevert(
            this.ownable.transferOwnership(carol, { from: alice }),
            'Ownable: caller is not the owner',
        );
        await expectRevert(
            this.ownable.transferOwnership(carol, { from: bob }),
            'Ownable: caller is not the owner',
        );
        await expectRevert(
            this.timelock.queueTransaction(
                this.ownable.address, '0', 'tick()',
                encodeParameters([], []),
                (await time.latest()).add(time.duration.days(4)),
                { from: alice },
            ),
            'Timelock::queueTransaction: Call must come from admin.',
        );
    });

    it('should do the timelock thing', async () => {
        await this.ownable.transferOwnership(this.timelock.address, { from: alice });
        const eta = (await time.latest()).add(time.duration.days(4));
        await this.timelock.queueTransaction(
            this.ownable.address, '0', 'transferOwnership(address)',
            encodeParameters(['address'], [carol]), eta, { from: bob },
        );
        await time.increase(time.duration.days(1));
        await expectRevert(
            this.timelock.executeTransaction(
                this.ownable.address, '0', 'transferOwnership(address)',
                encodeParameters(['address'], [carol]), eta, { from: bob },
            ),
            "Timelock::executeTransaction: Transaction hasn't surpassed time lock.",
        );
        await time.increase(time.duration.days(4));
        await this.timelock.executeTransaction(
            this.ownable.address, '0', 'transferOwnership(address)',
            encodeParameters(['address'], [carol]), eta, { from: bob },
        );
        assert.equal((await this.ownable.owner()).valueOf(), carol);
    });

    it('should also work with FryCookFinal', async () => {
        this.chicken = await ChickenTokenFinal.new({ from: alice });
        this.lp1 = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
        this.lp2 = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
        this.cook = await FryCookFinal.new(this.chicken.address, dev, '1000', '0', '1000', '1000', { from: alice });
        await this.chicken.grantRole(MINTER_ROLE, this.cook.address, { from: alice });
        await this.cook.add('100', this.lp1.address, '0', '1', '100000', '1', true);
        await this.cook.grantRole(EXECUTIVE_ROLE, this.timelock.address, { from: alice });
        await this.cook.grantRole(HEAD_CHEF_ROLE, this.timelock.address, { from: alice });
        await this.cook.renounceRole(EXECUTIVE_ROLE, alice, { from: alice });
        await this.cook.renounceRole(HEAD_CHEF_ROLE, alice, { from: alice });
        const eta = (await time.latest()).add(time.duration.days(4));
        await this.timelock.queueTransaction(
            this.cook.address, '0', 'set(uint256,uint256,bool)',
            encodeParameters(['uint256', 'uint256', 'bool'], ['0', '200', false]), eta, { from: bob },
        );
        await this.timelock.queueTransaction(
            this.cook.address, '0', 'add(uint256,address,uint256,uint256,uint256,uint256,bool)',
            encodeParameters(['uint256', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'bool'], ['100', this.lp2.address, 0, 1, 100000, 1, false]), eta, { from: bob },
        );
        await time.increase(time.duration.days(4));
        await this.timelock.executeTransaction(
            this.cook.address, '0', 'set(uint256,uint256,bool)',
            encodeParameters(['uint256', 'uint256', 'bool'], ['0', '200', false]), eta, { from: bob },
        );
        await this.timelock.executeTransaction(
            this.cook.address, '0', 'add(uint256,address,uint256,uint256,uint256,uint256,bool)',
            encodeParameters(['uint256', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'bool'], ['100', this.lp2.address, 0, 1, 100000, 1, false]), eta, { from: bob },
        );
        assert.equal((await this.cook.poolInfo('0')).valueOf().allocPoint, '200');
        assert.equal((await this.cook.totalAllocPoint()).valueOf(), '300');
        assert.equal((await this.cook.poolLength()).valueOf(), '2');
    });
});
