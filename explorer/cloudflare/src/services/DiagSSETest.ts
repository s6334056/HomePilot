// DIAG-SSE-TEST: Temporary diagnostic EventSource test
// This module tests whether EventSource/SSE works in the current WebView/browser
// by connecting to the Gateway's pure diagnostic SSE endpoint (no OpenCode dependency).
// TO BE REMOVED after diagnosis is complete.

import { resolveConfig } from './ConnectionConfig';

export function runDiagSSETest(): void {
  const config = resolveConfig();
  if (config.mode !== 'gateway' || !config.gatewayToken) {
    console.log(`[DIAG-SSE-TEST] skipped: no gateway config`);
    return;
  }

  const diagUrl = `${config.gatewayUrl}/api/diag/sse`;

  console.log(`[DIAG-SSE-TEST] starting diagnostic SSE test`);
  console.log(`[DIAG-SSE-TEST] url: ${config.gatewayUrl}/api/diag/sse`);

  let eventSource: EventSource;

  try {
    console.log(`[DIAG-SSE-TEST] creating EventSource...`);
    eventSource = new EventSource(diagUrl);
    console.log(`[DIAG-SSE-TEST] EventSource created`);
    console.log(`[DIAG-SSE-TEST] readyState after create: ${eventSource.readyState} (CONNECTING=0, OPEN=1, CLOSED=2)`);
  } catch (e) {
    console.log(`[DIAG-SSE-TEST] EventSource constructor FAILED:`, e);
    return;
  }

  eventSource.onopen = () => {
    console.log(`[DIAG-SSE-TEST] onopen`);
    console.log(`[DIAG-SSE-TEST] readyState: ${eventSource.readyState}`);
  };

  eventSource.onmessage = (event: MessageEvent) => {
    console.log(`[DIAG-SSE-TEST] onmessage`);
    console.log(`[DIAG-SSE-TEST] readyState: ${eventSource.readyState}`);
    console.log(`[DIAG-SSE-TEST] event data length: ${event.data?.length ?? 'null'}`);
    try {
      const parsed = JSON.parse(event.data);
      console.log(`[DIAG-SSE-TEST] event type: ${parsed.type}, seq: ${parsed.seq}`);
      if (parsed.type === 'done') {
        console.log(`[DIAG-SSE-TEST] test complete - SSE is WORKING in this WebView`);
        eventSource.close();
        console.log(`[DIAG-SSE-TEST] EventSource closed`);
      }
    } catch {
      console.log(`[DIAG-SSE-TEST] raw event data: ${event.data}`);
    }
  };

  eventSource.onerror = () => {
    const readyState = eventSource.readyState;
    const readyStateName = readyState === 0 ? 'CONNECTING' : readyState === 1 ? 'OPEN' : readyState === 2 ? 'CLOSED' : 'UNKNOWN';
    console.log(`[DIAG-SSE-TEST] onerror`);
    console.log(`[DIAG-SSE-TEST] readyState: ${readyState} (${readyStateName})`);
    console.log(`[DIAG-SSE-TEST] url: ${config.gatewayUrl}/api/diag/sse`);
    if (readyState === 2) {
      console.log(`[DIAG-SSE-TEST] EventSource CLOSED - SSE may NOT be working in this WebView`);
    }
  };

  // Safety timeout: close after 15 seconds if nothing happens
  setTimeout(() => {
    const readyState = eventSource.readyState;
    console.log(`[DIAG-SSE-TEST] safety timeout - readyState: ${readyState}`);
    if (readyState !== 2) {
      eventSource.close();
      console.log(`[DIAG-SSE-TEST] EventSource closed by safety timeout`);
    }
  }, 15000);
}
