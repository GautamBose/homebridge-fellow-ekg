'use strict';

const http = require('node:http');

function field(text, name) {
  const match = text.match(new RegExp(`(?:^|\\n)${name}=([^\\r\\n]+)`));
  return match?.[1].trim();
}

function parseState(text) {
  const mode = field(text, 'mode');
  const currentRaw = field(text, 'tempr');
  const current = currentRaw === undefined ? null : Number.parseFloat(currentRaw);
  if (!mode || (current !== null && !Number.isFinite(current))) {
    throw new Error('Kettle returned an incomplete state');
  }
  return { mode, currentC: current };
}

class KettleClient {
  constructor(host, port = 80, timeoutMs = 5000) {
    if (typeof host !== 'string' || !/^[a-zA-Z0-9.:-]+$/.test(host)) {
      throw new Error('Configure a kettle IP address or hostname, without a URL scheme');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Invalid kettle port');
    }
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
  }

  command(command) {
    // The kettle's CLI form parser recognizes '+' for spaces but not '%20'.
    const path = `/cli?${new URLSearchParams({ cmd: command })}`;
    return new Promise((resolve, reject) => {
      const request = http.get({ host: this.host, port: this.port, path, timeout: this.timeoutMs }, response => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Kettle returned HTTP ${response.statusCode}`));
          return;
        }
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          body += chunk;
          if (body.length > 65536) response.destroy(new Error('Kettle response too large'));
        });
        response.on('error', reject);
        response.on('end', () => {
          if (/cannot find command|command .+ ret [1-9]/i.test(body)) {
            reject(new Error(`Kettle rejected command '${command}'`));
          } else {
            resolve(body);
          }
        });
      });
      request.on('timeout', () => request.destroy(new Error('Kettle request timed out')));
      request.on('error', reject);
    });
  }

  async state() {
    return parseState(await this.command('state'));
  }

  async setHeating(on) {
    const state = await this.state();
    if (on && state.currentC === null) throw new Error('Kettle temperature unavailable; check that it is on its base');
    const heating = state.mode === 'S_Heat' || state.mode === 'S_StartupToTempr' || state.mode === 'S_Heat+menu';
    if (on && heating) return state;
    if (!on && state.mode === 'S_Off') return state;
    // Transitions sometimes discard a command. Verify and retry the desired state.
    for (let commandAttempt = 0; commandAttempt < 3; commandAttempt++) {
      await this.command(on ? 'ss S_Heat' : 'ss S_Off');
      for (let readAttempt = 0; readAttempt < 4; readAttempt++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        try {
          const updated = await this.state();
          const started = ['S_Heat', 'S_StartupToTempr', 'S_Heat+menu', 'S_Hold', 'S_HeatOff']
            .includes(updated.mode);
          if (on ? started : updated.mode === 'S_Off') return updated;
        } catch {
          // Brief HTTP failures during transitions are expected on this firmware.
        }
      }
    }
    throw new Error(`Kettle did not ${on ? 'start' : 'stop'} heating`);
  }
}

module.exports = { KettleClient, parseState };
