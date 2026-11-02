// Compatibility for consumers of the previous module name.
const core = require("./tavri-core.cjs");
module.exports = { ...core, WorktraceStore: core.TavriStore, WorktraceCoreError: core.TavriCoreError };
