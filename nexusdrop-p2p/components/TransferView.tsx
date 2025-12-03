import React, { useEffect, useState, useRef, useCallback } from 'react';
import { TransferState, FileMetadata, CHUNK_SIZE } from '../types';
import { Share2, Download, FileText, CheckCircle, AlertTriangle, Zap, Cpu } from 'lucide-react';

interface TransferViewProps {
  role: 'SENDER' | 'RECEIVER';
  dataChannel: RTCDataChannel | null;
  fileToSend?: File | null;
  onReset: () => void;
}

const TransferView: React.FC<TransferViewProps> = ({ role, dataChannel, fileToSend, onReset }) => {
  const [state, setState] = useState<TransferState>({
    progress: 0,
    speed: '0 KB/s',
    status: 'CONNECTED',
  });
  const [receivedFileMeta, setReceivedFileMeta] = useState<FileMetadata | null>(null);
  const [receivedChunks, setReceivedChunks] = useState<ArrayBuffer[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  
  // Refs for transfer calculation
  const bytesTransferred = useRef(0);
  const startTime = useRef(0);
  const lastSpeedUpdate = useRef(0);
  const fileReader = useRef<FileReader | null>(null);

  // Helper to format bytes
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const startSending = useCallback(async () => {
    if (!dataChannel || !fileToSend || state.status === 'TRANSFERRING') return;

    setState(prev => ({ ...prev, status: 'TRANSFERRING', progress: 0 }));
    startTime.current = Date.now();
    bytesTransferred.current = 0;

    // Send Metadata First
    const metadata: FileMetadata = {
      name: fileToSend.name,
      size: fileToSend.size,
      type: fileToSend.type,
      summary: (fileToSend as any).summary // Attached by parent if available
    };
    
    try {
      dataChannel.send(JSON.stringify({ type: 'METADATA', payload: metadata }));
    } catch (e) {
      console.error("Failed to send metadata", e);
      setState(prev => ({...prev, status: 'ERROR', error: 'Connection lost before start.'}));
      return;
    }

    // Chunking Logic
    const reader = new FileReader();
    let offset = 0;

    fileReader.current = reader;

    const readSlice = (o: number) => {
      const slice = fileToSend.slice(offset, o + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = (e) => {
      if (!e.target?.result || !dataChannel) return;
      
      const buffer = e.target.result as ArrayBuffer;
      
      // Handle Backpressure
      // If bufferedAmount is too high, wait for it to drain
      if (dataChannel.bufferedAmount > 16 * 1024 * 1024) { // 16MB buffer limit
         setTimeout(() => {
            if (dataChannel.readyState === 'open') {
               try {
                dataChannel.send(buffer);
                processChunkSent(buffer.byteLength);
               } catch (err) {
                 handleError("Transfer interrupted");
               }
            }
         }, 100);
      } else {
        try {
          dataChannel.send(buffer);
          processChunkSent(buffer.byteLength);
        } catch (err) {
           handleError("Transfer interrupted during send");
        }
      }
    };

    const processChunkSent = (byteLength: number) => {
      offset += byteLength;
      bytesTransferred.current += byteLength;
      
      // Update Progress
      const progress = Math.min((offset / fileToSend.size) * 100, 100);
      
      // Update Speed every 500ms
      const now = Date.now();
      if (now - lastSpeedUpdate.current > 500) {
        const elapsed = (now - startTime.current) / 1000; // seconds
        const bytesPerSec = bytesTransferred.current / elapsed;
        setState(prev => ({
          ...prev, 
          progress, 
          speed: `${formatBytes(bytesPerSec)}/s`
        }));
        lastSpeedUpdate.current = now;
      } else {
         // Just update progress visually
         setState(prev => ({ ...prev, progress }));
      }

      if (offset < fileToSend.size) {
        readSlice(offset);
      } else {
        // Done
        setState(prev => ({ ...prev, status: 'COMPLETED', progress: 100 }));
        dataChannel.send(JSON.stringify({ type: 'EOF' }));
      }
    };

    readSlice(0);

  }, [dataChannel, fileToSend, state.status]);

  const handleError = (msg: string) => {
      setState(prev => ({ ...prev, status: 'ERROR', error: msg }));
  };

  // Receiver Logic
  useEffect(() => {
    if (role === 'RECEIVER' && dataChannel) {
      dataChannel.onmessage = (event) => {
        const { data } = event;
        
        if (typeof data === 'string') {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'METADATA') {
               setReceivedFileMeta(parsed.payload);
               setState(prev => ({ ...prev, status: 'TRANSFERRING' }));
               startTime.current = Date.now();
               bytesTransferred.current = 0;
            } else if (parsed.type === 'EOF') {
               setState(prev => ({ ...prev, status: 'COMPLETED', progress: 100 }));
            }
          } catch (e) {
            console.warn("Non-JSON string received", data);
          }
        } else {
          // Binary Data (Chunk)
          const arrayBuffer = data as ArrayBuffer;
          setReceivedChunks(prev => [...prev, arrayBuffer]);
          bytesTransferred.current += arrayBuffer.byteLength;
          
          if (receivedFileMeta) {
             const progress = (bytesTransferred.current / receivedFileMeta.size) * 100;
             const now = Date.now();
             if (now - lastSpeedUpdate.current > 500) {
                const elapsed = (now - startTime.current) / 1000;
                const speed = formatBytes(bytesTransferred.current / elapsed) + '/s';
                setState(prev => ({ ...prev, progress, speed }));
                lastSpeedUpdate.current = now;
             } else {
                setState(prev => ({ ...prev, progress }));
             }
          }
        }
      };
    }
  }, [role, dataChannel, receivedFileMeta]);

  // Reassemble File
  useEffect(() => {
    if (state.status === 'COMPLETED' && role === 'RECEIVER' && receivedChunks.length > 0 && receivedFileMeta) {
      const blob = new Blob(receivedChunks, { type: receivedFileMeta.type });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
    }
  }, [state.status, role, receivedChunks, receivedFileMeta]);

  // Auto-start sending if sender
  useEffect(() => {
    if (role === 'SENDER' && state.status === 'CONNECTED' && fileToSend) {
        // Small delay to ensure connection is stable
        const t = setTimeout(() => startSending(), 500);
        return () => clearTimeout(t);
    }
  }, [role, state.status, fileToSend, startSending]);

  return (
    <div className="w-full max-w-2xl mx-auto p-6 glass-panel rounded-2xl shadow-2xl">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          {role === 'SENDER' ? <Share2 className="text-nexus-accent" /> : <Download className="text-nexus-success" />}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-nexus-accent to-nexus-500">
            {role === 'SENDER' ? 'Sending File...' : 'Receiving File...'}
          </span>
        </h2>
        <span className={`px-3 py-1 rounded-full text-xs font-mono border ${state.status === 'COMPLETED' ? 'border-nexus-success text-nexus-success' : 'border-nexus-accent text-nexus-accent'}`}>
          {state.status}
        </span>
      </div>

      {/* File Info Card */}
      <div className="bg-nexus-800/50 p-4 rounded-xl border border-white/5 mb-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-nexus-700 rounded-lg">
             <FileText className="w-8 h-8 text-white/70" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-white">
              {role === 'SENDER' ? fileToSend?.name : receivedFileMeta?.name || 'Waiting for metadata...'}
            </h3>
            <p className="text-sm text-gray-400 font-mono mt-1">
              {role === 'SENDER' ? formatBytes(fileToSend?.size || 0) : receivedFileMeta ? formatBytes(receivedFileMeta.size) : '---'}
            </p>
            
            {/* Gemini Summary Display */}
            {((role === 'SENDER' && (fileToSend as any)?.summary) || (role === 'RECEIVER' && receivedFileMeta?.summary)) && (
              <div className="mt-3 p-3 bg-nexus-900/80 rounded border border-indigo-500/30 flex items-start gap-2">
                 <Zap className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                 <div>
                   <p className="text-xs text-indigo-300 font-bold uppercase mb-1">AI Insight</p>
                   <p className="text-sm text-indigo-100 italic">
                     {role === 'SENDER' ? (fileToSend as any)?.summary : receivedFileMeta?.summary}
                   </p>
                 </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-2 flex justify-between text-sm text-gray-400">
        <span>{Math.round(state.progress)}%</span>
        <span>{state.speed}</span>
      </div>
      <div className="h-4 bg-nexus-800 rounded-full overflow-hidden mb-6 border border-white/5 relative">
        <div 
          className="h-full bg-gradient-to-r from-nexus-500 to-nexus-accent transition-all duration-300 ease-out"
          style={{ width: `${state.progress}%` }}
        />
        {state.status === 'TRANSFERRING' && (
           <div className="absolute inset-0 bg-white/20 animate-pulse-fast w-full h-full mix-blend-overlay"></div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-center mt-6">
        {state.status === 'COMPLETED' && downloadUrl && (
          <a 
            href={downloadUrl} 
            download={receivedFileMeta?.name}
            className="flex items-center gap-2 bg-nexus-success text-nexus-900 px-8 py-3 rounded-xl font-bold hover:bg-green-400 transition-colors"
          >
            <Download className="w-5 h-5" />
            Save File
          </a>
        )}
        
        {state.status === 'ERROR' && (
           <div className="flex items-center gap-2 text-nexus-danger">
              <AlertTriangle />
              <span>Error: {state.error}</span>
           </div>
        )}

        {state.status === 'COMPLETED' && role === 'SENDER' && (
             <div className="flex items-center gap-2 text-nexus-success">
             <CheckCircle />
             <span>Transfer Complete</span>
          </div>
        )}
      </div>
      
      <div className="mt-8 text-center">
         <button onClick={onReset} className="text-xs text-gray-500 hover:text-white underline">Start New Transfer</button>
      </div>
    </div>
  );
};

export default TransferView;