/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FILE_SERVICE_MODE: 'mock' | 'gateway';
  readonly VITE_GATEWAY_URL: string;
  readonly VITE_GATEWAY_TOKEN: string;
  readonly VITE_OPENCODE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface BarcodeDetectorOptions {
  formats: string[];
}

interface DetectedBarcode {
  rawValue: string;
  format: string;
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  detect(source: CanvasImageSource | HTMLCanvasElement): Promise<DetectedBarcode[]>;
}
