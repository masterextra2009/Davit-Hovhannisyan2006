// Безопасный "мостик" между окном программы и системой печати.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('printerAPI', {
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  printTest: (deviceName) => ipcRenderer.invoke('print-test', deviceName),
});
