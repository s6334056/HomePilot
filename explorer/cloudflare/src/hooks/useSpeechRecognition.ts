import { useState, useRef, useCallback } from 'react';

type SpeechState = 'idle' | 'recording' | 'transcribing' | 'completed' | 'error';

interface UseSpeechRecognitionOptions {
  gatewayUrl: string;
  gatewayToken: string;
}

interface UseSpeechRecognitionReturn {
  state: SpeechState;
  error: string | null;
  result: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancel: () => void;
  reset: () => void;
}

const MAX_RECORDING_MS = 60_000;

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/wav',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

export function useSpeechRecognition({
  gatewayUrl,
  gatewayToken,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn {
  const [state, setState] = useState<SpeechState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setResult(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Microphone is not supported in this browser.');
      setState('error');
      return;
    }

    const mimeType = pickMimeType();
    if (!mimeType) {
      setError('No supported audio format found.');
      setState('error');
      return;
    }
    mimeTypeRef.current = mimeType;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Microphone access denied.';
      setError(msg);
      setState('error');
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = async () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];
      cleanup();

      if (blob.size === 0) {
        setError('No audio data captured.');
        setState('error');
        return;
      }

      setState('transcribing');

      try {
        const arrayBuffer = await blob.arrayBuffer();

        const res = await fetch(`${gatewayUrl}/api/speech/transcribe`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${gatewayToken}`,
            'Content-Type': mimeType,
          },
          body: arrayBuffer,
        });

        const json = await res.json();

        if (!res.ok) {
          const msg = json?.error?.message || `Gateway returned HTTP ${res}`;
          setError(msg);
          setState('error');
          return;
        }

        if (typeof json.text !== 'string' || !json.text.trim()) {
          setError('No speech detected.');
          setState('error');
          return;
        }

        setResult(json.text);
        setState('completed');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to connect to Gateway.';
        setError(msg);
        setState('error');
      }
    };

    recorder.start();
    setState('recording');

    timerRef.current = setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    }, MAX_RECORDING_MS);
  }, [gatewayUrl, gatewayToken, cleanup]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    cleanup();
    setState('idle');
    setError(null);
    setResult(null);
  }, [cleanup]);

  const reset = useCallback(() => {
    cleanup();
    setState('idle');
    setError(null);
    setResult(null);
  }, [cleanup]);

  return { state, error, result, startRecording, stopRecording, cancel, reset };
}
