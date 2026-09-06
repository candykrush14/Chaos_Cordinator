# Screenshot manifest for `BLOG.md`

Capture at **1440×900**, light theme, signed in with a real (non-sensitive) reflection in the canvas.
File names must match exactly — `BLOG.md` links to them by number.

## Overview / architecture

| File | Shot |
| --- | --- |
| `01-hero.png` | Landing page left, active reflection session right |
| `02-navbar.png` | Top nav with all six tabs + role badge |
| `03-architecture.png` | Architecture diagram (browser → Express → Gemini/Firestore/Maps) |

## Feature sections

| File | Shot |
| --- | --- |
| `04-journal-canvas.png` | Sidebar + multi-turn conversation + mode toggle + composer |
| `05-retry-save.png` | Amber "Retry Save" banner, text preserved in composer |
| `06-discover-me.png` | Happiness ring, emotion bars, four pillars |
| `07-nudges.png` | Three daily nudges, one claimed |
| `08-location-picker.png` | "Pin Location to Reflection" modal, live map + autocomplete |
| `09-locations-map.png` | Clustered pins, one entry card open |
| `10-share-modal.png` | Share modal: email field, viewer/editor selector, active shares |
| `11-shared-view.png` | Shared tab → "Shared with Me" with permission badges |
| `12-admin-directive.png` | Directive & Architecture pane, four green checks |
| `13-admin-roles.png` | RBAC pane: role table + session simulator |
| `14-webhooks.png` | Profile → Integrations, Discord endpoint with masked URL |
| `15-discord-embed.png` | The resulting rich embed in a Discord channel |

## Guided demo (Stops 0–11)

| File | Stop | Shot |
| --- | --- | --- |
| `16-landing.png` | 0 | Unauthenticated landing, three pillars |
| `17-first-signin.png` | 1 | Signed-in header, empty canvas, starter cards |
| `18-prompt-starters.png` | 2 | Four starter cards, "Emotions" hovered |
| `19-first-reply.png` | 2 | First AI reply + model tag + "Saved & Isolated" badge |
| `20-modes.png` | 3 | One thread: Reflect → Brainstorm → Summarize turns |
| `21-pin-location.png` | 4 | Pin modal with a location selected |
| `22-location-card.png` | 4 | Toolbar badge pill + Location Map Card in stream |
| `23-search.png` | 5 | Sidebar filtered by search term |
| `24-locations-view.png` | 5 | Clustered pins, one selected |
| `25-discover-top.png` | 6 | Happiness Index ring, delta, mood labels |
| `26-discover-pillars.png` | 6 | Four Healthy Living Pillars with statuses |
| `27-discover-points.png` | 6 | Level, streak, badges, points history |
| `28-share-grant.png` | 7 | Granting viewer access by email |
| `29-viewer-mode.png` | 7 | Read-only banner where the composer would be |
| `30-add-webhook.png` | 8 | Endpoint form: destination, events, filters |
| `31-masked-url.png` | 8 | Saved endpoint, masked preview + last delivery status |
| `32-audit.png` | 9 | Four green audit checks |
| `33-role-sim.png` | 9 | Role switcher mid-simulation, Admin tab hidden |
| `34-retry.png` | 10 | Offline retry banner, text preserved |
| `35-export-delete.png` | 11 | Exported Markdown + delete confirmation modal |
| `36-footer.png` | — | Final wide shot, ideally Discover Me |

## Before publishing

- Redact the real admin email (`shreyasrivastava0407@gmail.com`) from any admin/RBAC screenshot.
- Redact webhook URLs — verify only the masked `urlPreview` is visible.
- Use a demo Google account, not a personal one, for the header avatar/name.
- Never show a Maps or Gemini key, including in devtools panels.
