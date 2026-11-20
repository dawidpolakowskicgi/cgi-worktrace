const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tavriWidget", {
  command: async action => {
    const result = await ipcRenderer.invoke("tavri:widget-command", action);
    if (!result.ok) throw new Error(result.error.message);
    return result.data;
  },
  onState: callback => ipcRenderer.on("tavri:widget-state", (_event, value) => callback(value)),
});
