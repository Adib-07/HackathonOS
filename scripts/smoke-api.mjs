// Smoke test for the API bundle
// Imports the built bundle with NO env vars and asserts it loads successfully

import('../api/index.mjs')
  .then((m) => console.log('OK', typeof m.default))
  .catch((e) => {
    console.error('FAIL', e);
    process.exit(1);
  });