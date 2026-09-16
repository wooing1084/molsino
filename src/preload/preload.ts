import { contextBridge, ipcRenderer } from 'electron';
import { channels, type BlackjackAPI } from '../shared/contracts';
const api: BlackjackAPI = {
  getSnapshot: () => ipcRenderer.invoke(channels.snapshot),
  dispatch: command => ipcRenderer.invoke(channels.command, command),
  onState: listener => {
    const handler = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state);
    ipcRenderer.on(channels.state, handler);
    return () => ipcRenderer.removeListener(channels.state, handler);
  },
  windowCommand: command => ipcRenderer.invoke(channels.window, command),
  resize: command => ipcRenderer.invoke(channels.resize, command),
};
contextBridge.exposeInMainWorld('blackjack', api);
