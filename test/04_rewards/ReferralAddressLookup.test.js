const ReferralAddressLookup = artifacts.require('ReferralAddressLookup');
const MockAddressLookupFlooder = artifacts.require('MockAddressLookupFlooder');

const { bn } = require('../shared/utilities');

const ZERO = bn(0);
const ITERS = 64;

contract('ReferralAddressLookup', ([alice, bob, carol, dave, attacker]) => {
    it('should generate nonzero referral keys', async () => {
      const lookup = await ReferralAddressLookup.new(1);
      for (let i = 0; i < ITERS; i++) {
        await lookup.generateKey(alice, '0x12345678');
        const key = await lookup.getKey(alice);
        assert.ok(!bn(key).eq(ZERO), 'key must not equal zero');
      }
    });

    it('should generate non-colliding referral keys', async () => {
      const lookup = await ReferralAddressLookup.new(1);
      const keys = [];
      for (let i = 0; i < ITERS; i++) {
        await lookup.generateKey(alice, '0x12345678');
        const key = await lookup.getKey(alice);
        assert.ok(!(keys.includes(key)), 'key must be unique')
        keys.push(key);
      }
    });

    it('should increase key length to avoid collisions', async () => {
      const lookup = await ReferralAddressLookup.new(1);
      const flooder = await MockAddressLookupFlooder.new();
      assert.equal(await lookup.keyLength(), '1');
      await flooder.generateKeys(lookup.address, 64, alice, '0x12345678');
      const keyLength = bn((await lookup.keyLength()).toString())
      assert.ok(keyLength.gte('7'), 'expected keyLength to increase to at least 7');
    });

    context('with keyLength 16 (~4 chars)', async() => {
      beforeEach(async () => {
        this.lookup = await ReferralAddressLookup.new(16);
        this.flooder = await MockAddressLookupFlooder.new();
      });

      it('should not increase key length "too fast" (stochastic)', async () => {
        const { lookup, flooder } = this;
        for (let i = 0; i < 16; i++) {
          await flooder.generateKeys(lookup.address, 128, alice, '0x12345678');
        }
        const keyLength = bn((await lookup.keyLength()).toString())
        assert.ok(keyLength.eq('16'), 'expected keyLength to remain at 16');
      }).retries(3);

      it('should provide most recently generated key for address', async () => {
        const { lookup, flooder } = this;
        const lastKey = {};
        for (const addr of [alice, bob, carol, dave]) {
          await flooder.generateKeys(lookup.address, 64, addr, '0x12345678');
          lastKey[addr] = await lookup.getKey(addr);
        }

        for (const addr of [alice, bob, carol, dave]) {
          assert.equal(await lookup.getKey(addr), lastKey[addr]);
        }
      });

      it('should recognize all keys generated for address', async () => {
        const { lookup } = this;
        const keys = {};
        for (const addr of [alice, bob, carol, dave]) {
          const arr = keys[addr] = [];
          for (let i = 0; i < ITERS; i++) {
            await lookup.generateKey(addr, '0x12345678');
            await arr.push(await lookup.getKey(addr));
          }
        }

        for (const addr of [alice, bob, carol, dave]) {
          const arr = keys[addr];
          for (const key of arr) {
            assert.equal(await lookup.lookup(key), addr);
          }
        }
      });

      it('should generate keys right-padded with zeros', async () => {
        const { lookup } = this;
        const keys = {};
        for (const addr of [alice, bob, carol, dave]) {
          const arr = keys[addr] = [];
          for (let i = 0; i < ITERS; i++) {
            await lookup.generateKey(addr, '0x12345678');
            await arr.push(await lookup.getKey(addr));
          }
        }

        for (const addr of [alice, bob, carol, dave]) {
          const arr = keys[addr];
          for (const key of arr) {
            // expect `0x{4-6 chars}000...` but that is stochastic; could grow each time hypothetically
            const keyPad = key.slice(0, 8).padEnd(66, '0');
            assert.equal(key, keyPad);
          }
        }
      }).retries(3);

      it('should recognize all keys generated for address, when zeros are truncated', async () => {
        const { lookup } = this;
        const keys = {};
        for (const addr of [alice, bob, carol, dave]) {
          const arr = keys[addr] = [];
          for (let i = 0; i < ITERS; i++) {
            await lookup.generateKey(addr, '0x12345678');
            await arr.push(await lookup.getKey(addr));
          }
        }

        for (const addr of [alice, bob, carol, dave]) {
          const arr = keys[addr];
          for (const key of arr) {
            // expect `0x{4-6 chars}000...` but that is stochastic; could grow each time hypothetically
            const keyTrunc = key.slice(0, 8);
            assert.equal(await lookup.lookup(keyTrunc), addr);
          }
        }
      }).retries(3);
    });
});
