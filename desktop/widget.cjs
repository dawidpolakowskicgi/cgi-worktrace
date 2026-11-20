(() => {
  let state = { active: false, elapsedMs: 0, runningSince: null };
  const $ = id => document.getElementById(id);
  const t = text => globalThis.TavriI18n.translate(text, state.locale || 'en');
  const clock = ms => {
    const seconds = Math.floor(Math.max(0, ms) / 1000);
    return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };
  const render = () => {
    document.documentElement.lang = state.locale || 'en';
    $("title").textContent = t(state.title || "No active task");
    $("project").textContent = state.project || t(state.active ? "Focus session" : "Open Tavri to choose what to work on.");
    for (const id of ['pause', 'resume', 'finish', 'open']) $(id).textContent = t(({ pause: 'Pause', resume: 'Resume', finish: 'Use time', open: 'Open Tavri ↗' })[id]);
    $("hide").setAttribute('aria-label', t('Hide focus widget'));
    $("elapsed").textContent = clock(state.elapsedMs + (state.runningSince === null ? 0 : Math.max(0, Date.now() - state.runningSince)));
    $("pause").hidden = !state.active || state.runningSince === null;
    $("resume").hidden = !state.active || state.runningSince !== null;
    $("finish").hidden = !state.active;
  };
  window.tavriWidget.onState(next => { state = next; render(); });
  for (const action of ["hide", "open", "pause", "resume", "finish"]) {
    $(action).addEventListener("click", async () => {
      try { await window.tavriWidget.command(action); }
      catch (error) { $("project").textContent = error.message; }
    });
  }
  setInterval(render, 1000);
  render();
})();
