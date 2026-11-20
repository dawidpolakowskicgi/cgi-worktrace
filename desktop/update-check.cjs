const RELEASES_API = "https://api.github.com/repos/dawidpolakowskicgi/cgi-worktrace/releases?per_page=20";

function versionParts(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value || ""));
  return match ? match.slice(1).map(Number) : null;
}

function isNewer(candidate, current) {
  const a = versionParts(candidate), b = versionParts(current);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] > b[index];
  return false;
}

function selectTavriRelease(releases, current) {
  if (!Array.isArray(releases)) return null;
  const candidates = releases.filter(item => !item.draft && !item.prerelease && versionParts(item.tag_name) &&
    Array.isArray(item.assets) && item.assets.some(asset => /^Tavri-.*\.(dmg|zip|exe|deb)$/i.test(asset.name || "")) &&
    /^https:\/\/github\.com\/dawidpolakowskicgi\/(?:cgi-worktrace|CGITART)\/releases\/tag\//.test(item.html_url || ""));
  candidates.sort((a, b) => isNewer(a.tag_name, b.tag_name) ? -1 : isNewer(b.tag_name, a.tag_name) ? 1 : 0);
  const latest = candidates[0];
  return latest ? { current, latest: latest.tag_name, updateAvailable: isNewer(latest.tag_name, current), releaseUrl: latest.html_url } : null;
}

async function checkForUpdates(current) {
  const response = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json", "User-Agent": "Tavri-update-check" }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Could not check releases (HTTP ${response.status}). Try again later.`);
  const selected = selectTavriRelease(await response.json(), current);
  return selected || { current, latest: "", updateAvailable: false, releaseUrl: "" };
}

module.exports = { versionParts, isNewer, selectTavriRelease, checkForUpdates };
