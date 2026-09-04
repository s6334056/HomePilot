// DIAG-API-TEST: Temporary diagnostic — tests OpenCode HTTP API reachability from WebView
// Uses existing OpenCodeClient.getSessions() via existing Gateway proxy path.
// TO BE REMOVED after diagnosis is complete.

import { resolveConfig } from './ConnectionConfig';
import { OpenCodeClient } from './OpenCodeClient';

export async function runDiagAPITest(): Promise<void> {
  const config = resolveConfig();

  console.log(`[DIAG-API-TEST] starting OpenCode API test`);

  if (config.mode !== 'gateway' || !config.gatewayToken) {
    console.log(`[DIAG-API-TEST] skipped: no gateway config (mode=${config.mode})`);
    return;
  }

  const client = new OpenCodeClient({
    gatewayUrl: config.gatewayUrl,
    gatewayToken: config.gatewayToken,
  });

  const testUrl = `${config.gatewayUrl}/api/opencode/experimental/session?archived=true`;
  console.log(`[DIAG-API-TEST] GET ${testUrl}`);

  try {
    console.log(`[DIAG-API-TEST] calling client.getSessions()...`);
    const sessions = await client.getSessions();
    console.log(`[DIAG-API-TEST] getSessions() returned ${sessions.length} sessions`);

    if (sessions.length > 0) {
      const first = sessions[0];
      console.log(`[DIAG-API-TEST] first session: id=${first.id} title=${first.title ?? '(no title)'}`);
    }

    console.log(`[DIAG-API-TEST] SUCCESS - OpenCode HTTP API is reachable from this WebView`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[DIAG-API-TEST] FAILED: ${msg}`);
    if (msg.includes('fetch')) {
      console.log(`[DIAG-API-TEST] hint: fetch itself failed — network/CORS/TLS issue`);
    } else if (msg.includes('401') || msg.includes('403')) {
      console.log(`[DIAG-API-TEST] hint: auth error — token mismatch`);
    } else if (msg.includes('502')) {
      console.log(`[DIAG-API-TEST] hint: Gateway cannot reach OpenCode Server`);
    } else if (msg.includes('OpenCode API error')) {
      console.log(`[DIAG-API-TEST] hint: OpenCode Server returned an error`);
    }
  }
}
