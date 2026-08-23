import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, AlertCircle } from 'lucide-react';

interface QRScannerProps {
  onScan: (data: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
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
  const [hasCamera, setHasCamera] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string>('カメラを起動中...');

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
  }, []);

  const scanFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      if (typeof BarcodeDetector !== 'undefined') {
        const barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
        const barcodes = await barcodeDetector.detect(canvas);
        if (barcodes.length > 0) {
          const data = barcodes[0].rawValue;
          stopCamera();
          onScan(data);
          return;
        }
      }
    } catch (err) {
      console.warn('[QRScanner] BarcodeDetector error:', err);
    }

    animFrameRef.current = requestAnimationFrame(scanFrame);
  }, [stopCamera, onScan]);

  useEffect(() => {
    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setHasCamera(false);
          onError('カメラへのアクセスがサポートされていません。');
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setStatusMessage('QRコードをカメラに向けてください');
          animFrameRef.current = requestAnimationFrame(scanFrame);
        }
      } catch (err: any) {
        console.error('[QRScanner] Camera error:', err);
        setHasCamera(false);
        if (err.name === 'NotAllowedError') {
          onError('カメラの使用が許可されていません。');
        } else if (err.name === 'NotFoundError') {
          onError('カメラが見つかりません。');
        } else {
          onError('カメラを起動できませんでした。');
        }
      }
    };

    startCamera();

    return () => {
      stopCamera();
    };
  }, [scanFrame, stopCamera, onError]);

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

      <button className="btn btn-close-scanner" onClick={handleClose}>
        <X size={16} />
        閉じる
      </button>
    </div>
  );
};
