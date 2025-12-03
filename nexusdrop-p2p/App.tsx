import React, { useState, useEffect, useRef } from 'react';
import { signaling } from './services/signaling';
import { generateFileSummary } from './services/geminiService';
import { MessageType, SignalingMessage } from './types';
import TransferView from './components/TransferView';
import { Upload, ArrowRight, Smartphone, Monitor, Shield, Zap, Info, Download } from 'lucide-react';

// STUN servers are essential for NAT traversal
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

const App: React.FC = () => {
  const [view, setView] = useState<'LANDING' | 'SENDER_PREP' | 'RECEIVER_PREP' | 'TRANSFER'>('LANDING');
  const [role, setRole] = useState<'SENDER' | 'RECEIVER' | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [joinCode, setJoinCode] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('IDLE');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  
  // WebRTC Refs
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);

  // Initialize Logic
  useEffect(() => {
    return () => {
      signaling.destroy();
      if (peerConnection.current) peerConnection.current.close();
    };
  }, []);

  // Signaling Handler
  useEffect(() => {
    signaling.onMessage = async (msg: SignalingMessage) => {
      if (!peerConnection.current) setupPeerConnection();
      const pc = peerConnection.current!;

      switch (msg.type) {
        case MessageType.JOIN:
          if (role === 'SENDER') {
            createOffer(pc);
            setConnectionStatus('PEER_JOINED');
          }
          break;
        case MessageType.OFFER:
          if (role === 'RECEIVER') {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            signaling.send({ type: MessageType.ANSWER, roomId: msg.roomId, payload: answer });
          }
          break;
        case MessageType.ANSWER:
          if (role === 'SENDER') {
             await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
          }
          break;
        case MessageType.ICE_CANDIDATE:
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.payload));
          } catch (e) {
            console.error("Error adding ice candidate", e);
          }
          break;
      }
    };
  }, [role]);

  const setupPeerConnection = () => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signaling.send({
          type: MessageType.ICE_CANDIDATE,
          roomId: roomId || joinCode,
          payload: event.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
        console.log("Connection state:", pc.connectionState);
        if (pc.connectionState === 'connected') {
            setView('TRANSFER');
        }
    };

    if (role === 'SENDER') {
      const dc = pc.createDataChannel("nexus-file");
      setupDataChannel(dc);
    } else {
      pc.ondatachannel = (event) => {
        setupDataChannel(event.channel);
      };
    }

    peerConnection.current = pc;
  };

  const setupDataChannel = (dc: RTCDataChannel) => {
    dataChannel.current = dc;
    dc.onopen = () => console.log("Data Channel OPEN");
    dc.onclose = () => console.log("Data Channel CLOSED");
  };

  const createOffer = async (pc: RTCPeerConnection) => {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signaling.send({ type: MessageType.OFFER, roomId, payload: offer });
  };

  // UI Actions
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setAnalysisResult(null); // Reset previous analysis
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    const summary = await generateFileSummary(file);
    if (summary) {
        (file as any).summary = summary;
        setAnalysisResult(summary);
    }
    setAnalyzing(false);
  };

  const startHosting = () => {
    if (!file) return;
    setRole('SENDER');
    const newRoomId = signaling.createRoom();
    setRoomId(newRoomId);
    setupPeerConnection(); // Initialize PC early
    setView('SENDER_PREP');
  };

  const joinSession = () => {
    if (joinCode.length !== 6) return;
    setRole('RECEIVER');
    setupPeerConnection();
    signaling.joinRoom(joinCode);
    setRoomId(joinCode);
    setView('RECEIVER_PREP');
  };
  
  const resetApp = () => {
      if (peerConnection.current) peerConnection.current.close();
      peerConnection.current = null;
      dataChannel.current = null;
      setFile(null);
      setRole(null);
      setView('LANDING');
      setAnalysisResult(null);
  };

  // Render Helpers
  const renderLanding = () => (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 space-y-12 animate-fade-in">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-black tracking-tighter text-white">
          NEXUS<span className="text-nexus-accent">DROP</span>
        </h1>
        <p className="text-gray-400 max-w-md mx-auto">
          Secure, Serverless, AI-Enhanced P2P File Transfer. 
          No size limits. No cloud storage. Direct from device to device.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 w-full max-w-4xl">
        {/* SENDER CARD */}
        <div className="glass-panel p-8 rounded-2xl hover:border-nexus-accent/50 transition-all group">
          <div className="h-40 flex flex-col justify-center items-center border-2 border-dashed border-gray-700 rounded-xl bg-nexus-800/50 group-hover:bg-nexus-800 transition-colors relative overflow-hidden">
            <input 
              type="file" 
              className="absolute inset-0 opacity-0 cursor-pointer z-10" 
              onChange={handleFileSelect}
            />
            {file ? (
              <div className="text-center p-4 z-0">
                <FileText className="w-10 h-10 text-nexus-accent mx-auto mb-2" />
                <p className="font-mono text-sm truncate max-w-[200px]">{file.name}</p>
                <p className="text-xs text-gray-500">{(file.size / (1024*1024)).toFixed(2)} MB</p>
              </div>
            ) : (
              <div className="text-center z-0">
                <Upload className="w-10 h-10 text-gray-500 mx-auto mb-2 group-hover:text-nexus-accent transition-colors" />
                <p className="text-gray-400 font-medium">Drop file or click to browse</p>
              </div>
            )}
          </div>
          
          {file && (
             <div className="mt-4 space-y-3">
                {/* Gemini Analysis Button */}
                {!analysisResult && (
                    <button 
                        onClick={handleAnalyze}
                        disabled={analyzing}
                        className="w-full py-2 px-4 rounded-lg bg-nexus-900 border border-nexus-500/30 text-xs text-nexus-400 hover:text-white flex items-center justify-center gap-2 transition-all"
                    >
                        {analyzing ? <span className="animate-spin-slow">⏳</span> : <Zap className="w-3 h-3" />}
                        {analyzing ? 'Analyzing Content...' : 'Generate AI Insight'}
                    </button>
                )}
                
                {analysisResult && (
                    <div className="bg-indigo-900/20 border border-indigo-500/30 p-3 rounded-lg text-xs text-indigo-200">
                        <span className="font-bold text-indigo-400 block mb-1">AI Insight:</span>
                        {analysisResult}
                    </div>
                )}
             </div>
          )}

          <button 
            disabled={!file}
            onClick={startHosting}
            className={`w-full mt-6 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${file ? 'bg-nexus-accent text-nexus-900 hover:bg-cyan-400 shadow-[0_0_20px_rgba(0,240,255,0.3)]' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
          >
            Send File <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        {/* RECEIVER CARD */}
        <div className="glass-panel p-8 rounded-2xl hover:border-nexus-success/50 transition-all flex flex-col justify-between">
          <div>
            <div className="w-16 h-16 bg-nexus-700 rounded-full flex items-center justify-center mb-6 mx-auto">
              <Download className="w-8 h-8 text-nexus-success" />
            </div>
            <h3 className="text-2xl font-bold text-center mb-2">Receive</h3>
            <p className="text-center text-gray-500 text-sm mb-6">Enter the 6-digit code from the sender device.</p>
            
            <input 
              type="text" 
              maxLength={6}
              placeholder="000 000"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className="w-full bg-nexus-900 border border-gray-700 rounded-xl px-4 py-4 text-center text-2xl tracking-widest font-mono focus:border-nexus-success focus:outline-none focus:ring-1 focus:ring-nexus-success transition-all"
            />
          </div>

          <button 
            disabled={joinCode.length !== 6}
            onClick={joinSession}
            className={`w-full mt-6 py-4 rounded-xl font-bold text-lg transition-all ${joinCode.length === 6 ? 'bg-nexus-success text-nexus-900 hover:bg-green-400 shadow-[0_0_20px_rgba(0,255,157,0.3)]' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
          >
            Receive File
          </button>
        </div>
      </div>
      
      <div className="flex gap-8 text-gray-500 text-xs mt-12">
        <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" /> End-to-End Encrypted
        </div>
        <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4" /> WebRTC P2P
        </div>
        <div className="flex items-center gap-2">
            <Zap className="w-4 h-4" /> Powered by Gemini
        </div>
      </div>
      
       {/* Test Instructions for Demo */}
      <div className="max-w-md bg-nexus-800/80 p-4 rounded text-xs text-gray-400 border border-white/5">
        <p className="font-bold text-white mb-1 flex items-center gap-2"><Info className="w-3 h-3"/> How to Test Demo</p>
        Open this page in <b>two separate tabs</b>. Select a file in one tab (Sender) to get a code. Enter that code in the second tab (Receiver). The mock signaling service will connect them.
      </div>
    </div>
  );

  const renderSenderPrep = () => (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="glass-panel p-10 rounded-3xl text-center max-w-md w-full relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-nexus-accent animate-pulse-fast"></div>
        
        <h2 className="text-3xl font-bold mb-2">Ready to Send</h2>
        <p className="text-gray-400 mb-8">Scan QR or enter code on receiver device</p>

        <div className="bg-white p-4 rounded-xl inline-block mb-8">
           {/* Visual QR Placeholder - In a real app use react-qr-code */}
           <div className="w-48 h-48 bg-nexus-900 relative flex items-center justify-center overflow-hidden">
             <div className="absolute inset-0 bg-white" style={{clipPath: 'polygon(0% 0%, 0% 100%, 25% 100%, 25% 25%, 75% 25%, 75% 75%, 25% 75%, 25% 100%, 100% 100%, 100% 0%)'}}></div>
             <div className="absolute w-24 h-24 bg-nexus-900 rounded-lg flex items-center justify-center">
                 <span className="text-2xl font-black text-white">{roomId.slice(0,3)}</span>
             </div>
           </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-gray-500 uppercase tracking-widest">Connection Code</p>
          <div className="text-5xl font-mono font-bold text-nexus-accent tracking-widest select-all">
            {roomId}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-nexus-400 animate-pulse">
            <div className="w-2 h-2 bg-nexus-400 rounded-full"></div>
            Waiting for receiver...
        </div>
        
        <button onClick={resetApp} className="absolute top-4 right-4 text-gray-600 hover:text-white">✕</button>
      </div>
    </div>
  );

  const renderReceiverPrep = () => (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
       <div className="glass-panel p-12 rounded-3xl text-center">
          <div className="w-16 h-16 border-4 border-nexus-success border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold mb-2">Connecting to Peer...</h2>
          <p className="text-gray-400">Negotiating WebRTC handshake...</p>
          <button onClick={resetApp} className="mt-8 text-sm text-gray-500 hover:text-white">Cancel</button>
       </div>
    </div>
  );

  // File Text for import
  const FileText = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
  );

  return (
    <div className="bg-nexus-900 min-h-screen text-white font-sans selection:bg-nexus-accent selection:text-nexus-900">
      {view === 'LANDING' && renderLanding()}
      {view === 'SENDER_PREP' && renderSenderPrep()}
      {view === 'RECEIVER_PREP' && renderReceiverPrep()}
      {view === 'TRANSFER' && (
        <div className="min-h-screen flex items-center justify-center p-4">
            <TransferView 
                role={role!} 
                dataChannel={dataChannel.current} 
                fileToSend={file}
                onReset={resetApp}
            />
        </div>
      )}
    </div>
  );
};

export default App;