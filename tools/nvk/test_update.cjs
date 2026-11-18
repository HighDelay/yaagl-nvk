#!/usr/bin/env node
/* File-preservation and transaction tests; no installed launcher is modified. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { test, afterEach } = require("node:test");
const updater = require("./update-launcher.js");
const temporary = [];
const names = { zzz: "ZZZ", gi: "GI", hsr: "HSR" };
const hash = text => crypto.createHash("sha256").update(text).digest("hex");
function put(file, text, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { mode });
}
function json(file, data) {
  put(file, JSON.stringify(data));
}
function io() {
  return {
    stat(file) {
      const s = fs.lstatSync(file, { throwIfNoEntry: false });
      return s
        ? {
            type: s.isDirectory()
              ? "directory"
              : s.isSymbolicLink()
              ? "symlink"
              : "file",
            mode: s.mode & 0o7777,
          }
        : null;
    },
    canonical: file => fs.realpathSync(file),
    list: file => fs.readdirSync(file),
    read: file => fs.readFileSync(file, "utf8"),
    write: (file, text) => fs.writeFileSync(file, text),
    mkdir: file => fs.mkdirSync(file, { recursive: true }),
    mkdirExclusive(file) {
      try {
        fs.mkdirSync(file);
        return true;
      } catch (e) {
        if (e.code === "EEXIST") return false;
        throw e;
      }
    },
    copy: (from, to) =>
      fs.cpSync(from, to, {
        recursive: true,
        verbatimSymlinks: true,
        preserveTimestamps: true,
      }),
    move: (from, to) => fs.renameSync(from, to),
    remove: file => fs.rmSync(file, { recursive: true }),
    chmod: (file, mode) => fs.chmodSync(file, mode),
    readlink: file => fs.readlinkSync(file),
    hashFile: file => hash(fs.readFileSync(file)),
    hashText: hash,
    verifyApp: () => undefined,
    appId: app =>
      JSON.parse(fs.readFileSync(path.join(app, "Contents/Info.plist")))
        .CFBundleIdentifier,
    running: () => false,
    alive: pid => pid === process.pid,
    pid: () => process.pid,
    transactionId: () =>
      Date.now() + "-" + crypto.randomBytes(4).toString("hex"),
  };
}
function fixture() {
  const base = process.env.YAAGL_TEST_UPDATE_WORK || os.tmpdir();
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, "update O'Brien 日本語 "));
  temporary.push(root);
  return root;
}
afterEach(() => {
  for (const root of temporary.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
function game(root, key, version, region = "global", incoming = false) {
  fs.mkdirSync(root, { recursive: true });
  const channel =
    { zzz: "nap", gi: "hk4e", hsr: "hkrpg" }[key] +
    (region === "global" ? "os" : "cn");
  const id = "com.highdelay.yaagl.nvk." + channel;
  put(
    path.join(root, updater.apps[key], "Contents/MacOS/Yaagl"),
    "program " + version,
    0o755
  );
  json(path.join(root, updater.apps[key], "Contents/Info.plist"), {
    CFBundleIdentifier: id,
  });
  put(path.join(root, "launcher-data/dist/index.html"), "frontend " + version);
  put(
    path.join(root, "launcher-data/sidecar/tool"),
    "sidecar " + version,
    0o755
  );
  put(path.join(root, "launcher-data/src/icons/icon.png"), "icon " + version);
  json(path.join(root, "launcher-data/neutralino.config.json"), {
    applicationId: id,
    version,
  });
  put(path.join(root, "Start YAAGL NVK.command"), "start " + version, 0o755);
  put(path.join(root, "README.md"), "guide " + version);
  put(path.join(root, "YAAGL-LICENSE.txt"), "license");
  json(path.join(root, "LAUNCHER-BUILD.json"), { version, game: key, region });
  const persistent = {
    "launcher-data/.storage/config_block_net.neustorage": incoming
      ? "true"
      : "false",
    "launcher-data/.storage/game_install_dir.neustorage":
      "/data/installed-game",
    "launcher-data/wineprefix-nvk/user.reg": "original registry",
    "launcher-data/wineprefix-nvk/drive_c/save.dat": "original save",
    "launcher-data/wineprefix/user.reg": "other Wine registry",
    "launcher-data/wine-nvk/bin/wine": "existing Wine executable",
    "launcher-data/nvk-state/cache/item": "cached shader",
    "launcher-data/logs/game.log": "old log",
    "launcher-data/aria2.session": "download progress",
    "launcher-data/account-token": "private account marker",
    "my-notes.txt": "user notes",
  };
  for (const [name, value] of Object.entries(persistent))
    put(path.join(root, name), value);
  if (incoming) {
    fs.copyFileSync(
      path.join(__dirname, "update-launcher.js"),
      path.join(root, "update-launcher.js")
    );
    fs.copyFileSync(
      path.join(__dirname, "update-launcher.sh"),
      path.join(root, "Update YAAGL NVK.command")
    );
    fs.chmodSync(path.join(root, "Update YAAGL NVK.command"), 0o755);
    execFileSync("python3", [path.join(__dirname, "update_manifest.py"), root]);
  }
  return persistent;
}
function combined(root, version, incoming) {
  const state = {};
  for (const [key, name] of Object.entries(names)) {
    const saved = game(path.join(root, name), key, version, "global", incoming);
    for (const [p, value] of Object.entries(saved))
      state[name + "/" + p] = value;
  }
  json(path.join(root, "COMBINED-BUILD.json"), { version });
  for (const file of ["README.md", "GUIDE.md", "YAAGL-LICENSE.txt"])
    put(path.join(root, file), file + " " + version);
  if (incoming) {
    fs.copyFileSync(
      path.join(__dirname, "update-launcher.js"),
      path.join(root, "update-launcher.js")
    );
    fs.copyFileSync(
      path.join(__dirname, "update-launcher.sh"),
      path.join(root, "Update YAAGL NVK.command")
    );
    execFileSync("python3", [path.join(__dirname, "update_manifest.py"), root]);
  }
  return state;
}
function preserved(root, state) {
  for (const [name, value] of Object.entries(state))
    assert.equal(fs.readFileSync(path.join(root, name), "utf8"), value, name);
}
function setup(all = false) {
  const base = fixture(),
    source = path.join(base, "new"),
    target = path.join(base, "old");
  const state = all
    ? combined(target, "0.2.1", false)
    : game(target, "hsr", "0.2.1");
  if (all) combined(source, "0.2.2", true);
  else game(source, "hsr", "0.2.2", "global", true);
  return { base, source, target, state, io: io() };
}
function installedVersion(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "LAUNCHER-BUILD.json")))
    .version;
}

test("updates a game while preserving prefixes, Wine, preferences, caches, accounts and extra files", () => {
  const f = setup();
  put(path.join(f.target, "launcher-data/dist/obsolete.js"), "old program");
  const result = updater.update(f.io, f.source, f.target, false);
  assert.ok(result.changed > 0);
  preserved(f.target, f.state);
  assert.equal(installedVersion(f.target), "0.2.2");
  assert.equal(
    fs.existsSync(path.join(f.target, "launcher-data/dist/obsolete.js")),
    false
  );
  assert.ok(
    fs.existsSync(path.join(result.backup, "Rollback YAAGL NVK.command"))
  );
});
test("updates all three games in a combined archive", () => {
  const f = setup(true),
    result = updater.update(f.io, f.source, f.target, false);
  assert.deepEqual(result.games, ["ZZZ", "GI", "HSR"]);
  preserved(f.target, f.state);
  for (const name of Object.values(names))
    assert.equal(installedVersion(path.join(f.target, name)), "0.2.2");
});
test("combined updater can target just one existing game", () => {
  const f = setup(true);
  updater.update(f.io, f.source, path.join(f.target, "HSR"), false);
  assert.equal(installedVersion(path.join(f.target, "HSR")), "0.2.2");
  assert.equal(installedVersion(path.join(f.target, "ZZZ")), "0.2.1");
  preserved(f.target, f.state);
});
test("per-game updater can select a combined installation", () => {
  const f = setup(true);
  updater.update(f.io, path.join(f.source, "HSR"), f.target, false);
  assert.equal(installedVersion(path.join(f.target, "HSR")), "0.2.2");
  assert.equal(installedVersion(path.join(f.target, "GI")), "0.2.1");
  preserved(f.target, f.state);
});
test("dry-run leaves the installation unchanged", () => {
  const f = setup(),
    before = updater.fingerprint(f.io, f.base, "old");
  assert.ok(updater.update(f.io, f.source, f.target, true).changed);
  assert.equal(updater.fingerprint(f.io, f.base, "old"), before);
});
test("identical repeat update creates no extra backup or rewrite", () => {
  const f = setup();
  updater.update(f.io, f.source, f.target, false);
  const before = updater.fingerprint(f.io, f.base, "old");
  assert.equal(updater.update(f.io, f.source, f.target, false).changed, 0);
  assert.equal(updater.fingerprint(f.io, f.base, "old"), before);
});
test("rollback restores old code while retaining data changed after the update", () => {
  const f = setup(),
    result = updater.update(f.io, f.source, f.target, false);
  f.state["launcher-data/wineprefix-nvk/user.reg"] = "new saved progress";
  put(
    path.join(f.target, "launcher-data/wineprefix-nvk/user.reg"),
    "new saved progress"
  );
  updater.rollback(f.io, result.backup);
  preserved(f.target, f.state);
  assert.equal(installedVersion(f.target), "0.2.1");
  assert.equal(
    fs.existsSync(path.join(f.target, "Update YAAGL NVK.command")),
    false
  );
  assert.equal(updater.rollback(f.io, result.backup).changed, 0);
});
for (const move of [1, 2, 15, 35])
  test("failed move " + move + " rolls back the entire combined update", () => {
    const f = setup(true),
      original = f.io.move;
    let calls = 0;
    f.io.move = (from, to) => {
      if (++calls === move) throw Error("injected move failure");
      original(from, to);
    };
    assert.throws(
      () => updater.update(f.io, f.source, f.target, false),
      /injected move failure/
    );
    preserved(f.target, f.state);
    for (const name of Object.values(names))
      assert.equal(installedVersion(path.join(f.target, name)), "0.2.1");
  });
test("failure in HSR after the other games changed restores all games", () => {
  const f = setup(true),
    original = f.io.move;
  let injected = false;
  f.io.move = (from, to) => {
    if (!injected && to === path.join(f.target, "HSR/launcher-data/dist")) {
      injected = true;
      throw Error("late failure");
    }
    original(from, to);
  };
  assert.throws(
    () => updater.update(f.io, f.source, f.target, false),
    /late failure/
  );
  assert.ok(injected);
  preserved(f.target, f.state);
  for (const name of Object.values(names))
    assert.equal(installedVersion(path.join(f.target, name)), "0.2.1");
});
test("copy failure before committing changes no installed files", () => {
  const f = setup(),
    original = f.io.copy;
  f.io.copy = (from, to) => {
    if (to.includes("/old/launcher-data/dist")) throw Error("disk full");
    original(from, to);
  };
  assert.throws(
    () => updater.update(f.io, f.source, f.target, false),
    /disk full/
  );
  preserved(f.target, f.state);
  assert.equal(installedVersion(f.target), "0.2.1");
});
test("checksum rejection precedes any installation changes", () => {
  const f = setup(),
    before = updater.fingerprint(f.io, f.base, "old");
  put(path.join(f.source, "launcher-data/dist/index.html"), "corrupt");
  assert.throws(
    () => updater.update(f.io, f.source, f.target, false),
    /checksum mismatch/
  );
  assert.equal(updater.fingerprint(f.io, f.base, "old"), before);
});
test("same-game region mismatch is rejected without changing data", () => {
  const f = setup();
  game(f.source, "hsr", "0.2.2", "cn", true);
  assert.throws(
    () => updater.update(f.io, f.source, f.target, false),
    /different game or region/
  );
  preserved(f.target, f.state);
});
test("downgrade is refused", () => {
  const f = setup();
  json(path.join(f.target, "LAUNCHER-BUILD.json"), {
    version: "0.2.3",
    game: "hsr",
    region: "global",
  });
  assert.throws(
    () => updater.update(f.io, f.source, f.target, false),
    /older than/
  );
  preserved(f.target, f.state);
});
test("running launcher is refused before creating backup folders", () => {
  const f = setup();
  f.io.running = () => true;
  assert.throws(
    () => updater.update(f.io, f.source, f.target, false),
    /Quit the selected/
  );
  assert.equal(
    fs.existsSync(path.join(f.target, ".yaagl-update-backups")),
    false
  );
  preserved(f.target, f.state);
});
test("another updater holding the lock is refused", () => {
  const f = setup();
  json(path.join(f.target, ".yaagl-update-lock/owner.json"), {
    pid: process.pid,
  });
  assert.throws(
    () => updater.update(f.io, f.source, f.target, false),
    /Another YAAGL update/
  );
  preserved(f.target, f.state);
});
test("rollback refuses changed program files", () => {
  const f = setup(),
    result = updater.update(f.io, f.source, f.target, false);
  put(
    path.join(f.target, "launcher-data/dist/user-mod.js"),
    "custom program change"
  );
  assert.throws(
    () => updater.rollback(f.io, result.backup),
    /changed after this update/
  );
  preserved(f.target, f.state);
  assert.equal(installedVersion(f.target), "0.2.2");
});
test("rollback refuses a damaged original-file backup", () => {
  const f = setup(),
    result = updater.update(f.io, f.source, f.target, false);
  put(
    path.join(result.backup, "old/launcher-data/dist/index.html"),
    "corrupt backup"
  );
  assert.throws(
    () => updater.rollback(f.io, result.backup),
    /backup checksum mismatch/
  );
  preserved(f.target, f.state);
});
test("interrupted prepared transaction can restore a missing app", () => {
  const f = setup(),
    result = updater.update(f.io, f.source, f.target, false);
  const file = path.join(result.backup, "transaction.json"),
    record = JSON.parse(fs.readFileSync(file));
  record.phase = "prepared";
  json(file, record);
  fs.rmSync(path.join(f.target, updater.apps.hsr), { recursive: true });
  updater.rollback(f.io, result.backup);
  preserved(f.target, f.state);
  assert.equal(installedVersion(f.target), "0.2.1");
});
test("rollback journal cannot target a Wine prefix", () => {
  const f = setup(),
    result = updater.update(f.io, f.source, f.target, false);
  const file = path.join(result.backup, "transaction.json"),
    record = JSON.parse(fs.readFileSync(file));
  record.entries[0].path = "launcher-data/wineprefix-nvk";
  json(file, record);
  assert.throws(
    () => updater.rollback(f.io, result.backup),
    /Invalid rollback path/
  );
  preserved(f.target, f.state);
});
test("source and destination must be separate folders", () => {
  const f = setup();
  assert.throws(
    () => updater.update(f.io, f.source, f.source, false),
    /separate folder/
  );
});

test("program parent symlinks cannot redirect writes outside the installation", () => {
  const f = setup();
  const outside = path.join(f.base, "outside-data");
  fs.renameSync(path.join(f.target, "launcher-data"), outside);
  fs.symlinkSync(outside, path.join(f.target, "launcher-data"));
  const before = updater.fingerprint(f.io, f.base, "outside-data");
  assert.throws(
    () => updater.update(f.io, f.source, f.target, false),
    /real program directories/
  );
  assert.equal(updater.fingerprint(f.io, f.base, "outside-data"), before);
});

test("bad app signature is rejected before staging", () => {
  const f = setup();
  f.io.verifyApp = () => {
    throw Error("bad app signature");
  };
  assert.throws(
    () => updater.update(f.io, f.source, f.target, false),
    /bad app signature/
  );
  assert.equal(
    fs.existsSync(path.join(f.target, ".yaagl-update-backups")),
    false
  );
  preserved(f.target, f.state);
});
