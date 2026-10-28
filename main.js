const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  screen,
  ipcMain,
  nativeImage,
  dialog,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
// Aplicado antes de criar qualquer sessão do Chromium.
app.commandLine.appendSwitch("disable-http-cache");
let cachePreparation = Promise.resolve();
let tray,
  popup,
  settingsWindow,
  address = "",
  quitting = false;
let windowSettings = { width: 720, height: 480, kiosk: false };
let changingWindowMode = false;
let blurTimer;
function closeHome() {
  clearTimeout(blurTimer);
  const window = popup;
  popup = null;
  if (window && !window.isDestroyed()) window.destroy();
}
function applyWindowMode(kiosk) {
  changingWindowMode = true;
  try {
    // No Windows, permita redimensionamento antes de entrar em tela cheia.
    popup.setResizable(true);
    popup.setFullScreenable(true);
    popup.setKiosk(false);
    popup.setFullScreen(false);
    if (kiosk) {
      const trayBounds = tray.getBounds();
      const display = screen.getDisplayNearestPoint({
        x: trayBounds.x,
        y: trayBounds.y,
      });
      // bounds inclui toda a tela, inclusive a região da barra de tarefas.
      popup.setBounds(display.bounds);
      popup.show();
      popup.setFullScreen(true);
      popup.setKiosk(true);
    } else {
      position();
      popup.setResizable(false);
      popup.show();
    }
    popup.focus();
  } finally {
    changingWindowMode = false;
  }
}
function validateSettings(value) {
  const width = Number(value.width),
    height = Number(value.height);
  if (
    !Number.isInteger(width) ||
    width < 240 ||
    width > 7680 ||
    !Number.isInteger(height) ||
    height < 180 ||
    height > 4320
  )
    throw new Error(
      "Use largura entre 240 e 7680 e altura entre 180 e 4320, em números inteiros.",
    );
  return { width, height, kiosk: value.kiosk === true };
}
const configPath = () => path.join(app.getPath("userData"), "settings.json");
function normalize(value) {
  const input = value.trim();
  if (!input) throw new Error("Informe um IP ou endereço.");
  const url = new URL(/^https?:\/\//i.test(input) ? input : `http://${input}`);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  )
    throw new Error("Use um endereço HTTP ou HTTPS sem usuário e senha.");
  return url.href;
}
function position() {
  const bounds = tray.getBounds();
  const area = screen.getDisplayNearestPoint({
    x: bounds.x,
    y: bounds.y,
  }).workArea;
  const width = Math.min(windowSettings.width, area.width - 24),
    height = Math.min(windowSettings.height, area.height - 16);
  const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
  popup.setBounds({
    width,
    height,
    x:
      clamp(
        bounds.x + bounds.width / 2 - width / 2,
        area.x + 12,
        area.x + area.width - width - 12,
      ) | 0,
    y: clamp(bounds.y - height - 8, area.y, area.y + area.height - height) | 0,
  });
}
async function loadHome() {
  if (!popup || !address) return;
  const window = popup;
  const target = address;
  const session = window.webContents.session;
  // Serialize a limpeza para não carregar uma janela durante a limpeza anterior.
  cachePreparation = cachePreparation
    .catch(() => {})
    .then(async () => {
      await session.clearCache();
      await session.clearStorageData({
        origin: new URL(target).origin,
        storages: ["serviceworkers", "cachestorage"],
      });
    });
  try {
    await cachePreparation;
    if (window.isDestroyed() || popup !== window) return;
    await window.loadURL(target, {
      extraHeaders: "Cache-Control: no-cache\nPragma: no-cache",
    });
  } catch (error) {
    if (
      !window.isDestroyed() &&
      popup === window &&
      error.code !== "ERR_ABORTED"
    ) {
      console.error("Falha ao atualizar o Home:", error.message);
    }
  }
}
function reloadHome() {
  closeHome();
  showHome();
}
function showHome() {
  clearTimeout(blurTimer);
  if (!address) return showSettings();
  if (!popup) {
    popup = new BrowserWindow({
      width: windowSettings.width,
      height: windowSettings.height,
      frame: false,
      resizable: true,
      fullscreenable: true,
      show: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: "#f4f6fa",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    const homeWindow = popup;
    popup.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) popup.loadURL(url).catch(() => {});
      return { action: "deny" };
    });
    popup.webContents.on("will-navigate", (event, url) => {
      if (!/^https?:\/\//i.test(url)) event.preventDefault();
    });
    popup.webContents.on("before-input-event", (event, input) => {
      if (input.key === "Escape") {
        if (popup.isKiosk() || popup.isFullScreen()) applyWindowMode(false);
        else closeHome();
        event.preventDefault();
      }
    });
    popup.webContents.on(
      "did-fail-load",
      (_event, code, _description, _url, mainFrame) => {
        if (
          !mainFrame ||
          code === -3 ||
          homeWindow.isDestroyed() ||
          popup !== homeWindow
        )
          return;
        const html =
          '<html lang="pt-BR"><meta charset="utf-8"><body style="font:15px Segoe UI;padding:24px;background:#f4f6fa"><h2>Não foi possível conectar</h2><p>Confira o IP, a porta e a conexão com sua rede.</p><p>No menu do ícone, escolha Recarregar ou Configurar endereço.</p></body></html>';
        popup
          .loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html))
          .catch(() => {});
      },
    );
    popup.on("blur", () => {
      if (
        !changingWindowMode &&
        !homeWindow.isKiosk() &&
        !homeWindow.isFullScreen()
      ) {
        // Permite que o clique na bandeja seja tratado antes de destruir a janela.
        clearTimeout(blurTimer);
        blurTimer = setTimeout(() => {
          if (
            popup === homeWindow &&
            !homeWindow.isDestroyed() &&
            !homeWindow.isFocused()
          )
            closeHome();
        }, 150);
      }
    });
    popup.on("focus", () => clearTimeout(blurTimer));
    popup.on("close", (event) => {
      if (!quitting) {
        event.preventDefault();
        closeHome();
      }
    });
    popup.on("closed", () => {
      if (popup === homeWindow) popup = null;
    });
    loadHome();
  }
  applyWindowMode(windowSettings.kiosk);
}
function showSettings() {
  closeHome();
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 460,
    height: 550,
    resizable: false,
    autoHideMenuBar: true,
    title: "Configurar Home Tray",
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  settingsWindow.webContents.on("will-navigate", (event) =>
    event.preventDefault(),
  );
  settingsWindow.loadFile(path.join(__dirname, "settings.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", showHome);
  app
    .whenReady()
    .then(() => {
      try {
        const saved = JSON.parse(fs.readFileSync(configPath(), "utf8"));
        address = normalize(saved.address);
        try {
          windowSettings = validateSettings({ ...windowSettings, ...saved });
        } catch {}
      } catch {}
      tray = new Tray(
        nativeImage.createFromPath(path.join(__dirname, "tray.png")),
      );
      tray.setToolTip("Home Tray");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "Abrir home", click: showHome },
          {
            label: "Recarregar sem cache",
            click: reloadHome,
          },
          { label: "Configurações…", click: showSettings },
          { type: "separator" },
          { label: "Sair", click: () => app.quit() },
        ]),
      );
      tray.on("click", () => (popup?.isVisible() ? closeHome() : showHome()));
      ipcMain.handle("get-settings", (event) =>
        event.sender === settingsWindow?.webContents
          ? { address, ...windowSettings }
          : null,
      );
      ipcMain.handle("save-settings", (event, value) => {
        if (event.sender !== settingsWindow?.webContents)
          return { error: "Operação inválida." };
        try {
          const next = normalize(value.address);
          const nextSettings = validateSettings(value);
          fs.mkdirSync(path.dirname(configPath()), { recursive: true });
          fs.writeFileSync(
            configPath(),
            JSON.stringify({ address: next, ...nextSettings }, null, 2),
          );
          address = next;
          windowSettings = nextSettings;
          setImmediate(() => {
            settingsWindow?.close();
            reloadHome();
          });
          return { ok: true };
        } catch (error) {
          return { error: error.message };
        }
      });
      if (!address) showSettings();
    })
    .catch((error) => {
      dialog.showErrorBox("Home Tray", error.message);
      app.quit();
    });
}
app.on("window-all-closed", () => {});
app.on("before-quit", () => {
  quitting = true;
  clearTimeout(blurTimer);
  tray?.destroy();
});
