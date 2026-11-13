// Plain assert tests for the parts that run without Windows: Steam manifest parsing, folder and WebDAV upload.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const steam = require('../lib/steam');
const upload = require('../lib/upload');
const battery = require('../lib/battery');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pim-test-'));

  // --- VDF parser
  const v = steam.parseVdf('"AppState"\n{\n\t"appid"\t\t"570"\n\t"name"\t\t"Dota \\"2\\""\n\t"UserConfig"\n\t{\n\t\t"language"\t\t"german"\n\t}\n}');
  assert.deepStrictEqual(v, { AppState: { appid: '570', name: 'Dota "2"', UserConfig: { language: 'german' } } });

  // --- Steam scan: one library with an active download, one finished, one second library via libraryfolders.vdf
  const lib1 = path.join(tmp, 'Steam'), lib2 = path.join(tmp, 'D_SteamLibrary');
  fs.mkdirSync(path.join(lib1, 'steamapps'), { recursive: true });
  fs.mkdirSync(path.join(lib2, 'steamapps'), { recursive: true });
  fs.writeFileSync(path.join(lib1, 'steamapps', 'libraryfolders.vdf'),
    `"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"${lib1.replace(/\\/g, '\\\\')}"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"${lib2.replace(/\\/g, '\\\\')}"\n\t}\n}`);
  const acf = (id, name, done, total) => `"AppState"\n{\n\t"appid"\t\t"${id}"\n\t"name"\t\t"${name}"\n\t"StateFlags"\t\t"1026"\n\t"BytesToDownload"\t\t"${total}"\n\t"BytesDownloaded"\t\t"${done}"\n}`;
  fs.writeFileSync(path.join(lib1, 'steamapps', 'appmanifest_10.acf'), acf(10, 'Counter-Strike', 500, 1000));
  fs.writeFileSync(path.join(lib1, 'steamapps', 'appmanifest_20.acf'), acf(20, 'Fertig', 1000, 1000));
  fs.writeFileSync(path.join(lib2, 'steamapps', 'appmanifest_30.acf'), acf(30, 'Portal 2', 0, 2000));
  const libs = steam.libraries(lib1);
  assert.strictEqual(libs.length, 2);
  const active = steam.scan(libs).map(d => [d.name, d.done, d.total]).sort();
  assert.deepStrictEqual(active, [['Counter-Strike', 500, 1000], ['Portal 2', 0, 2000]]);

  // --- free file names never overwrite
  const taken = new Set(['a.txt', 'a (1).txt']);
  assert.strictEqual(await upload.freeName('a.txt', async n => taken.has(n)), 'a (2).txt');
  assert.throws(() => upload.davUrl('ftp://x/', 'a'), /http/);
  assert.strictEqual(upload.davUrl('https://nas/dav', 'a b.txt'), 'https://nas/dav/a%20b.txt');

  // --- folder upload with collision and progress
  const src = path.join(tmp, 'foto.jpg');
  fs.writeFileSync(src, Buffer.alloc(300000, 7));
  const dest = path.join(tmp, 'nas'); fs.mkdirSync(dest);
  fs.writeFileSync(path.join(dest, 'foto.jpg'), 'alt');
  let last = 0;
  const r = await upload.uploadFile(src, { type: 'folder', path: dest }, '', s => { last = s; });
  assert.strictEqual(r.name, 'foto (1).jpg');
  assert.strictEqual(fs.readFileSync(path.join(dest, 'foto.jpg'), 'utf8'), 'alt');
  assert.strictEqual(fs.statSync(path.join(dest, 'foto (1).jpg')).size, 300000);
  assert.strictEqual(last, 300000);
  await assert.rejects(upload.uploadFile(src, { type: 'folder', path: path.join(tmp, 'fehlt') }, ''));

  // --- WebDAV upload against a tiny local server
  const stored = new Map([['/dav/foto.jpg', Buffer.from('alt')]]);
  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== 'Basic ' + Buffer.from('ich:geheim').toString('base64')) { res.writeHead(401); return res.end(); }
    if (req.method === 'HEAD') { res.writeHead(stored.has(req.url) ? 200 : 404); return res.end(); }
    if (req.method === 'PROPFIND') { res.writeHead(207); return res.end(); }
    if (req.method === 'PUT') { const parts = []; req.on('data', c => parts.push(c)); req.on('end', () => { stored.set(req.url, Buffer.concat(parts)); res.writeHead(201); res.end(); }); return; }
    res.writeHead(405); res.end();
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}/dav/`;
  const dav = { type: 'webdav', url: base, user: 'ich' };
  assert.strictEqual(await upload.testTarget(dav, 'geheim'), 'WebDAV erreichbar');
  await assert.rejects(upload.testTarget(dav, 'falsch'), /Passwort/);
  const d = await upload.uploadFile(src, dav, 'geheim');
  assert.strictEqual(d.name, 'foto (1).jpg');
  assert.strictEqual(stored.get('/dav/foto%20(1).jpg').length, 300000);
  assert.strictEqual(stored.get('/dav/foto.jpg').toString(), 'alt');
  server.close();

  // --- Bluetooth battery rows: merge device nodes per name, drop disconnected and junk
  assert.deepStrictEqual(battery.parseDevices(JSON.stringify([
    { name: 'AirPods Pro', level: 80, connected: true },
    { name: 'AirPods Pro', level: 85, connected: null },
    { name: 'Alter Lautsprecher', level: 40, connected: false },
    { name: '', level: 50 }, { name: 'Kaputt', level: 255 },
  ])), [{ name: 'AirPods Pro', level: 85 }]);
  assert.deepStrictEqual(battery.parseDevices('{"name":"Jabra","level":12,"connected":true}'), [{ name: 'Jabra', level: 12 }]);
  assert.deepStrictEqual(battery.parseDevices(''), []);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('alle Tests bestanden');
})().catch(e => { console.error(e); process.exit(1); });
