import type { MolsinoAPI } from '../shared/app-contracts';
import { contextBridge, ipcRenderer } from 'electron';
import { channels } from '../shared/contracts';
const api: MolsinoAPI = {
  getSnapshot: () => ipcRenderer.invoke(channels.snapshot),
  dispatch: command => ipcRenderer.invoke(channels.command, command),
  recover: choice => ipcRenderer.invoke(channels.recovery, choice),
  onState: listener => {
    const handler = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state);
    ipcRenderer.on(channels.state, handler);
    return () => ipcRenderer.removeListener(channels.state, handler);
  },
  windowCommand: command => ipcRenderer.invoke(channels.window, command),
  getOverlayState: () => ipcRenderer.invoke(channels.overlayState),
  onOverlayState: listener => {
    const handler = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state);
    ipcRenderer.on(channels.overlayStateChanged, handler);
    return () => ipcRenderer.removeListener(channels.overlayStateChanged, handler);
  },
  setOpacity: percent => ipcRenderer.invoke(channels.opacity, percent),
  opacityPopover: command => ipcRenderer.invoke(channels.opacityPopover, command),
  amountEditFocus: phase => ipcRenderer.invoke(channels.amountEditFocus, phase),
  resize: command => ipcRenderer.invoke(channels.resize, command),
};
contextBridge.exposeInMainWorld('molsino', api);
