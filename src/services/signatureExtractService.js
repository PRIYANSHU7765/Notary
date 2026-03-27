/**
 * Signature Extraction Service
 * Handles Python-based signature detection
 */

const { spawn } = require('child_process');
const { SIGNATURE_PYTHON_EXECUTABLE, SIGNATURE_PYTHON_TIMEOUT_MS, SIGNATURE_PYTHON_SCRIPT } = require('../utils/env');

function runPythonSignatureExtractor(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(SIGNATURE_PYTHON_EXECUTABLE, [SIGNATURE_PYTHON_SCRIPT], {
      env: {
        ...process.env,
        HF_HUB_DISABLE_SYMLINKS: '1',
        HF_HUB_DISABLE_SYMLINKS_WARNING: '1',
      },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeoutMs = Number.isFinite(SIGNATURE_PYTHON_TIMEOUT_MS) && SIGNATURE_PYTHON_TIMEOUT_MS > 0
      ? SIGNATURE_PYTHON_TIMEOUT_MS
      : 120000;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        // no-op
      }
      reject(new Error(`Python signature extractor timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`Failed to start python process: ${err?.message || err}`));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`Python extractor failed (exit ${code}): ${stderr || 'No stderr output'}`));
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(stdout || '{}');
      } catch {
        reject(new Error(`Invalid extractor response. stderr: ${stderr || 'none'}`));
        return;
      }

      if (!parsed?.ok) {
        reject(new Error(parsed?.error || stderr || 'Signature extractor failed'));
        return;
      }

      resolve(parsed);
    });

    try {
      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Failed to send payload to extractor: ${err?.message || err}`));
      }
    }
  });
}

module.exports = {
  runPythonSignatureExtractor,
};
