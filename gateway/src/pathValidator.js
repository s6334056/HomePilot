import { resolve, normalize, relative, isAbsolute } from 'node:path';
import { realpathSync } from 'node:fs';

export function validatePath(requestedPath, rootPath) {
  if (!requestedPath || typeof requestedPath !== 'string') {
    return { valid: false, error: 'INVALID_REQUEST' };
  }

  if (!isAbsolute(requestedPath)) {
    return { valid: false, error: 'INVALID_REQUEST' };
  }

  const normalized = normalize(requestedPath);
  const resolved = resolve(normalized);

  const rootNormalized = normalize(rootPath);
  const rootResolved = resolve(rootNormalized);

  const rel = relative(rootResolved, resolved);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    try {
      const real = realpathSync(resolved);
      const realRel = relative(rootResolved, real);
      if (realRel === '' || (!realRel.startsWith('..') && !isAbsolute(realRel))) {
        return { valid: true, resolvedPath: real };
      }
    } catch {
      return { valid: true, resolvedPath: resolved };
    }
  }

  return { valid: false, error: 'FORBIDDEN' };
}

export function isTextFile(_filePath, content) {
  if (content.includes('\0')) return false;
  return true;
}
