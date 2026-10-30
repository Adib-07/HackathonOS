# Screenshot Guidelines

This folder contains screenshots for the README and documentation.

## Required Screenshots

| Filename           | View                    | Description                                                            |
| ------------------ | ----------------------- | ---------------------------------------------------------------------- |
| `overview.png`     | Dashboard               | Landing page after sign-in, showing next action, competition summary   |
| `competitions.png` | Competitions List       | Table of competitions with deadlines, status badges                    |
| `workflow.png`     | Workflow / Lifecycle    | All 10 stages with progress bars, locked/unlocked states               |
| `planner.png`      | Planner / Task Board    | Task groups by phase, status dropdowns, evidence panel                 |
| `intel.png`        | Intelligence            | Analysis/Research/Gaps/Ideas/Briefs tabs                               |
| `settings.png`     | Settings & Integrations | Workspace identity, competition defaults, connected tools, danger zone |

## Capture Instructions

### Prerequisites

```bash
# Start dev servers
cd artifacts/api-server
PORT=8080 DATABASE_URL=... CLERK_SECRET_KEY=... CLERK_PUBLISHABLE_KEY=... pnpm run dev &

cd ../hackathon-os
PORT=19678 BASE_PATH=/ API_PROXY_ORIGIN=http://127.0.0.1:8080 pnpm run dev &
```

### Capture Steps (macOS)

1. Open `http://localhost:19678`
2. Sign in with Clerk test user
3. Navigate to each view
4. **Cmd+Shift+4** → Space → Click window → Save to `docs/images/`
5. Use **dark mode** (default) for consistency
6. Browser width: **1440px** (or resize to 1440×900)
7. Hide browser UI (Cmd+Shift+F for fullscreen if needed)

### Capture Steps (Linux/Windows)

- **Linux**: `gnome-screenshot -w` or `flameshot gui`
- **Windows**: `Win+Shift+S` → select window

## Image Specifications

| Property         | Value                                       |
| ---------------- | ------------------------------------------- |
| Format           | PNG (lossless)                              |
| Max width        | 1440px                                      |
| Background       | App dark theme (`#191d24`)                  |
| No personal data | Redact emails, keys, real competition names |
| Naming           | `kebab-case.png`                            |

## Placeholder Note

Until real screenshots are captured, the README references these files with TODO comments. Replace placeholders with actual images before major releases.

## Updating Screenshots

When UI changes significantly:

1. Re-capture affected views
2. Overwrite existing files in `docs/images/`
3. Commit with message: `docs: update screenshots for [view name]`
