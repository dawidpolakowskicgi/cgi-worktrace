# Tavri interface references

Reviewed on 30 October 2026. These references informed the local interface refinement; no external implementation, fonts or artwork were imported.

| Reference | Relevant ideas | Application in Tavri |
| --- | --- | --- |
| [TheLCARS theme collection](https://www.thelcars.com/themes/) and [Voyager demo](https://www.thelcars.com/themes/voyager.html) | Connected curved rails, pastel navigation blocks and condensed headings on black | LCARS workspace frame, segmented header and navigation, restrained panel accents |
| [louh/lcars](https://github.com/louh/lcars) | Responsive LCARS interface structures | Keep the recognizable geometry while preserving usable controls at smaller window sizes |
| [Mungo Horey's portfolio](https://mungohorey.com/) | Screen design for Star Wars productions, including Rogue One and Andor; framed controls and clear visual hierarchy | Holoterminal uses thin blue frames, amber actions, square controls and readable activity data |
| [Arwes](https://github.com/arwes/arwes) | Futuristic interface panels and framing | Small corner details and consistent panel boundaries; no framework dependency or animation added |
| [Microsoft high-contrast guidance](https://learn.microsoft.com/en-us/windows/apps/design/accessibility/high-contrast-themes) | Limited palettes, meaningful boundaries and system accessibility support | Strong focus, patterned contribution levels, legible metadata and simpler row boundaries |
| [Rebel Rebel](https://github.com/signaldirective/rebel-rebel) | Rebel Alliance command palette | Navy surfaces, warm red markers and a clear navigation rail |
| [Grogu mdBook theme](https://github.com/francis-du/mdbook-grogu-theme) | Mandalorian-inspired restrained green panels | Beskar-like dark green surfaces and brass framing |
| [Middle-earth Timeline](https://github.com/NicholasOglo/middle-earth-timeline) and [Eye of Mordor](https://github.com/georgianastasov/eye-of-mordor) | Parchment/gold chronology and dark ember accents | Separate Shire and Mordor variants with book-like and stone-like cards |
| [Hogwarts Interactive Hub](https://github.com/DevYuriVieira/Hogwarts-Interactive-Hub) | House palettes and parchment surfaces | Hogwarts parchment/burgundy and Slytherin emerald/silver |
| [Omarchy Dune theme](https://github.com/OldJobobo/omarchy-dune-theme) | Sand and desert-night palette | Arrakis uses warm surfaces and angular framing |
| [EQLegendsParser](https://github.com/Cujef/EQLegendsParser) | Multiple lore-inspired dashboard themes | Winterfell uses pale steel against cold slate |
| [Fallout dashboard](https://github.com/hayseedbyte/fallout-dashboard) and [PipBoy3000](https://github.com/9hm2/PipBoy3000) | Compact phosphor-green terminal panels | Pip-Boy uses monochrome labels, square panels and instrument lines |
| [Dashpunk](https://github.com/karubits/dashpunk) | Cyberpunk dashboard contrast | Night City uses rose highlights and cyan framing on midnight panels |
| [Movie OS Collection](https://github.com/manuelhintermayr/movie-os-collection) and [Encom Boardroom](https://github.com/arscan/encom-boardroom) | Movie computer interfaces, especially TRON and Matrix | New film styles use original circuit and terminal framing |
| [Blade Runner theme for Zed](https://github.com/davccavalcante/blade-runner-2049-theme-for-zed) and [ratatui-sci-fi](https://github.com/Liangdi/ratatui-sci-fi) | Noir and industrial console palettes | Blade Runner and Alien variants use warm instrument contrast |
| [Lumon Interface](https://github.com/RJoshi141/lumon) | Restrained retro corporate interface | Severance uses cool green-gray and a strict grid |
| [Witcher DB](https://github.com/ckagias/Witcher-DB) | Book/world archive organization | Witcher variant uses a bestiary-like card structure |
| [Darkside color scheme](https://github.com/daylerees/colour-schemes) | Minimal spectral accent inspired by Pink Floyd | Pink Floyd uses a fine spectrum rule over readable black panels |

## Product decisions

- Keep Today, Activity, Insights and Settings in the same places across appearances. Themes change presentation, not workflows.
- Use original inline SVG icons consistently for navigation, activity modes and refresh.
- Group the appearance picker into Everyday, High contrast, Flight decks, Fantasy worlds, Other worlds, Films, Books, Series and Music. Category and text filters keep 38 choices manageable. Miniature layouts show differences in structure as well as color.
- Use original line symbols for the twenty new story and music variants. They suggest a motif, such as a prism, lamp or clock, without importing logos or artwork.
- Keep the current selection explicit with an outline, check mark and accessible pressed state.
- Hide week navigation in Settings until the advanced weekly file editor is expanded.
- Switch theme colors together to avoid briefly combining light-theme text with a transitioning dark background.
- Reserve decorative structures for framing real content. Do not add fictional telemetry or motion that competes with the activity journal.

## Validation and limits

Native Electron checks cover theme persistence, all activity modes at 125% zoom, the grouped picker, the Settings editor toggle, representative text/focus contrast and rendered navigation labels. The screenshot suite captures the core views, full gallery and all themed styles using the production renderer.

The measured palette targets are at least 7:1 for the selected high-contrast text pairs, 4.5:1 for the selected themed text pairs and 3:1 for focus indicators. These targeted checks are not a complete accessibility audit. Local GUI validation was performed on macOS; Windows and Linux rendering still need verification.
