/**
 * NexusDrop P2P Client
 * WebRTC-based peer-to-peer file transfer
 */

class NexusDropClient {
  constructor() {
    this.peerId = null;
    this.roomId = null;
    this.ws = null;
    this.peerConnections = new Map();
    this.dataChannels = new Map();
    this.pendingFiles = new Map();
    this.receivingFiles = new Map();

    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    this.chunkSize = 16384; // 16KB chunks for file transfer
    this.onStatusChange = null;
    this.onFileReceived = null;
    this.onTransferProgress = null;
    this.onPeerConnected = null;
    this.onPeerDisconnected = null;
    this.onError = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.updateStatus('Connected to signaling server');
        resolve();
      };

      this.ws.onclose = () => {
        this.updateStatus('Disconnected from signaling server');
        this.cleanup();
      };

      this.ws.onerror = (error) => {
        this.handleError('WebSocket error', error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleSignalingMessage(message);
        } catch (error) {
          this.handleError('Error parsing message', error);
        }
      };
    });
  }

  handleSignalingMessage(message) {
    switch (message.type) {
      case 'peer-id':
        this.peerId = message.peerId;
        this.updateStatus(`Your peer ID: ${this.peerId.substring(0, 8)}...`);
        break;

      case 'room-created':
        this.roomId = message.roomId;
        this.updateStatus(`Room created: ${message.roomId}`);
        break;

      case 'room-joined':
        this.roomId = message.roomId;
        this.updateStatus(`Joined room: ${message.roomId}`);
        // Initiate connection to existing peers
        message.peers.forEach(peerId => {
          this.createPeerConnection(peerId, true);
        });
        break;

      case 'peer-joined':
        this.updateStatus(`Peer joined: ${message.peerId.substring(0, 8)}...`);
        // Wait for the joining peer to initiate the connection
        break;

      case 'peer-left':
        this.handlePeerLeft(message.peerId);
        break;

      case 'offer':
        this.handleOffer(message.from, message.offer);
        break;

      case 'answer':
        this.handleAnswer(message.from, message.answer);
        break;

      case 'ice-candidate':
        this.handleIceCandidate(message.from, message.candidate);
        break;

      case 'error':
        this.handleError('Server error', new Error(message.message));
        break;
    }
  }

  createRoom() {
    this.send({ type: 'create-room' });
  }

  joinRoom(roomId) {
    this.send({ type: 'join-room', roomId: roomId.toUpperCase() });
  }

  leaveRoom() {
    this.send({ type: 'leave-room' });
    this.cleanup();
    this.roomId = null;
  }

  async createPeerConnection(remotePeerId, isInitiator) {
    const pc = new RTCPeerConnection(this.config);
    this.peerConnections.set(remotePeerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send({
          type: 'ice-candidate',
          to: remotePeerId,
          candidate: event.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.updateStatus(`Connected to peer: ${remotePeerId.substring(0, 8)}...`);
        if (this.onPeerConnected) {
          this.onPeerConnected(remotePeerId);
        }
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.handlePeerLeft(remotePeerId);
      }
    };

    pc.ondatachannel = (event) => {
      this.setupDataChannel(remotePeerId, event.channel);
    };

    if (isInitiator) {
      const dataChannel = pc.createDataChannel('fileTransfer', {
        ordered: true
      });
      this.setupDataChannel(remotePeerId, dataChannel);

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.send({
          type: 'offer',
          to: remotePeerId,
          offer: pc.localDescription
        });
      } catch (error) {
        this.handleError('Error creating offer', error);
      }
    }
  }

  setupDataChannel(remotePeerId, channel) {
    channel.binaryType = 'arraybuffer';
    this.dataChannels.set(remotePeerId, channel);

    channel.onopen = () => {
      this.updateStatus(`Data channel open with: ${remotePeerId.substring(0, 8)}...`);
    };

    channel.onclose = () => {
      this.updateStatus(`Data channel closed with: ${remotePeerId.substring(0, 8)}...`);
    };

    channel.onmessage = (event) => {
      this.handleDataChannelMessage(remotePeerId, event.data);
    };

    channel.onerror = (error) => {
      this.handleError('Data channel error', error);
    };
  }

  async handleOffer(remotePeerId, offer) {
    await this.createPeerConnection(remotePeerId, false);
    const pc = this.peerConnections.get(remotePeerId);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send({
        type: 'answer',
        to: remotePeerId,
        answer: pc.localDescription
      });
    } catch (error) {
      this.handleError('Error handling offer', error);
    }
  }

  async handleAnswer(remotePeerId, answer) {
    const pc = this.peerConnections.get(remotePeerId);
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (error) {
        this.handleError('Error handling answer', error);
      }
    }
  }

  async handleIceCandidate(remotePeerId, candidate) {
    const pc = this.peerConnections.get(remotePeerId);
    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        this.handleError('Error adding ICE candidate', error);
      }
    }
  }

  handlePeerLeft(remotePeerId) {
    const pc = this.peerConnections.get(remotePeerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(remotePeerId);
    }
    this.dataChannels.delete(remotePeerId);
    this.updateStatus(`Peer left: ${remotePeerId.substring(0, 8)}...`);
    if (this.onPeerDisconnected) {
      this.onPeerDisconnected(remotePeerId);
    }
  }

  handleDataChannelMessage(remotePeerId, data) {
    if (typeof data === 'string') {
      // JSON metadata message
      try {
        const message = JSON.parse(data);
        if (message.type === 'file-start') {
          this.receivingFiles.set(message.fileId, {
            name: message.name,
            size: message.size,
            mimeType: message.mimeType,
            chunks: [],
            receivedSize: 0
          });
          this.updateStatus(`Receiving file: ${message.name}`);
        } else if (message.type === 'file-end') {
          this.assembleFile(message.fileId);
        }
      } catch (error) {
        this.handleError('Error parsing data channel message', error);
      }
    } else {
      // Binary chunk data - extract fileId from first 36 bytes (UUID)
      const view = new DataView(data);
      const fileIdBytes = new Uint8Array(data, 0, 36);
      const fileId = new TextDecoder().decode(fileIdBytes);
      const chunkData = data.slice(36);

      const fileInfo = this.receivingFiles.get(fileId);
      if (fileInfo) {
        fileInfo.chunks.push(chunkData);
        fileInfo.receivedSize += chunkData.byteLength;

        if (this.onTransferProgress) {
          this.onTransferProgress(fileId, fileInfo.receivedSize, fileInfo.size, 'receiving');
        }
      }
    }
  }

  assembleFile(fileId) {
    const fileInfo = this.receivingFiles.get(fileId);
    if (!fileInfo) return;

    const blob = new Blob(fileInfo.chunks, { type: fileInfo.mimeType });
    this.receivingFiles.delete(fileId);

    this.updateStatus(`File received: ${fileInfo.name}`);

    if (this.onFileReceived) {
      this.onFileReceived({
        name: fileInfo.name,
        size: fileInfo.size,
        mimeType: fileInfo.mimeType,
        blob
      });
    }
  }

  async sendFile(file) {
    const fileId = this.generateFileId();
    const channels = Array.from(this.dataChannels.values()).filter(
      ch => ch.readyState === 'open'
    );

    if (channels.length === 0) {
      this.handleError('No connected peers', new Error('No peers available'));
      return;
    }

    // Send file metadata
    const metadata = JSON.stringify({
      type: 'file-start',
      fileId,
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream'
    });

    channels.forEach(channel => channel.send(metadata));

    // Send file in chunks
    const fileReader = new FileReader();
    let offset = 0;

    const sendNextChunk = () => {
      const slice = file.slice(offset, offset + this.chunkSize);
      fileReader.readAsArrayBuffer(slice);
    };

    fileReader.onload = (e) => {
      const chunkData = e.target.result;
      const fileIdBytes = new TextEncoder().encode(fileId);
      const combined = new Uint8Array(36 + chunkData.byteLength);
      combined.set(fileIdBytes, 0);
      combined.set(new Uint8Array(chunkData), 36);

      channels.forEach(channel => {
        if (channel.readyState === 'open') {
          channel.send(combined.buffer);
        }
      });

      offset += chunkData.byteLength;

      if (this.onTransferProgress) {
        this.onTransferProgress(fileId, offset, file.size, 'sending');
      }

      if (offset < file.size) {
        // Small delay to prevent overwhelming the channel
        setTimeout(sendNextChunk, 0);
      } else {
        // File transfer complete
        const endMessage = JSON.stringify({
          type: 'file-end',
          fileId
        });
        channels.forEach(channel => {
          if (channel.readyState === 'open') {
            channel.send(endMessage);
          }
        });
        this.updateStatus(`File sent: ${file.name}`);
      }
    };

    fileReader.onerror = (error) => {
      this.handleError('Error reading file', error);
    };

    this.updateStatus(`Sending file: ${file.name}`);
    sendNextChunk();
  }

  generateFileId() {
    // Generate a simple UUID-like ID (36 characters)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  updateStatus(message) {
    console.log(`[NexusDrop] ${message}`);
    if (this.onStatusChange) {
      this.onStatusChange(message);
    }
  }

  handleError(context, error) {
    console.error(`[NexusDrop] ${context}:`, error);
    if (this.onError) {
      this.onError(context, error);
    }
  }

  cleanup() {
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.dataChannels.clear();
    this.receivingFiles.clear();
  }

  disconnect() {
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.peerId = null;
    this.roomId = null;
  }

  getConnectedPeersCount() {
    return Array.from(this.dataChannels.values()).filter(
      ch => ch.readyState === 'open'
    ).length;
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.NexusDropClient = NexusDropClient;
}
