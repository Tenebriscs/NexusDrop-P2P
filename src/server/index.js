const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store connected peers
const peers = new Map();
const rooms = new Map();

// Serve static files
app.use(express.static(path.join(__dirname, '../../public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', peers: peers.size });
});

// WebSocket signaling server
wss.on('connection', (ws) => {
  const peerId = uuidv4();
  peers.set(peerId, { ws, roomId: null });

  console.log(`Peer connected: ${peerId}`);

  // Send peer their ID
  ws.send(JSON.stringify({ type: 'peer-id', peerId }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(peerId, message);
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    const peer = peers.get(peerId);
    if (peer && peer.roomId) {
      leaveRoom(peerId, peer.roomId);
    }
    peers.delete(peerId);
    console.log(`Peer disconnected: ${peerId}`);
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for peer ${peerId}:`, error);
  });
});

function handleMessage(peerId, message) {
  const peer = peers.get(peerId);
  if (!peer) return;

  switch (message.type) {
    case 'create-room':
      createRoom(peerId);
      break;

    case 'join-room':
      joinRoom(peerId, message.roomId);
      break;

    case 'leave-room':
      if (peer.roomId) {
        leaveRoom(peerId, peer.roomId);
      }
      break;

    case 'offer':
    case 'answer':
    case 'ice-candidate':
      // Forward WebRTC signaling messages to the target peer
      forwardToRoom(peerId, message);
      break;

    case 'file-metadata':
      // Forward file metadata to other peers in the room
      forwardToRoom(peerId, message);
      break;

    default:
      console.log(`Unknown message type: ${message.type}`);
  }
}

function createRoom(peerId) {
  const roomId = generateRoomCode();
  rooms.set(roomId, new Set([peerId]));

  const peer = peers.get(peerId);
  peer.roomId = roomId;

  sendToPeer(peerId, {
    type: 'room-created',
    roomId
  });

  console.log(`Room created: ${roomId} by peer: ${peerId}`);
}

function joinRoom(peerId, roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    sendToPeer(peerId, { type: 'error', message: 'Room not found' });
    return;
  }

  room.add(peerId);
  const peer = peers.get(peerId);
  peer.roomId = roomId;

  // Notify the joining peer
  sendToPeer(peerId, {
    type: 'room-joined',
    roomId,
    peers: Array.from(room).filter(id => id !== peerId)
  });

  // Notify other peers in the room
  room.forEach(otherPeerId => {
    if (otherPeerId !== peerId) {
      sendToPeer(otherPeerId, {
        type: 'peer-joined',
        peerId
      });
    }
  });

  console.log(`Peer ${peerId} joined room: ${roomId}`);
}

function leaveRoom(peerId, roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.delete(peerId);

  // Notify other peers
  room.forEach(otherPeerId => {
    sendToPeer(otherPeerId, {
      type: 'peer-left',
      peerId
    });
  });

  // Clean up empty rooms
  if (room.size === 0) {
    rooms.delete(roomId);
    console.log(`Room ${roomId} deleted (empty)`);
  }

  const peer = peers.get(peerId);
  if (peer) {
    peer.roomId = null;
  }

  console.log(`Peer ${peerId} left room: ${roomId}`);
}

function forwardToRoom(senderId, message) {
  const sender = peers.get(senderId);
  if (!sender || !sender.roomId) return;

  const room = rooms.get(sender.roomId);
  if (!room) return;

  const forwardMessage = { ...message, from: senderId };

  // If message has a specific target, send only to that peer
  if (message.to) {
    sendToPeer(message.to, forwardMessage);
  } else {
    // Broadcast to all other peers in the room
    room.forEach(peerId => {
      if (peerId !== senderId) {
        sendToPeer(peerId, forwardMessage);
      }
    });
  }
}

function sendToPeer(peerId, message) {
  const peer = peers.get(peerId);
  if (peer && peer.ws.readyState === WebSocket.OPEN) {
    peer.ws.send(JSON.stringify(message));
  }
}

function generateRoomCode() {
  // Generate a 6-character alphanumeric room code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`NexusDrop signaling server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});

module.exports = { app, server, wss };
