'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, test } = require('node:test');
const { KettleClient, parseState } = require('../kettle-client');

let server;
let client;
let mode = 'S_Off';
let immediateHold = false;
const commands = [];
const paths = [];

function stateResponse() {
  return `I (1) Cli: cmd len 5: 'state'\nscrname=wnd\nmode=${mode}\n` +
    `tempr=93.02 C\nketl= ho ${mode === 'S_Heat' ? 1 : 0} wd 0\n`;
}

before(async () => {
  server = http.createServer((request, response) => {
    paths.push(request.url);
    if (request.url.includes('%20')) return response.end('cannot find command');
    const command = new URL(request.url, 'http://localhost').searchParams.get('cmd');
    commands.push(command);
    if (command === 'state') response.end(stateResponse());
    else if (command.startsWith('ss ')) {
      mode = command === 'ss S_Heat' && immediateHold ? 'S_Hold' : command.slice(3);
      response.end('ret 0');
    } else response.writeHead(400).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  client = new KettleClient('127.0.0.1', server.address().port);
});

after(async () => { await new Promise(resolve => server.close(resolve)); });

test('parses the kettle response and rejects truncated state', () => {
  assert.deepEqual(parseState(stateResponse()), {
    mode: 'S_Off', currentC: 93.02,
  });
  assert.throws(() => parseState('tempr=70 C'), /incomplete state/);
});

test('encodes spaces in commands as plus signs for the kettle parser', async () => {
  await client.setHeating(true);
  assert.ok(commands.includes('ss S_Heat'));
  assert.ok(paths.includes('/cli?cmd=ss+S_Heat'));
  await client.setHeating(false);
});

test('starts and stops without a toggle command', async () => {
  commands.length = 0;
  assert.equal((await client.setHeating(true)).mode, 'S_Heat');
  assert.equal((await client.setHeating(false)).mode, 'S_Off');
  assert.deepEqual(commands.filter(command => command.startsWith('ss ')), ['ss S_Heat', 'ss S_Off']);
});

test('accepts an immediate hold when already at target temperature', async () => {
  immediateHold = true;
  assert.equal((await client.setHeating(true)).mode, 'S_Hold');
  await client.setHeating(false);
  immediateHold = false;
});
