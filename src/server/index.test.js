const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const WebSocket = require('ws');

// Helper to make HTTP requests
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    }).on('error', reject);
  });
}

// Helper to create WebSocket connection that also captures the first message
function createWsClient(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages = [];
    ws.on('message', (data) => {
      messages.push(JSON.parse(data.toString()));
    });
    ws.messages = messages;
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

// Helper to wait for a message
function waitForMessage(ws, type, timeout = 5000) {
  return new Promise((resolve, reject) => {
    // First check if the message has already been received
    const existing = ws.messages.find(m => !type || m.type === type);
    if (existing) {
      ws.messages.splice(ws.messages.indexOf(existing), 1);
      return resolve(existing);
    }

    const timer = setTimeout(() => reject(new Error('Timeout waiting for message')), timeout);
    const handler = (data) => {
      const message = JSON.parse(data.toString());
      if (!type || message.type === type) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(message);
      }
    };
    ws.on('message', handler);
  });
}

describe('NexusDrop Server', () => {
  let server;
  let wss;
  const PORT = 3099;
  const baseUrl = `http://localhost:${PORT}`;
  const wsUrl = `ws://localhost:${PORT}`;

  before(async () => {
    // Set port for tests
    process.env.PORT = PORT;

    // Start server
    const module = require('../server/index.js');
    server = module.server;
    wss = module.wss;

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  after(async () => {
    // Close all WebSocket connections
    if (wss) {
      wss.clients.forEach(client => client.terminate());
      await new Promise(resolve => wss.close(resolve));
    }
    // Close server
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('health endpoint returns status ok', async () => {
    const response = await httpGet(`${baseUrl}/health`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.status, 'ok');
    assert.strictEqual(typeof response.data.peers, 'number');
  });

  test('serves static index.html', async () => {
    const response = await httpGet(baseUrl);
    assert.strictEqual(response.status, 200);
    assert.ok(response.data.includes('NexusDrop'));
  });

  test('WebSocket connection receives peer-id', async () => {
    const ws = await createWsClient(wsUrl);
    const message = await waitForMessage(ws, 'peer-id');

    assert.strictEqual(message.type, 'peer-id');
    assert.ok(message.peerId);
    assert.strictEqual(typeof message.peerId, 'string');

    ws.close();
  });

  test('can create a room', async () => {
    const ws = await createWsClient(wsUrl);
    await waitForMessage(ws, 'peer-id');

    ws.send(JSON.stringify({ type: 'create-room' }));
    const message = await waitForMessage(ws, 'room-created');

    assert.strictEqual(message.type, 'room-created');
    assert.ok(message.roomId);
    assert.strictEqual(message.roomId.length, 6);

    ws.close();
  });

  test('can join a room', async () => {
    // Create first peer and room
    const ws1 = await createWsClient(wsUrl);
    await waitForMessage(ws1, 'peer-id');
    ws1.send(JSON.stringify({ type: 'create-room' }));
    const roomCreated = await waitForMessage(ws1, 'room-created');

    // Create second peer and join room
    const ws2 = await createWsClient(wsUrl);
    await waitForMessage(ws2, 'peer-id');
    ws2.send(JSON.stringify({ type: 'join-room', roomId: roomCreated.roomId }));

    const joinedMessage = await waitForMessage(ws2, 'room-joined');
    assert.strictEqual(joinedMessage.type, 'room-joined');
    assert.strictEqual(joinedMessage.roomId, roomCreated.roomId);
    assert.ok(Array.isArray(joinedMessage.peers));

    ws1.close();
    ws2.close();
  });

  test('joining non-existent room returns error', async () => {
    const ws = await createWsClient(wsUrl);
    await waitForMessage(ws, 'peer-id');

    ws.send(JSON.stringify({ type: 'join-room', roomId: 'FAKEID' }));
    const message = await waitForMessage(ws, 'error');

    assert.strictEqual(message.type, 'error');
    assert.ok(message.message.includes('not found'));

    ws.close();
  });

  test('peer leaving room notifies others', async () => {
    // Create first peer and room
    const ws1 = await createWsClient(wsUrl);
    const peer1Id = (await waitForMessage(ws1, 'peer-id')).peerId;
    ws1.send(JSON.stringify({ type: 'create-room' }));
    const roomCreated = await waitForMessage(ws1, 'room-created');

    // Create second peer and join room
    const ws2 = await createWsClient(wsUrl);
    await waitForMessage(ws2, 'peer-id');
    ws2.send(JSON.stringify({ type: 'join-room', roomId: roomCreated.roomId }));
    await waitForMessage(ws2, 'room-joined');

    // Wait for peer-joined notification on ws1
    await waitForMessage(ws1, 'peer-joined');

    // Second peer leaves
    ws2.send(JSON.stringify({ type: 'leave-room' }));

    // First peer should receive peer-left notification
    const leftMessage = await waitForMessage(ws1, 'peer-left');
    assert.strictEqual(leftMessage.type, 'peer-left');

    ws1.close();
    ws2.close();
  });
});
