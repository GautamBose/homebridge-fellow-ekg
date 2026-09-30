'use strict';

const { KettleClient } = require('./kettle-client');

const PLUGIN_NAME = 'homebridge-fellow-ekg';
const PLATFORM_NAME = 'FellowEKG';

class FellowPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.accessory = null;
    this.state = null;
    this.lastPoll = 0;
    this.inFlight = null;
    this.action = Promise.resolve();
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    try {
      this.client = new KettleClient(config.host, config.port || 80);
    } catch (error) {
      log.error(error.message);
      return;
    }
    api.on('didFinishLaunching', () => this.launch());
    api.on('shutdown', () => clearInterval(this.timer));
  }

  configureAccessory(accessory) {
    this.accessory = accessory;
  }

  launch() {
    if (!this.client) return;
    const name = this.config.name || 'Fellow Kettle';
    const uuid = this.api.hap.uuid.generate(`${PLATFORM_NAME}:${this.config.host}:${this.client.port}`);
    if (this.accessory && this.accessory.UUID !== uuid) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessory]);
      this.accessory = null;
    }
    if (!this.accessory) {
      this.accessory = new this.api.platformAccessory(name, uuid);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessory]);
    }
    this.accessory.getService(this.Service.AccessoryInformation)
      .setCharacteristic(this.Characteristic.Manufacturer, 'Fellow')
      .setCharacteristic(this.Characteristic.Model, 'EKG HTTP CLI');
    const kettle = this.accessory.getService(this.Service.Switch) ||
      this.accessory.addService(this.Service.Switch, name);
    this.kettle = kettle;
    kettle.getCharacteristic(this.Characteristic.On)
      .onGet(async () => this.isOn(await this.refresh()))
      .onSet(async value => this.mutate(() => this.client.setHeating(Boolean(value))));
    const interval = Math.max(5, Math.min(300, Number(this.config.pollInterval) || 30));
    this.timer = setInterval(() => this.refresh(true).catch(() => {}), interval * 1000);
    this.refresh(true).catch(() => {});
  }

  isOn(state) {
    return ['S_Heat', 'S_StartupToTempr', 'S_Heat+menu', 'S_Hold'].includes(state.mode);
  }

  async mutate(operation) {
    const next = this.action.catch(() => {}).then(async () => {
      if (this.inFlight) await this.inFlight.catch(() => {});
      const state = await operation();
      this.publish(state);
    });
    this.action = next;
    return next;
  }

  async refresh(force = false) {
    await this.action.catch(() => {});
    if (!force && this.state && Date.now() - this.lastPoll < 5000) return this.state;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.client.state().then(state => {
      this.publish(state);
      return state;
    }).catch(error => {
      this.log.warn(`Fellow kettle unavailable: ${error.message}`);
      throw error;
    }).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  publish(state) {
    this.state = state;
    this.lastPoll = Date.now();
    this.kettle.updateCharacteristic(this.Characteristic.On, this.isOn(state));
  }
}

module.exports = api => api.registerPlatform(PLATFORM_NAME, FellowPlatform);
module.exports.FellowPlatform = FellowPlatform;
