// Guided writing prompts only. The resulting activity uses the existing log format.
(function () {
const activityTemplates = [
  { id: "delivery", category: "Build & delivery", label: "Shipped work", purpose: "Record what became usable and for whom.", fields: [
    { label: "What shipped?", example: "the new export flow", prefix: "Shipped " },
    { label: "Who or what benefits?", example: "weekly report users", prefix: "For " },
    { label: "Result or evidence", example: "the team can export any date range", prefix: "Result: " },
  ] },
  { id: "bugfix", category: "Build & delivery", label: "Bug fix", purpose: "Capture the problem, change and verification.", fields: [
    { label: "What was broken?", example: "saving an archived week", prefix: "Fixed " },
    { label: "What changed?", example: "the selected week is passed to the writer", prefix: "Changed: " },
    { label: "How did you verify it?", example: "integration test and manual check", prefix: "Verified with " },
  ] },
  { id: "review", category: "Build & delivery", label: "Code or design review", purpose: "Keep the reviewed item and useful feedback together.", fields: [
    { label: "What did you review?", example: "the import flow", prefix: "Reviewed " },
    { label: "Main feedback", example: "show file counts before import", prefix: "Feedback: " },
    { label: "Outcome", example: "approved after changes", prefix: "Outcome: " },
  ] },
  { id: "test", category: "Build & delivery", label: "Test or validation", purpose: "Say what was tested and what the result means.", fields: [
    { label: "What did you test?", example: "cross-week export", prefix: "Tested " },
    { label: "Environment or method", example: "Windows desktop smoke test", prefix: "Method: " },
    { label: "Result", example: "all selected weeks appeared in the PDF", prefix: "Result: " },
  ] },
  { id: "meeting", category: "Collaboration", label: "Meeting", purpose: "Write down the decision, not just the meeting title.", fields: [
    { label: "What was discussed?", example: "release readiness", prefix: "Discussed " },
    { label: "Decision or takeaway", example: "ship after the backup flow is tested", prefix: "Decision: " },
    { label: "Next action", example: "prepare a clean-install check", prefix: "Next: " },
  ] },
  { id: "support", category: "Collaboration", label: "Support request", purpose: "Connect a user problem to its resolution.", fields: [
    { label: "What did the user need?", example: "help recovering an older log", prefix: "Helped with " },
    { label: "What did you do?", example: "restored the weekly backup", prefix: "Action: " },
    { label: "Status or follow-up", example: "user confirmed the entries", prefix: "Status: " },
  ] },
  { id: "handoff", category: "Collaboration", label: "Handoff", purpose: "Make ownership and the next step easy to find.", fields: [
    { label: "What was handed off?", example: "the release checklist", prefix: "Handed off " },
    { label: "To whom?", example: "the QA team", prefix: "To " },
    { label: "Next step or risk", example: "verify installation on Windows", prefix: "Next: " },
  ] },
  { id: "product", category: "Product & discovery", label: "Product decision", purpose: "Preserve the user need and the reason for a choice.", fields: [
    { label: "What did you decide?", example: "keep duration optional", prefix: "Decided to " },
    { label: "User need or reason", example: "people can log work without a timer", prefix: "Reason: " },
    { label: "Follow-up", example: "clarify this in onboarding", prefix: "Next: " },
  ] },
  { id: "research", category: "Product & discovery", label: "Research finding", purpose: "Turn investigation into a reusable finding.", fields: [
    { label: "What did you investigate?", example: "how users find old activities", prefix: "Investigated " },
    { label: "What did you find?", example: "year navigation hides older results", prefix: "Found: " },
    { label: "Recommendation", example: "add archive-wide search", prefix: "Recommend: " },
  ] },
  { id: "planning", category: "Product & discovery", label: "Planning", purpose: "Record scope and the concrete next milestone.", fields: [
    { label: "What did you plan?", example: "the backup and restore flow", prefix: "Planned " },
    { label: "Scope or constraint", example: "keep weekly logs readable", prefix: "Scope: " },
    { label: "Next milestone", example: "prototype restore preview", prefix: "Next: " },
  ] },
  { id: "incident", category: "Operations & learning", label: "Incident", purpose: "Capture impact, mitigation and current status.", fields: [
    { label: "What happened?", example: "imports failed for one malformed file", prefix: "Investigated incident: " },
    { label: "Impact or mitigation", example: "other files were left untouched", prefix: "Impact/action: " },
    { label: "Current status", example: "validation added; monitoring", prefix: "Status: " },
  ] },
  { id: "learning", category: "Operations & learning", label: "Learning", purpose: "Keep the lesson and how it will be applied.", fields: [
    { label: "What did you learn?", example: "how Electron handles signed updates", prefix: "Learned about " },
    { label: "Key insight", example: "macOS builds need signing", prefix: "Insight: " },
    { label: "How will you use it?", example: "update the release checklist", prefix: "Apply by " },
  ] },
];

function buildTemplateDescription(template, values) {
  if (!template || !Array.isArray(template.fields)) return "";
  const parts = template.fields.map((field, index) => {
    const value = String(values?.[index] || "").replace(/\s+/g, " ").trim();
    return value ? `${field.prefix}${value.replace(/[.;\s]+$/, "")}` : "";
  }).filter(Boolean);
  return parts.length ? `${parts.join("; ")}.` : "";
}

const exported = { activityTemplates, buildTemplateDescription };
if (typeof module !== "undefined") module.exports = exported;
else globalThis.TavriActivityTemplates = exported;
})();
