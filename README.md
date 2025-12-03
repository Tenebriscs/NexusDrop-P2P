# NexusDrop P2P

⚡ A lightweight, decentralized file sharing application designed to bypass cloud storage completely.

Unlike traditional transfer tools that upload files to a central server, NexusDrop establishes a **direct connection between peers** using WebRTC technology.

## Features

- **True Peer-to-Peer**: Files transfer directly between browsers, never touching a central server
- **No Size Limits**: Transfer files of any size (limited only by browser memory)
- **Real-time Progress**: Live progress tracking for all transfers
- **Simple Room Codes**: Easy 6-character codes to connect with others
- **Multiple Peers**: Connect with multiple peers in the same room
- **No Registration**: No accounts, no sign-ups, just share

## How It Works

1. **Create a Room**: One person creates a room and gets a 6-character code
2. **Share the Code**: Share the code with anyone you want to send files to
3. **Connect**: Others join using the room code
4. **Transfer**: Drop files to send them directly to all connected peers

The signaling server only helps peers find each other. Once connected, all data flows directly between browsers using WebRTC data channels.

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/Tenebriscs/NexusDrop-P2P.git
cd NexusDrop-P2P

# Install dependencies
npm install

# Start the server
npm start
```

Open your browser to `http://localhost:3000`

### Usage

1. Click "Create Room" to start a new sharing session
2. Share the room code with your peers
3. Others click "Join" and enter the room code
4. Once connected, drag and drop files to share them

## Architecture

```
┌─────────────────┐         ┌─────────────────┐
│    Browser A    │◄───────►│    Browser B    │
│   (Peer A)      │  WebRTC │   (Peer B)      │
│                 │  Direct │                 │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │ WebSocket                 │ WebSocket
         │ (Signaling only)          │ (Signaling only)
         │                           │
         └───────────┬───────────────┘
                     │
            ┌────────▼────────┐
            │ Signaling Server│
            │ (Connection     │
            │  setup only)    │
            └─────────────────┘
```

## Technical Details

- **Signaling Server**: Node.js + Express + WebSocket for peer discovery
- **File Transfer**: WebRTC Data Channels for direct P2P communication
- **Chunking**: Files are split into 16KB chunks for reliable transfer
- **ICE Servers**: Uses Google's public STUN servers for NAT traversal

## Configuration

Set the port using the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## API Endpoints

- `GET /` - Web UI
- `GET /health` - Health check endpoint (returns `{ status: 'ok', peers: <count> }`)
- `WS /` - WebSocket endpoint for signaling

## Security Notes

- All file transfers are direct peer-to-peer
- The signaling server never sees your file content
- WebRTC connections are encrypted by default (DTLS)
- Room codes expire when all participants leave

## Browser Support

NexusDrop works in all modern browsers that support WebRTC:

- Chrome/Edge 80+
- Firefox 75+
- Safari 14.1+

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
