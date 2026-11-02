# Tavri

Tavri is a personal activity journal: a small, dependable place to record your work and review your week.

**Tagline:** Your work, clearly recorded.

## Name

Use **Tavri** in prose, window titles and installer names. Use lowercase **tavri** for the wordmark, CLI, package name and file paths. The proposed pronunciation is “tav-ree”.

The name replaces CGI Worktrace / Tart. Historical release notes and migration compatibility names retain the old identity where needed. The hosted Git repository has not been renamed during this local change.

## Mark

The mark combines a lowercase “t” and a small circular point. It suggests a short entry placed on a timeline. Keep it simple enough to recognize in the dock and tray.

- `assets/tavri-icon.svg`: editable master icon, with transparent outer corners.
- `assets/tavri-mark.svg`: equivalent vector mark used in the application header.
- `assets/tavri-icon.png`: generated 1024-pixel source for desktop icons.
- `assets/tavri-icon.icns` and `.ico`: generated native formats.

Regenerate with `npm run icons` on macOS with Chrome installed. The starter generator copies these icons into the generated app's assets.

## Palette

| Role | Color |
| --- | --- |
| Graphite | `#202524` |
| Warm paper | `#F7F5F0` |
| Red brand mark / dark-theme action | `#F5636F` |
| Light-theme red action | `#B42332` |
| Dark-theme yellow action | `#E0BE46` |
| Light-theme dark-yellow action | `#765A00` |
| White accent | `#FFFFFF` |
| Light surface | `#FFFEFB` |
| Dark surface | `#282E2C` |

Red is the default accent for System, Light and Dark. The user can choose dark yellow or white under Settings → Accent color; the application selects a lighter yellow for dark surfaces and a darker yellow for light surfaces. White uses graphite text on buttons in both themes, plus graphite outlines and text accents in Light so white controls remain visible. Use graphite text on the other dark-theme action colors and white text on the other light-theme action colors. Treat contrast as a measured UI requirement when extending the palette.

## Interface and voice

Use system sans-serif typography, restrained weights, clear labels and comfortable spacing. Reserve monospace for dates, file paths and raw data. Prioritize the activity description over optional details. Use solid surfaces with quiet borders, a single primary action and recognizable error states.

Write short, direct English UI text: “Add”, “Activity”, “Project”, “Entry added.” Avoid exposing file-format syntax as a product concept. Full structured metadata presentation is part of the development roadmap.

## Optional appearances

The Tavri mark keeps its shape across themes. The native icon uses brand red; the in-app header mark follows the active accent. Additional CSS in `desktop/themes.css` provides High contrast Dark/Light/Amber, Star Trek · LCARS and Star Wars · Holoterminal. High-contrast views use patterns as well as color for contribution intensity. The two sci-fi treatments change panel geometry and interface colors using original CSS, without external fonts, images or animation. Theme IDs, labels and gallery swatches live in `appearanceThemes` in `desktop/renderer.cjs`.

See [interface references](./DESIGN-REFERENCES.md) for the researched projects, design decisions and validation limits. The appearance gallery groups miniature layout previews into Everyday, High contrast and Flight decks.
