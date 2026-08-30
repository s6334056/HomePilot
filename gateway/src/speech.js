import { request as httpsRequest } from 'node:https';
import { CONFIG } from './config.js';
import { json, errorResponse } from './handlers.js';

function readBodyWithLimit(request, maxSize) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;

    request.on('data', (chunk) => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        request.destroy();
        reject(new Error('AUDIO_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      if (totalSize === 0) {
        resolve(null);
      } else {
        resolve(Buffer.concat(chunks));
      }
    });

    request.on('error', reject);
  });
}

export async function handleSpeechTranscribe(request, response) {
  if (!CONFIG.WORKER_URL) {
    return errorResponse(response, 500, 'INTERNAL_ERROR', 'Worker URL is not configured.');
  }

  const contentType = request.headers['content-type'];
  if (!contentType || !CONFIG.ALLOWED_AUDIO_TYPES.has(contentType)) {
    return errorResponse(response, 400, 'INVALID_REQUEST', `Unsupported Content-Type. Allowed: ${[...CONFIG.ALLOWED_AUDIO_TYPES].join(', ')}`);
  }

  let audioBuffer;
  try {
    audioBuffer = await readBodyWithLimit(request, CONFIG.MAX_AUDIO_SIZE);
  } catch (err) {
    if (err.message === 'AUDIO_TOO_LARGE') {
      return errorResponse(response, 413, 'AUDIO_TOO_LARGE', `Audio data exceeds the ${CONFIG.MAX_AUDIO_SIZE} byte limit.`);
    }
    return errorResponse(response, 500, 'INTERNAL_ERROR', 'An internal server error occurred.');
  }

  if (!audioBuffer) {
    return errorResponse(response, 400, 'NO_AUDIO_DATA', 'No audio data in request body.');
  }

  let workerUrl;
  try {
    workerUrl = new URL(CONFIG.WORKER_URL);
  } catch {
    return errorResponse(response, 500, 'INTERNAL_ERROR', 'Invalid Worker URL configuration.');
  }

  const workerResponse = await sendToWorker(workerUrl, contentType, audioBuffer);
  if (workerResponse.error) {
    return errorResponse(response, workerResponse.status, workerResponse.error, workerResponse.message);
  }

  const text = workerResponse.data.text || '';
  const language = workerResponse.data.transcription_info?.language || '';

  json(response, 200, { text, language });
}

function sendToWorker(workerUrl, contentType, audioBuffer) {
  return new Promise((resolve) => {
    const options = {
      hostname: workerUrl.hostname,
      port: workerUrl.port || 443,
      path: workerUrl.pathname || '/',
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Content-Length': audioBuffer.length,
        'Authorization': `Bearer ${CONFIG.WORKER_SECRET_TOKEN}`,
      },
      timeout: CONFIG.WORKER_TIMEOUT,
    };

    const req = httpsRequest(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');

        if (res.statusCode === 401) {
          resolve({ error: 'WORKER_AUTH_FAILED', status: 502, message: 'Worker authentication failed.' });
          return;
        }

        if (res.statusCode !== 200) {
          resolve({ error: 'WORKER_ERROR', status: 502, message: `Worker returned HTTP ${res.statusCode}.` });
          return;
        }

        let data;
        try {
          data = JSON.parse(body);
        } catch {
          resolve({ error: 'WORKER_INVALID_RESPONSE', status: 502, message: 'Invalid JSON response from Worker.' });
          return;
        }

        if (typeof data.text !== 'string') {
          resolve({ error: 'WORKER_INVALID_RESPONSE', status: 502, message: 'Worker response missing text field.' });
          return;
        }

        resolve({ data });
      });
    });

    req.on('error', () => {
      resolve({ error: 'WORKER_UNREACHABLE', status: 502, message: 'Worker is not reachable.' });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ error: 'WORKER_TIMEOUT', status: 504, message: 'Worker did not respond in time.' });
    });

    req.write(audioBuffer);
    req.end();
  });
}
