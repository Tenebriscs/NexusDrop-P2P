# ⚡ NexusDrop P2P

> **Secure, Serverless, Peer-to-Peer File Transfer Protocol**

![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)
![Status](https://img.shields.io/badge/Status-Prototype-orange.svg)
![Tech](https://img.shields.io/badge/Tech-WebRTC%20|%20Node.js%20|%20React-green.svg)

**NexusDrop** is a decentralized file sharing application that enables users to send large files directly between browsers without storing any data on an intermediate server. By leveraging **WebRTC**, it creates a secure, private data tunnel for real-time transfers.

---

## 🚀 Key Features

* **Serverless Architecture:** Files are never uploaded to the cloud. They stream directly from Peer A to Peer B.
* **End-to-End Privacy:** Data is encrypted via WebRTC protocols (DTLS/SRTP).
* **No File Size Limits:** Implements intelligent **binary chunking** to handle large files without crashing browser memory.
* **Cross-Network Connectivity:** Uses public STUN servers to negotiate connections across different NATs and firewalls.
* **Real-Time Feedback:** Visual progress indicators and transfer speed metrics.

---

## 🛠 How It Works (Technical Deep Dive)

NexusDrop separates the **Signaling Phase** (handshake) from the **Data Transfer Phase**.

### 1. The Architecture
Unlike traditional apps like WeTransfer, the server in NexusDrop is **ephemeral**. It is only used to exchange "connection details" (SDP & ICE Candidates). Once the peers find each other, the server is no longer involved.

```mermaid
sequenceDiagram
    participant Sender
    participant SignalServer as Signaling Server (WebSocket)
    participant Receiver

    Sender->>SignalServer: 1. Create Offer (SDP)
    SignalServer->>Receiver: 2. Forward Offer
    Receiver->>SignalServer: 3. Create Answer (SDP)
    SignalServer->>Sender: 4. Forward Answer
    
    note over Sender, Receiver: ICE Candidates Exchanged via Server...

    Sender->>Receiver: 5. DIRECT P2P CONNECTION ESTABLISHED (WebRTC)
    
    Sender->>Sender: 6. Chunk File (ArrayBuffer)
    Sender->>Receiver: 7. Stream Data via RTCDataChannel
    Receiver->>Receiver: 8. Reassemble Blobs & Download

    2. Large File Handling (Chunking)
Sending a 1GB file in one go would crash the browser. NexusDrop solves this by:

Reading the file using the File API.

Slicing the file into 16KB - 64KB chunks (ArrayBuffers).

Sending chunks sequentially over the RTCDataChannel.

Reassembling chunks into a Blob on the receiver's end only when the transfer is complete.

💻 Tech Stack
Frontend: React (or Vue/Vanilla JS), Vite

Core Protocol: WebRTC API (RTCPeerConnection, RTCDataChannel)

Signaling Server: Node.js, Socket.io (for WebSocket handling)

Styling: TailwindCSS

Binary Handling: JavaScript Streams API

🏁 Getting Started
Clone the repository and run the project locally.

Prerequisites
Node.js (v16+)

npm or yarn

Installation
Clone the repo

Bash

git clone [https://github.com/yourusername/nexusdrop-p2p.git](https://github.com/yourusername/nexusdrop-p2p.git)
cd nexusdrop-p2p
Install dependencies

Bash

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
Run the Signaling Server

Bash

cd server
npm start
# Server usually runs on localhost:3001
Run the Client

Bash

cd client
npm run dev
# App runs on localhost:5173
🚧 Challenges & Learnings
NAT Traversal: Understanding how STUN/TURN servers work was critical to allow connections between devices on different WiFi networks.

Buffer Control: Managing the bufferedAmount property of the data channel was necessary to prevent the sender from overwhelming the receiver's bandwidth, implementing a custom backpressure mechanism.

🔮 Future Improvements
[ ] Implement TURN servers for strict firewall bypass.

[ ] Add resume capability for interrupted transfers.

[ ] Support for multiple file transfers simultaneously.

📄 License
Distributed under the Apache License. See LICENSE for more information.
