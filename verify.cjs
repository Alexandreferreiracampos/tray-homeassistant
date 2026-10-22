const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const context = vm.createContext({
  require: name => name === 'electron' ? {
    app: { requestSingleInstanceLock: () => false, quit() {}, on() {} },
    screen: { getDisplayNearestPoint: () => ({ workArea: { x: -1920, y: 0, width: 1920, height: 1040 } }) }
  } : require(name),
  __dirname, setImmediate, URL
});
vm.runInContext(fs.readFileSync('main.js', 'utf8'), context);
assert.equal(vm.runInContext("normalize('192.168.1.100:8123')", context), 'http://192.168.1.100:8123/');
assert.equal(vm.runInContext("normalize(' https://home.local/page ')", context), 'https://home.local/page');
assert.throws(() => vm.runInContext("normalize('')", context));
assert.throws(() => vm.runInContext("normalize('http://user:password@host')", context));
for (const [x, y] of [[-20, 1050], [-1920, 0], [-1920, 500]]) {
  context.iconX = x; context.iconY = y;
  vm.runInContext('tray = { getBounds: () => ({x: iconX, y: iconY, width: 24, height: 24}) }; popup = { setBounds: value => { globalThis.result = value; } }; position();', context);
  const r = context.result;
  assert.equal(r.width, 400); assert.equal(r.height, 300);
  assert.ok(r.x >= -1920 && r.x + r.width <= 0);
  assert.ok(r.y >= 0 && r.y + r.height <= 1040);
}
console.log('OK: endereços e posicionamento em tela secundária, bordas e bandeja.');

