/* Original line symbols used by the optional story and music appearances. */
(function(root) {
  const themeSymbolPaths = Object.freeze({
    "blade-runner": ["M2 12c3-4 6-6 10-6s7 2 10 6c-3 4-6 6-10 6S5 16 2 12Z", "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6"],
    tron: ["M3 3h7v7h11", "M3 21h7v-7h11", "M17 7h4M17 17h4"],
    matrix: ["M4 3v18M8 3v10M12 6v15M16 3v7M20 3v18", "M7 17h2M15 14h2"],
    alien: ["M12 2c-5 0-8 5-8 11a8 8 0 0 0 16 0c0-6-3-11-8-11Z", "M8 13l4-4 4 4-4 4-4-4Z"],
    "grand-budapest": ["M9 10a4 4 0 1 0 0-8a4 4 0 1 0 0 8", "M9 10v12h3v-4h3v-3h3v-3h-9"],
    foundation: ["M3 20h18M5 17h14M7 7v10M12 7v10M17 7v10", "M3 7l9-5 9 5H3Z"],
    discworld: ["M3 12c3-4 15-4 18 0", "M4 12h16c-1 5-15 5-16 0Z", "M7 17l-2 4M17 17l2 4"],
    witcher: ["M4 3l16 16M20 3L4 19", "M3 17l4 4M17 21l4-4"],
    "hunger-games": ["M3 20L20 3M13 3h7v7", "M4 5c4-3 8-3 12 0M5 4c-3 4-3 8 0 12"],
    narnia: ["M8 21V7a4 4 0 0 1 8 0v14", "M6 8h12M7 12h10M5 21h14", "M10 4h4"],
    severance: ["M3 3h8v18H3zM13 3h8v18h-8z", "M7 8h1M17 16h1"],
    "stranger-things": ["M5 3h14v18H5z", "M8 6h8v12H8z", "M2 8l3 2M22 8l-3 2M2 16l3-2M22 16l-3-2"],
    "x-files": ["M4 4l16 16M20 4L4 20", "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8"],
    "doctor-who": ["M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20", "M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14", "M12 7v5l4 2"],
    "last-of-us": ["M20 3C9 4 4 9 5 18c8 3 16-2 15-15Z", "M5 21c3-7 7-11 13-15", "M8 14l-4-2M12 10l-2-4"],
    "daft-punk": ["M2 19v-8a5 5 0 0 1 10 0v8H2ZM12 19v-8a5 5 0 0 1 10 0v8H12Z", "M5 14h4M15 14h4"],
    "pink-floyd": ["M12 2L2 20h20L12 2Z", "M1 10h7M16 13h7M16 16h7M16 19h7"],
    bowie: ["M14 2L5 13h6l-1 9 9-12h-6l1-8Z"],
    kraftwerk: ["M3 3h4v18H3zM10 3h4v18h-4zM17 3h4v18h-4z"],
    radiohead: ["M2 19l5-8 3 4 4-11 3 8 2-3 3 10H2Z", "M3 22h18"],
  });
  function createThemeSymbol(doc, id) {
    const paths = themeSymbolPaths[id];
    if (!paths) return null;
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.6");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("theme-symbol");
    for (const data of paths) {
      const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", data);
      svg.append(path);
    }
    return svg;
  }
  if (typeof module !== "undefined") module.exports = { createThemeSymbol, themeSymbolPaths };
  else root.TavriThemeSymbols = { createThemeSymbol, themeSymbolPaths };
})(globalThis);
