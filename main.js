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
let tray,
  popup,
  settingsWindow,
  address = "",
  quitting = false;
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
  const width = 720,
    height = 480;
  const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
  popup.setBounds({
    width,
    height,
    x:
      clamp(
        bounds.x + bounds.width / 2 - width / 2,
        area.x,
        area.x + area.width - width - 12,
      ) | 0,
    y: clamp(bounds.y - height - 8, area.y, area.y + area.height - height) | 0,
  });
}
function loadHome() {
  if (!popup || !address) return;
  popup.loadURL(address).catch(() => {});
}
function showHome() {
  if (!address) return showSettings();
  if (!popup) {
    popup = new BrowserWindow({
      width: 400,
      height: 300,
      frame: false,
      resizable: false,
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
    popup.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) popup.loadURL(url).catch(() => {});
      return { action: "deny" };
    });
    popup.webContents.on("will-navigate", (event, url) => {
      if (!/^https?:\/\//i.test(url)) event.preventDefault();
    });
    popup.webContents.on("before-input-event", (event, input) => {
      if (input.key === "Escape") {
        popup.hide();
        event.preventDefault();
      }
    });
    popup.webContents.on(
      "did-fail-load",
      (_event, code, _description, _url, mainFrame) => {
        if (!mainFrame || code === -3) return;
        const html =
          '<html lang="pt-BR"><meta charset="utf-8"><body style="font:15px Segoe UI;padding:24px;background:#f4f6fa"><h2>Não foi possível conectar</h2><p>Confira o IP, a porta e a conexão com sua rede.</p><p>No menu do ícone, escolha Recarregar ou Configurar endereço.</p></body></html>';
        popup
          .loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html))
          .catch(() => {});
      },
    );
    popup.on("blur", () => popup.hide());
    popup.on("close", (event) => {
      if (!quitting) {
        event.preventDefault();
        popup.hide();
      }
    });
    loadHome();
  }
  position();
  popup.show();
  popup.focus();
}
function showSettings() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 460,
    height: 330,
    resizable: false,
    autoHideMenuBar: true,
    title: "Configurar Home Tray",
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  settingsWindow.webContents.on("will-navigate", (event) =>
    event.preventDefault(),
  );
  settingsWindow.loadFile("settings.html");
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
        address = normalize(
          JSON.parse(fs.readFileSync(configPath(), "utf8")).address,
        );
      } catch {}
      tray = new Tray(
        nativeImage.createFromPath(path.join(__dirname, "tray.png")),
      );
      tray.setToolTip("Home Tray");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "Abrir home", click: showHome },
          {
            label: "Recarregar",
            click: () => {
              showHome();
              loadHome();
            },
          },
          { label: "Configurar endereço…", click: showSettings },
          { type: "separator" },
          { label: "Sair", click: () => app.quit() },
        ]),
      );
      tray.on("click", () => (popup?.isVisible() ? popup.hide() : showHome()));
      ipcMain.handle("get-address", (event) =>
        event.sender === settingsWindow?.webContents ? address : "",
      );
      ipcMain.handle("save-address", (event, value) => {
        if (event.sender !== settingsWindow?.webContents)
          return { error: "Operação inválida." };
        try {
          const next = normalize(value);
          fs.mkdirSync(path.dirname(configPath()), { recursive: true });
          fs.writeFileSync(
            configPath(),
            JSON.stringify({ address: next }, null, 2),
          );
          address = next;
          setImmediate(() => {
            settingsWindow?.close();
            loadHome();
            showHome();
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
  tray?.destroy();
});
