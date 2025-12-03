import { SignalingMessage, MessageType } from '../types';

/**
 * In a real-world scenario, this would use socket.io-client to connect to a Node.js server.
 * For this "Serverless" demo to work instantly in a browser sandbox (tab-to-tab),
 * we use the BroadcastChannel API to simulate a signaling server.
 */
class SignalingService {
  private channel: BroadcastChannel;
  private roomId: string | null = null;
  public onMessage: (msg: SignalingMessage) => void = () => {};

  constructor() {
    this.channel = new BroadcastChannel('nexus_drop_signaling');
    this.channel.onmessage = (event) => {
      const msg = event.data as SignalingMessage;
      // Filter messages meant for this room
      if (this.roomId && msg.roomId === this.roomId) {
        this.onMessage(msg);
      }
      // Special case for joining: if we are host, we listen for joins
      if (msg.type === MessageType.JOIN && msg.roomId === this.roomId) {
        this.onMessage(msg);
      }
    };
  }

  public createRoom(): string {
    // Generate a random 6-digit room ID
    const roomId = Math.floor(100000 + Math.random() * 900000).toString();
    this.roomId = roomId;
    console.log(`[Signaling] Room created: ${roomId}`);
    return roomId;
  }

  public joinRoom(roomId: string) {
    this.roomId = roomId;
    this.send({
      type: MessageType.JOIN,
      roomId,
      payload: { timestamp: Date.now() }
    });
    console.log(`[Signaling] Joined room: ${roomId}`);
  }

  public send(msg: SignalingMessage) {
    // In a real socket implementation: socket.emit('message', msg);
    // Here we just broadcast to other tabs
    this.channel.postMessage(msg);
  }

  public destroy() {
    this.channel.close();
  }
}

export const signaling = new SignalingService();