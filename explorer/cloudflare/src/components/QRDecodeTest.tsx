import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, CameraOff, AlertCircle, Check } from 'lucide-react';

interface QRDecodeTestProps {
  onClose: () => void;
}

type TestStatus = 'idle' | 'starting' | 'scanning' | 'detected' | 'error' | 'no-barcode-detector';

interface ScanResult {
  rawValue: string;
  format: string;
  timestamp: number;
}

export const QRDecodeTest: React.FC<QRDecodeTestProps> = ({ onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const activeRef = useRef<boolean>(false);

  const [status, setStatus] = useState<TestStatus>('idle');
  const [barcodeDetectorSupported, setBarcodeDetectorSupported] = useState<boolean | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanCount, setScanCount] = useState<number>(0);
  const [cameraError, setCameraError] = useState<{ name: string; message: string } | null>(null);

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

  const scanFrame = useCallback(async () => {
    if (!activeRef.current) return;
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      if (activeRef.current) {
        animFrameRef.current = requestAnimationFrame(scanFrame);
      }
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
      const barcodes = await barcodeDetector.detect(canvas);

      if (barcodes.length > 0 && activeRef.current) {
        setScanResult({
          rawValue: barcodes[0].rawValue,
          format: barcodes[0].format,
          timestamp: Date.now(),
        });
        setScanCount((c) => c + 1);
      }
    } catch {
      // BarcodeDetector not supported or error - ignore, keep scanning
    }

    if (activeRef.current) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
    }
  }, []);

  const startCamera = useCallback(async () => {
    activeRef.current = true;
    setStatus('starting');
    setCameraError(null);
    setScanResult(null);
    setScanCount(0);

    const isBarcodeDetectorAvailable = typeof BarcodeDetector !== 'undefined';
    setBarcodeDetectorSupported(isBarcodeDetectorAvailable);

    if (!isBarcodeDetectorAvailable) {
      setStatus('no-barcode-detector');
      return;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus('error');
        setCameraError({
          name: 'NotSupported',
          message: 'navigator.mediaDevices.getUserMedia がサポートされていません',
        });
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
        },
      });

      if (!activeRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStatus('scanning');
      animFrameRef.current = requestAnimationFrame(scanFrame);
    } catch (err: any) {
      if (!activeRef.current) return;
      setStatus('error');
      setCameraError({
        name: err.name || 'Unknown',
        message: err.message || 'エラー詳細なし',
      });
    }
  }, [scanFrame]);

  useEffect(() => {
    startCamera();

    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  const handleStop = useCallback(() => {
    stopCamera();
    setStatus('idle');
  }, [stopCamera]);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  return (
    <div className="camera-test">
      <div className="camera-test-video-container">
        <video
          ref={videoRef}
          className="camera-test-video"
          playsInline
          muted
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {status === 'starting' && (
          <div className="camera-test-overlay">
            カメラを起動しています…
          </div>
        )}
        {status === 'no-barcode-detector' && (
          <div className="camera-test-overlay camera-test-overlay-error">
            <AlertCircle size={32} />
            BarcodeDetector はこのブラウザで利用できません
          </div>
        )}
        {status === 'error' && (
          <div className="camera-test-overlay camera-test-overlay-error">
            <AlertCircle size={32} />
            カメラ起動失敗
          </div>
        )}
      </div>

      <div className="camera-test-info">
        <div className="camera-test-status-row">
          <span className="camera-test-label">BarcodeDetector:</span>
          <span className={`camera-test-value ${barcodeDetectorSupported ? 'camera-test-status-success' : 'camera-test-status-error'}`}>
            {barcodeDetectorSupported === null
              ? '確認中…'
              : barcodeDetectorSupported
                ? '利用可能'
                : '利用不可'}
          </span>
        </div>

        <div className="camera-test-status-row">
          <span className="camera-test-label">状態:</span>
          <span className={`camera-test-value camera-test-status-${status === 'scanning' ? 'starting' : status}`}>
            {status === 'idle' && '待機中'}
            {status === 'starting' && 'カメラを起動しています…'}
            {status === 'scanning' && 'スキャン中…'}
            {status === 'detected' && '検出成功'}
            {status === 'error' && 'エラー'}
            {status === 'no-barcode-detector' && 'BarcodeDetector利用不可'}
          </span>
        </div>

        {scanResult && (
          <div className="camera-test-status-row" style={{ flexDirection: 'column', gap: '4px' }}>
            <span className="camera-test-label">
              <Check size={12} style={{ color: 'var(--g2-green)', verticalAlign: 'middle', marginRight: '4px' }} />
              検出結果 (#{scanCount}):
            </span>
            <pre className="qr-decode-result">{scanResult.rawValue}</pre>
            <span className="camera-test-label" style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
              format: {scanResult.format}
            </span>
          </div>
        )}

        {!scanResult && status === 'scanning' && (
          <div className="camera-test-status-row">
            <span className="camera-test-label">検出:</span>
            <span className="camera-test-value" style={{ color: 'var(--text-dim)' }}>
              QRコードをカメラに向けてください…
            </span>
          </div>
        )}

        {cameraError && (
          <div className="camera-test-error-detail">
            <div className="camera-test-status-row">
              <span className="camera-test-label">error.name:</span>
              <span className="camera-test-value camera-test-error-name">{cameraError.name}</span>
            </div>
            <div className="camera-test-status-row">
              <span className="camera-test-label">error.message:</span>
              <span className="camera-test-value">{cameraError.message}</span>
            </div>
          </div>
        )}
      </div>

      <div className="camera-test-actions">
        {(status === 'scanning' || status === 'detected') && (
          <button className="btn btn-sm" onClick={handleStop}>
            <CameraOff size={14} />
            カメラ停止
          </button>
        )}
        {(status === 'error' || status === 'no-barcode-detector') && (
          <button className="btn btn-sm btn-primary" onClick={startCamera}>
            <Camera size={14} />
            再試行
          </button>
        )}
        <button className="btn btn-sm" onClick={handleClose}>
          <X size={14} />
          閉じる
        </button>
      </div>
    </div>
  );
};
