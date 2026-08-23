import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, CameraOff, AlertCircle } from 'lucide-react';

interface CameraTestProps {
  onClose: () => void;
}

type CameraStatus = 'idle' | 'starting' | 'success' | 'error';

interface CameraError {
  name: string;
  message: string;
  stack?: string;
}

export const CameraTest: React.FC<CameraTestProps> = ({ onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [cameraError, setCameraError] = useState<CameraError | null>(null);
  const [trackInfo, setTrackInfo] = useState<string>('');

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTrackInfo('');
  }, []);

  const startCamera = useCallback(async () => {
    setStatus('starting');
    setCameraError(null);
    setTrackInfo('');

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

      streamRef.current = stream;

      const tracks = stream.getVideoTracks();
      if (tracks.length > 0) {
        const track = tracks[0];
        const settings = track.getSettings();
        setTrackInfo(
          `track: ${track.label} | ` +
          `facing: ${settings.facingMode || 'N/A'} | ` +
          `${settings.width || '?'}x${settings.height || '?'}`
        );
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setCameraError({
        name: err.name || 'Unknown',
        message: err.message || 'エラー詳細なし',
        stack: err.stack,
      });
    }
  }, []);

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
        {status === 'starting' && (
          <div className="camera-test-overlay">
            カメラを起動しています…
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
          <span className="camera-test-label">状態:</span>
          <span className={`camera-test-value camera-test-status-${status}`}>
            {status === 'idle' && '待機中'}
            {status === 'starting' && 'カメラを起動しています…'}
            {status === 'success' && 'カメラ起動成功'}
            {status === 'error' && 'カメラ起動失敗'}
          </span>
        </div>

        {trackInfo && (
          <div className="camera-test-status-row">
            <span className="camera-test-label">トラック:</span>
            <span className="camera-test-value">{trackInfo}</span>
          </div>
        )}

        {cameraError && (
          <div className="camera-test-error-detail">
            <div className="camera-test-status-row">
              <span className="camera-test-label">error.name:</span>
              <span className="camera-test-value camera-test-error-name">
                {cameraError.name}
              </span>
            </div>
            <div className="camera-test-status-row">
              <span className="camera-test-label">error.message:</span>
              <span className="camera-test-value">{cameraError.message}</span>
            </div>
          </div>
        )}
      </div>

      <div className="camera-test-actions">
        {status === 'success' && (
          <button className="btn btn-sm" onClick={handleStop}>
            <CameraOff size={14} />
            カメラ停止
          </button>
        )}
        {status === 'error' && (
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
