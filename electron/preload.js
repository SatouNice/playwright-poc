// electron/preload.js
// Chi expose dung nhung ham renderer can — khong mo toan bo Node API ra renderer.

const { contextBridge, ipcRenderer, webUtils } = require('electron');

/** Bao boc listener de renderer khong cham truc tiep vao doi tuong `event` cua Electron */
function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('api', {
  // Cau hinh (URL, danh sach cot bat buoc...)
  getConfig: () => ipcRenderer.invoke('config:get'),

  // Dang nhap — password chi di 1 chieu vao main process, khong bao gio quay ve
  setCredentials: (payload) => ipcRenderer.invoke('auth:set-credentials', payload),
  getAuthStatus: () => ipcRenderer.invoke('auth:status'),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // Excel
  pickExcel: () => ipcRenderer.invoke('excel:pick'),
  validateExcel: (filePath) => ipcRenderer.invoke('excel:validate', filePath),

  // Lay duong dan that cua file duoc keo tha (Electron >= 32 khong con File.path)
  getDroppedFilePath: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },

  // Chay automation
  startRun: () => ipcRenderer.invoke('run:start'),
  stopRun: () => ipcRenderer.invoke('run:stop'),
  getRunStatus: () => ipcRenderer.invoke('run:status'),

  // Nhan su kien real-time tu main process; tra ve ham huy dang ky
  onRunEvent: (callback) => subscribe('run:event', callback),

  // Bao cao
  exportReport: () => ipcRenderer.invoke('report:export'),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:show-item', filePath),
});
