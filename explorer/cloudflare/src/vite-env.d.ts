/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FILE_SERVICE_MODE: 'mock' | 'gateway';
  readonly VITE_GATEWAY_URL: string;
  readonly VITE_GATEWAY_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
