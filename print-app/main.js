// ============================================================
//  Фото-Север — Печать (Этап 1)
//  Эта программа находит все принтеры Windows
//  и печатает на выбранный тестовую страницу.
// ============================================================

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

// Создаём главное окно программы
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 780,
    height: 660,
    title: 'Фото-Север — Печать',
    backgroundColor: '#12122e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false); // убираем верхнее меню браузера
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// -------- Список всех принтеров, которые видит Windows --------
ipcMain.handle('list-printers', async () => {
  const printers = await mainWindow.webContents.getPrintersAsync();
  return printers.map((p) => ({
    name: p.name,
    displayName: p.displayName || p.name,
    status: p.status,
    isDefault: p.isDefault,
  }));
});

// -------- Печать тестовой страницы на выбранном принтере --------
ipcMain.handle('print-test', async (_event, deviceName) => {
  return new Promise((resolve) => {
    const testWin = new BrowserWindow({ show: false });
    testWin.loadFile('test-page.html');

    testWin.webContents.on('did-finish-load', () => {
      testWin.webContents.print(
        {
          silent: true,            // печатать сразу, без окна выбора
          deviceName: deviceName,  // на какой именно принтер
          printBackground: true,   // печатать фон/цвета
        },
        (success, failureReason) => {
          testWin.close();
          resolve({ success, failureReason });
        }
      );
    });
  });
});
