'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { FellowPlatform } = require('../index');

class MockCharacteristic {
  constructor() { this.props = {}; }
  setProps(props) { this.props = props; return this; }
  onGet(handler) { this.get = handler; return this; }
  onSet(handler) { this.set = handler; return this; }
}
class MockService {
  constructor() { this.characteristics = new Map(); }
  getCharacteristic(key) {
    if (!this.characteristics.has(key)) this.characteristics.set(key, new MockCharacteristic());
    return this.characteristics.get(key);
  }
  setCharacteristic(key, value) { this.updateCharacteristic(key, value); return this; }
  updateCharacteristic(key, value) { this.getCharacteristic(key).value = value; return this; }
}
class MockAccessory {
  constructor(name, uuid) {
    this.displayName = name;
    this.UUID = uuid;
    this.services = new Map([['info', new MockService()]]);
  }
  getService(key) { return this.services.get(key); }
  addService(key) { const service = new MockService(); this.services.set(key, service); return service; }
}

test('registers one switch and routes HomeKit on/off writes to kettle commands', async () => {
  const C = {
    Manufacturer: 'manufacturer', Model: 'model', On: 'on',
  };
  const events = new Map();
  const registered = [];
  const api = {
    hap: { Service: { AccessoryInformation: 'info', Switch: 'switch' }, Characteristic: C,
      uuid: { generate: value => value } },
    platformAccessory: MockAccessory,
    registerPlatformAccessories: (plugin, platform, accessories) => registered.push(...accessories),
    on: (event, handler) => events.set(event, handler),
  };
  const log = { warn() {}, error() {} };
  const platform = new FellowPlatform(log, { host: '10.0.0.22', pollInterval: 300 }, api);
  let state = { mode: 'S_Off', currentC: 25, targetC: 93.333, units: 0 };
  const calls = [];
  platform.client = {
    port: 80,
    async state() { calls.push('state'); return state; },
    async setHeating(on) { calls.push(`heat:${on}`); state = { ...state, mode: on ? 'S_Heat' : 'S_Off' }; return state; },
  };
  events.get('didFinishLaunching')();
  await platform.refresh(true);
  assert.equal(registered.length, 1);
  const kettle = registered[0].getService('switch');
  await kettle.getCharacteristic(C.On).set(true);
  assert.equal(await kettle.getCharacteristic(C.On).get(), true);
  assert.equal(kettle.getCharacteristic(C.On).value, true);
  await kettle.getCharacteristic(C.On).set(false);
  assert.deepEqual(calls.filter(call => call !== 'state'), ['heat:true', 'heat:false']);
  events.get('shutdown')();
});
