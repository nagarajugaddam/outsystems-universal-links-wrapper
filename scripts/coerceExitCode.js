#!/usr/bin/env node
// Ensures process.exitCode setter and process.exit won't receive string codes
module.exports = function(context) {
  try {
    const proc = process;
    const desc = Object.getOwnPropertyDescriptor(proc, 'exitCode');
    if (desc && desc.configurable) {
      let _exitCode = proc.exitCode;
      Object.defineProperty(proc, 'exitCode', {
        configurable: true,
        enumerable: true,
        get() { return _exitCode; },
        set(v) {
          if (typeof v === 'string') {
            const n = parseInt(v, 10);
            _exitCode = Number.isFinite(n) ? n : 1;
          } else if (typeof v === 'number') {
            _exitCode = v;
          } else {
            _exitCode = 1;
          }
        }
      });
      console.log('coerceExitCode: patched process.exitCode setter.');
    } else {
      // Fallback: wrap process.exit
      const origExit = proc.exit;
      proc.exit = function(code) {
        if (typeof code === 'string') {
          const n = parseInt(code, 10);
          code = Number.isFinite(n) ? n : 1;
        }
        return origExit.call(proc, code);
      };
      console.log('coerceExitCode: patched process.exit fallback.');
    }
  } catch (err) {
    console.warn('coerceExitCode: failed to apply patch:', err && (err.stack || err.message || err));
  }
};
