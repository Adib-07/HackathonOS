---
name: React/Vite cache diagnosis
description: Distinguishes a real React dependency mismatch from stale optimized browser bundles in HackathonOS.
---

When a React runtime mismatch appears, compare the lockfile, the app's resolved package versions, and Vite's optimized dependency metadata before changing React pins. A stale prebundle can report an obsolete React or React DOM version even when the active dependency graph is aligned.

**Why:** HackathonOS had a runtime mismatch overlay while its installed packages and lockfile already resolved React and React DOM to the same version. Refreshing the generated Vite cache and restarting removed the mismatch without another package change.

**How to apply:** Use this diagnosis when the error names versions that do not match the app's resolved packages. Only refresh the generated Vite cache after confirming its metadata is stale; then restart and verify Preview.
