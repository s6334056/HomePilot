import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, AlertCircle } from 'lucide-react';
import jsQR from 'jsqr';

interface QRScannerProps {
  onScan: (data: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
}

interface DiagnosticLog {
  time: string;
  step: string;
  detail: string;
}

export const QRScanner: React.FC<QRScannerProps> = ({
  onScan,
  onError,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const activeRef = useRef<boolean>(false);
  const generationRef = useRef<number>(0);
  const onErrorRef = useRef<(message: string) => void>(onError);
  const [hasCamera, setHasCamera] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string>('カメラを起動中...');
  const [diagLogs, setDiagLogs] = useState<DiagnosticLog[]>([]);

  onErrorRef.current = onError;

  const addLog = useCallback((step: string, detail: string) => {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    setDiagLogs((prev) => [...prev, { time, step, detail }]);
  }, []);

  const stopCamera = useCallback(() => {
    activeRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const scanFrame = useCallback(() => {
    if (!activeRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      if (activeRef.current) {
        animFrameRef.current = requestAnimationFrame(scanFrame);
      }
      return;
    }

    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      if (activeRef.current) {
        animFrameRef.current = requestAnimationFrame(scanFrame);
      }
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (activeRef.current) {
        animFrameRef.current = requestAnimationFrame(scanFrame);
      }
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    try {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && activeRef.current) {
        stopCamera();
        onScan(code.data);
        return;
      }
    } catch {
      // jsQR decode error - continue scanning
    }

    if (activeRef.current) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
    }
  }, [stopCamera, onScan]);

  useEffect(() => {
    const generation = ++generationRef.current;
    activeRef.current = true;
    addLog('EFFECT', `useEffect fired (generation: ${generation})`);

    const startCamera = async () => {
      try {
        // Step 1: Check API existence
        const hasMediaDevices = !!navigator.mediaDevices;
        const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        addLog('CHECK', `navigator.mediaDevices: ${hasMediaDevices}`);
        addLog('CHECK', `getUserMedia: ${hasGetUserMedia}`);

        if (!hasMediaDevices || !hasGetUserMedia) {
          if (generation !== generationRef.current) return;
          setHasCamera(false);
          addLog('ERROR', 'getUserMedia not supported');
          onErrorRef.current('カメラへのアクセスがサポートされていません。');
          return;
        }

        // Step 2: Check video element
        addLog('CHECK', `videoRef.current: ${!!videoRef.current}`);
        addLog('CHECK', `videoRef.current?.nodeName: ${videoRef.current?.nodeName || 'N/A'}`);

        // Step 3: getUserMedia call
        const constraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };
        addLog('getUserMedia', `calling with constraints: ${JSON.stringify(constraints)}`);

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          addLog('getUserMedia', `SUCCESS - stream.id: ${stream.id}`);
          addLog('getUserMedia', `stream.active: ${stream.active}`);
          addLog('getUserMedia', `video tracks: ${stream.getVideoTracks().length}`);
          if (stream.getVideoTracks().length > 0) {
            const track = stream.getVideoTracks()[0];
            addLog('getUserMedia', `track.label: ${track.label}`);
            addLog('getUserMedia', `track.readyState: ${track.readyState}`);
            addLog('getUserMedia', `track.settings: ${JSON.stringify(track.getSettings())}`);
          }
        } catch (mediaErr: any) {
          addLog('getUserMedia', `FAILED: name=${mediaErr.name}, message=${mediaErr.message}`);
          if (mediaErr.constraint) {
            addLog('getUserMedia', `constraint: ${mediaErr.constraint}`);
          }
          throw mediaErr;
        }

        // Step 4: Check if this generation is still current
        addLog('GENERATION', `[gen:${generation}] current: ${generation === generationRef.current}`);
        if (generation !== generationRef.current) {
          addLog('GENERATION', `[gen:${generation}] STALE - discarding stream, stopping tracks`);
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // Step 5: Assign stream
        streamRef.current = stream;
        addLog('STREAM', `streamRef.current assigned: ${!!streamRef.current}`);

        // Step 6: Set video srcObject
        if (videoRef.current) {
          addLog('VIDEO', `[gen:${generation}] video.srcObject = stream`);
          videoRef.current.srcObject = stream;

          // Step 7: Check video readyState before play
          addLog('VIDEO', `video.readyState before play: ${videoRef.current.readyState}`);
          addLog('VIDEO', `video.paused: ${videoRef.current.paused}`);
          addLog('VIDEO', `video.videoWidth: ${videoRef.current.videoWidth}`);
          addLog('VIDEO', `video.videoHeight: ${videoRef.current.videoHeight}`);

          // Step 8: play()
          addLog('VIDEO', `[gen:${generation}] calling video.play()`);
          try {
            await videoRef.current.play();
            addLog('VIDEO', `[gen:${generation}] video.play() SUCCESS`);
            addLog('VIDEO', `video.readyState after play: ${videoRef.current.readyState}`);
            addLog('VIDEO', `video.paused after play: ${videoRef.current.paused}`);
          } catch (playErr: any) {
            addLog('VIDEO', `[gen:${generation}] video.play() FAILED: name=${playErr.name}, message=${playErr.message}`);
            throw playErr;
          }

          // Step 9: Check generation after play
          addLog('GENERATION', `[gen:${generation}] current after play: ${generation === generationRef.current}`);
          if (generation !== generationRef.current) return;

          setStatusMessage('QRコードをカメラに向けてください');
          addLog('SCAN', `[gen:${generation}] Starting scanFrame loop`);
          animFrameRef.current = requestAnimationFrame(scanFrame);
        } else {
          addLog('VIDEO', 'videoRef.current is NULL - cannot set srcObject');
        }
      } catch (err: any) {
        if (generation !== generationRef.current) {
          addLog('GENERATION', `[gen:${generation}] STALE - ignoring error: ${err.name}`);
          return;
        }
        addLog('CATCH', `[gen:${generation}] Error: name=${err.name}, message=${err.message}`);
        console.error('[QRScanner] Camera error:', err);
        setHasCamera(false);
        if (err.name === 'NotAllowedError') {
          onErrorRef.current('カメラの使用が許可されていません。');
        } else if (err.name === 'NotFoundError') {
          onErrorRef.current('カメラが見つかりません。');
        } else {
          onErrorRef.current('カメラを起動できませんでした。');
        }
      }
    };

    startCamera();

    return () => {
      addLog('CLEANUP', `[gen:${generation}] useEffect cleanup fired`);
      stopCamera();
    };
  }, [scanFrame, stopCamera, addLog]);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  return (
    <div className="qr-scanner">
      <div className="qr-scanner-video-container">
        {hasCamera ? (
          <>
            <video
              ref={videoRef}
              className="qr-scanner-video"
              playsInline
              muted
            />
            <div className="qr-scanner-overlay">
              <div className="qr-scanner-frame" />
            </div>
          </>
        ) : (
          <div className="qr-scanner-fallback">
            <AlertCircle size={48} />
            <p>カメラが利用できません</p>
            <p className="fallback-hint">
              接続情報を手動で貼り付けてください
            </p>
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      <div className="qr-scanner-status">
        {statusMessage}
      </div>

      {/* Diagnostic Panel */}
      {diagLogs.length > 0 && (
        <div className="qr-diag-panel">
          <div className="qr-diag-header">DIAGNOSTIC LOG</div>
          <div className="qr-diag-entries">
            {diagLogs.map((log, i) => (
              <div key={i} className="qr-diag-entry">
                <span className="qr-diag-time">{log.time}</span>
                <span className="qr-diag-step">[{log.step}]</span>
                <span className="qr-diag-detail">{log.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button className="btn btn-close-scanner" onClick={handleClose}>
        <X size={16} />
        閉じる
      </button>
    </div>
  );
};
