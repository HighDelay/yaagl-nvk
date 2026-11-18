/* Launcher-only updates using macOS JavaScript for Automation and Foundation. */
var YAAGLUpdater = (function () {
  "use strict";
  var APPS = {
    zzz: "YAAGL NVK - ZZZ.app",
    gi: "YAAGL NVK - Genshin Impact.app",
    hsr: "YAAGL NVK - Honkai Star Rail.app",
  };
  var GAME_DIRS = { zzz: "ZZZ", gi: "GI", hsr: "HSR" };
  var GAME_PATHS = [
    "launcher-data/dist",
    "launcher-data/sidecar",
    "launcher-data/src/icons",
    "launcher-data/neutralino.config.json",
    "Start YAAGL NVK.command",
    "Update YAAGL NVK.command",
    "update-launcher.js",
    "UPDATE-MANIFEST.json",
    "README.md",
    "YAAGL-LICENSE.txt",
    "LAUNCHER-BUILD.json",
  ];
  var TOP_PATHS = [
    "Update YAAGL NVK.command",
    "update-launcher.js",
    "UPDATE-MANIFEST.json",
    "README.md",
    "GUIDE.md",
    "YAAGL-LICENSE.txt",
    "COMBINED-BUILD.json",
  ];
  var TOP_OPTIONAL = [
    "REUSED-COMPONENTS.json",
    "REBUILT-COMPONENTS.json",
    "UPSTREAM-COMPONENTS.json",
  ];
  var BACKUPS = ".yaagl-update-backups";
  var LOCK = ".yaagl-update-lock";

  function fail(message) {
    throw new Error(message);
  }
  function join(root, relative) {
    return root.replace(/\/$/, "") + "/" + relative;
  }
  function parent(path) {
    return path.replace(/\/[^/]+\/?$/, "") || "/";
  }
  function readJSON(io, path) {
    return JSON.parse(io.read(path));
  }
  function writeJSON(io, path, value) {
    io.write(path, JSON.stringify(value, null, 2) + "\n");
  }
  function sameArray(a, b) {
    return (
      JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort())
    );
  }
  function metadata(name) {
    return name === ".DS_Store" || name.indexOf("._") === 0;
  }
  function beneath(path, root) {
    return path === root || path.indexOf(root + "/") === 0;
  }
  function safeRelative(path) {
    return (
      typeof path === "string" &&
      path.length > 0 &&
      path[0] !== "/" &&
      path.split("/").every(function (part) {
        return part && part !== "." && part !== "..";
      })
    );
  }
  function groupAllows(path, groups) {
    return (
      safeRelative(path) &&
      groups.some(function (group) {
        return beneath(path, group);
      })
    );
  }
  function allowedPath(path) {
    if (!safeRelative(path)) return false;
    if (
      TOP_PATHS.indexOf(path) >= 0 ||
      TOP_OPTIONAL.indexOf(path) >= 0 ||
      GAME_PATHS.indexOf(path) >= 0
    )
      return true;
    var tail = path;
    Object.keys(GAME_DIRS).some(function (game) {
      var prefix = GAME_DIRS[game] + "/";
      if (path.indexOf(prefix) === 0) {
        tail = path.slice(prefix.length);
        return true;
      }
      return false;
    });
    return (
      GAME_PATHS.indexOf(tail) >= 0 ||
      Object.keys(APPS).some(function (game) {
        return tail === APPS[game];
      })
    );
  }
  function walk(io, root, relative, visit) {
    var path = join(root, relative),
      info = io.stat(path);
    if (!info) fail("Missing launcher file: " + path);
    visit(relative, info);
    if (info.type === "directory")
      io.list(path)
        .sort()
        .forEach(function (name) {
          if (!metadata(name)) walk(io, root, relative + "/" + name, visit);
        });
  }
  function checkParents(io, root, relative) {
    var parts = relative.split("/");
    for (var index = 1; index < parts.length; index++) {
      var directory = join(root, parts.slice(0, index).join("/"));
      var info = io.stat(directory);
      if (info && info.type !== "directory")
        fail("Use an installation with real program directories: " + directory);
    }
  }
  function fingerprint(io, root, relative) {
    if (!io.stat(join(root, relative))) return null;
    var records = [];
    walk(io, root, relative, function (name, info) {
      var value = [
        name === relative ? "" : name.slice(relative.length + 1),
        info.type,
        info.mode,
      ];
      if (info.type === "file") value.push(io.hashFile(join(root, name)));
      else if (info.type === "symlink")
        value.push(io.readlink(join(root, name)));
      else if (info.type !== "directory")
        fail("Unsupported launcher file: " + name);
      records.push(value);
    });
    return io.hashText(JSON.stringify(records));
  }
  function version(value) {
    if (!/^\d+\.\d+\.\d+$/.test(value))
      fail("Unrecognized launcher version: " + value);
    return value.split(".").map(Number);
  }
  function older(incoming, installed) {
    var a = version(incoming),
      b = version(installed);
    for (var index = 0; index < a.length; index++) {
      if (a[index] !== b[index]) return a[index] < b[index];
    }
    return false;
  }
  function manifest(io, root) {
    var record = readJSON(io, join(root, "UPDATE-MANIFEST.json"));
    if (
      record.schema_version !== 1 ||
      ["game", "combined"].indexOf(record.kind) < 0
    )
      fail("Use a complete, newly extracted YAAGL NVK update package.");
    var groups =
      record.kind === "game"
        ? [APPS[record.game]].concat(GAME_PATHS)
        : TOP_PATHS.concat(
            TOP_OPTIONAL.filter(function (path) {
              return !!io.stat(join(root, path));
            })
          );
    if (!groups[0] || !sameArray(record.program_paths, groups))
      fail("Invalid update file list.");
    var covered = {};
    groups.forEach(function (group) {
      walk(io, root, group, function (relative, info) {
        if (relative === "UPDATE-MANIFEST.json") return;
        covered[relative] = true;
        var entry = record.entries[relative];
        if (!entry || entry.type !== info.type || entry.mode !== info.mode)
          fail("Update file type/permissions mismatch: " + relative);
        if (
          info.type === "file" &&
          entry.sha256 !== io.hashFile(join(root, relative))
        )
          fail("Update checksum mismatch: " + relative);
        if (
          info.type === "symlink" &&
          (entry.target !== io.readlink(join(root, relative)) ||
            !beneath(io.canonical(join(root, relative)), root))
        )
          fail("Invalid update symlink: " + relative);
      });
    });
    if (!sameArray(Object.keys(covered), Object.keys(record.entries)))
      fail("Incomplete update manifest.");
    return record;
  }
  function checkGame(io, source, target) {
    var update = manifest(io, source);
    if (update.kind !== "game")
      fail("Choose the existing game launcher folder.");
    var installed = readJSON(io, join(target, "LAUNCHER-BUILD.json"));
    var config = readJSON(
      io,
      join(target, "launcher-data/neutralino.config.json")
    );
    if (
      installed.game !== update.game ||
      installed.region !== update.region ||
      config.applicationId !== update.application_id
    )
      fail("The selected launcher belongs to a different game or region.");
    if (older(update.version, installed.version))
      fail("This update is older than the installed launcher.");
    if (io.appId(join(source, APPS[update.game])) !== update.application_id)
      fail("The update app identity does not match.");
    io.verifyApp(join(source, APPS[update.game]));
    return update;
  }
  function assertClosed(io, roots) {
    if (io.running(roots))
      fail(
        "Quit the selected YAAGL launchers and their games, then run the update again."
      );
  }
  function validateJournal(journal) {
    if (
      journal.schema_version !== 1 ||
      !Array.isArray(journal.entries) ||
      !journal.entries.length
    )
      fail("Invalid rollback record.");
    if (
      !Array.isArray(journal.data_roots) ||
      !journal.data_roots.length ||
      journal.data_roots.some(function (path) {
        return (
          [
            "launcher-data",
            "ZZZ/launcher-data",
            "GI/launcher-data",
            "HSR/launcher-data",
          ].indexOf(path) < 0
        );
      })
    )
      fail("Invalid rollback launcher paths.");
    var seen = {};
    journal.entries.forEach(function (entry) {
      if (
        !allowedPath(entry.path) ||
        seen[entry.path] ||
        !/^[a-f0-9]{64}$/.test(entry.next) ||
        (entry.previous !== null && !/^[a-f0-9]{64}$/.test(entry.previous))
      )
        fail("Invalid rollback path or checksum.");
      seen[entry.path] = true;
    });
  }
  function acquire(io, root) {
    var path = join(root, LOCK);
    if (!io.mkdirExclusive(path)) {
      var owner = readJSON(io, join(path, "owner.json"));
      if (io.alive(owner.pid))
        fail("Another YAAGL update or rollback is running.");
      io.remove(path);
      if (!io.mkdirExclusive(path))
        fail("Another YAAGL update started. Retry after it finishes.");
    }
    writeJSON(io, join(path, "owner.json"), { pid: io.pid() });
    return path;
  }
  function restore(io, root, backup, automatic) {
    var journal = readJSON(io, join(backup, "transaction.json"));
    validateJournal(journal);
    if (journal.phase === "rolled-back") return;
    var partial = journal.phase !== "complete";
    assertClosed(
      io,
      journal.data_roots.map(function (path) {
        return join(root, path);
      })
    );
    // Preflight every file before changing any of the installed program files.
    journal.entries.forEach(function (entry) {
      checkParents(io, root, entry.path);
      checkParents(io, backup, "old/" + entry.path);
      var current = fingerprint(io, root, entry.path);
      var acceptable =
        current === entry.next ||
        (partial && (current === entry.previous || current === null));
      if (!acceptable)
        fail(
          "Launcher files changed after this update. Rollback stopped to preserve them: " +
            entry.path
        );
      if (
        entry.previous !== null &&
        (current !== entry.previous || !partial) &&
        fingerprint(io, join(backup, "old"), entry.path) !== entry.previous
      )
        fail("Rollback backup checksum mismatch: " + entry.path);
    });
    journal.phase = "rolling-back";
    writeJSON(io, join(backup, "transaction.json"), journal);
    journal.entries
      .slice()
      .reverse()
      .forEach(function (entry) {
        if (fingerprint(io, root, entry.path) === entry.previous) return;
        var destination = join(root, entry.path),
          saved = join(backup, "replaced-new/" + entry.path);
        if (io.stat(destination)) {
          if (io.stat(saved)) io.remove(saved);
          io.mkdir(parent(saved));
          io.move(destination, saved);
        }
        if (entry.previous !== null) {
          io.mkdir(parent(destination));
          io.copy(join(backup, "old/" + entry.path), destination);
          if (fingerprint(io, root, entry.path) !== entry.previous)
            fail("Could not verify restored launcher: " + entry.path);
        }
      });
    journal.phase = "rolled-back";
    writeJSON(io, join(backup, "transaction.json"), journal);
    ["displaced", "new"].forEach(function (name) {
      if (io.stat(join(backup, name))) io.remove(join(backup, name));
    });
    if (!automatic)
      return {
        changed: journal.entries.length,
        backup: backup,
        rollback: true,
      };
  }
  function rollback(io, backup) {
    backup = io.canonical(backup);
    if (parent(backup).split("/").pop() !== BACKUPS)
      fail("Choose the original YAAGL rollback backup folder.");
    var root = parent(parent(backup)),
      lock = acquire(io, root);
    try {
      return restore(io, root, backup, false) || { changed: 0, rollback: true };
    } finally {
      io.remove(lock);
    }
  }
  function update(io, source, target, dryRun) {
    source = io.canonical(source);
    target = io.canonical(target);
    if (beneath(source, target) || beneath(target, source))
      fail("Extract the update into a separate folder before running it.");
    var incoming = manifest(io, source),
      games = [],
      root = target,
      top = false;
    var targetCombined = io.stat(join(target, "COMBINED-BUILD.json"));
    if (incoming.kind === "combined" && targetCombined) {
      top = true;
      Object.keys(GAME_DIRS).forEach(function (game) {
        games.push({
          source: join(source, GAME_DIRS[game]),
          target: join(target, GAME_DIRS[game]),
          prefix: GAME_DIRS[game] + "/",
        });
      });
    } else if (incoming.kind === "game" && targetCombined) {
      games.push({
        source: source,
        target: join(target, GAME_DIRS[incoming.game]),
        prefix: GAME_DIRS[incoming.game] + "/",
      });
    } else {
      var old = readJSON(io, join(target, "LAUNCHER-BUILD.json"));
      if (!APPS[old.game]) fail("Choose the existing YAAGL NVK game folder.");
      if (targetCombined)
        fail("Choose the matching game folder inside the installation.");
      var prefix = "";
      if (
        io.stat(join(parent(target), "COMBINED-BUILD.json")) &&
        target.split("/").pop() === GAME_DIRS[old.game]
      ) {
        root = parent(target);
        prefix = GAME_DIRS[old.game] + "/";
      }
      games.push({
        source:
          incoming.kind === "combined"
            ? join(source, GAME_DIRS[old.game])
            : source,
        target: target,
        prefix: prefix,
      });
    }
    var entries = [],
      dataRoots = [],
      names = [];
    function plan(src, dst, prefix, groups) {
      groups.forEach(function (path) {
        checkParents(io, src, path);
        checkParents(io, dst, path);
        var next = fingerprint(io, src, path),
          previous = fingerprint(io, dst, path);
        if (next !== previous)
          entries.push({
            path: prefix + path,
            source: join(src, path),
            previous: previous,
            next: next,
          });
      });
    }
    games.forEach(function (game) {
      var record = checkGame(io, game.source, game.target);
      plan(game.source, game.target, game.prefix, record.program_paths);
      dataRoots.push(game.prefix + "launcher-data");
      names.push(GAME_DIRS[record.game]);
    });
    if (top) plan(source, target, "", incoming.program_paths);
    assertClosed(
      io,
      dataRoots.map(function (path) {
        return join(root, path);
      })
    );
    if (!entries.length || dryRun)
      return { changed: entries.length, games: names, dry_run: !!dryRun };
    var lock = acquire(io, root),
      backup = null,
      committing = false;
    try {
      var backups = join(root, BACKUPS);
      if (io.stat(backups) && io.stat(backups).type !== "directory")
        fail("The YAAGL backup location must be a real directory.");
      if (io.stat(backups))
        io.list(backups).forEach(function (name) {
          var record = join(backups, name + "/transaction.json");
          if (
            io.stat(record) &&
            ["complete", "rolled-back"].indexOf(readJSON(io, record).phase) < 0
          )
            fail(
              "An earlier update needs recovery. Run Rollback YAAGL NVK.command in: " +
                join(backups, name)
            );
        });
      backup = join(backups, io.transactionId());
      io.mkdir(backup);
      var journal = {
        schema_version: 1,
        phase: "preparing",
        version: incoming.version,
        games: names,
        data_roots: dataRoots,
        entries: entries.map(function (entry) {
          return {
            path: entry.path,
            previous: entry.previous,
            next: entry.next,
          };
        }),
      };
      writeJSON(io, join(backup, "transaction.json"), journal);
      io.copy(join(source, "update-launcher.js"), join(backup, "updater.js"));
      io.write(
        join(backup, "Rollback YAAGL NVK.command"),
        '#!/bin/bash\nset -eu\ntask_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"\nexec /usr/bin/osascript -l JavaScript "$task_root/updater.js" --rollback "$task_root"\n'
      );
      io.chmod(join(backup, "Rollback YAAGL NVK.command"), 493);
      entries.forEach(function (entry) {
        var staged = join(backup, "new/" + entry.path);
        io.mkdir(parent(staged));
        io.copy(entry.source, staged);
        if (fingerprint(io, join(backup, "new"), entry.path) !== entry.next)
          fail("Staged update verification failed: " + entry.path);
        if (entry.previous !== null) {
          var oldPath = join(backup, "old/" + entry.path);
          io.mkdir(parent(oldPath));
          io.copy(join(root, entry.path), oldPath);
          if (
            fingerprint(io, join(backup, "old"), entry.path) !== entry.previous
          )
            fail("Backup verification failed: " + entry.path);
        }
      });
      assertClosed(
        io,
        dataRoots.map(function (path) {
          return join(root, path);
        })
      );
      entries.forEach(function (entry) {
        if (fingerprint(io, root, entry.path) !== entry.previous)
          fail("Launcher changed while preparing the update: " + entry.path);
      });
      journal.phase = "prepared";
      writeJSON(io, join(backup, "transaction.json"), journal);
      committing = true;
      entries.forEach(function (entry) {
        var destination = join(root, entry.path),
          displaced = join(backup, "displaced/" + entry.path);
        if (io.stat(destination)) {
          io.mkdir(parent(displaced));
          io.move(destination, displaced);
        }
        io.mkdir(parent(destination));
        io.move(join(backup, "new/" + entry.path), destination);
        if (fingerprint(io, root, entry.path) !== entry.next)
          fail("Installed update verification failed: " + entry.path);
      });
      journal.phase = "complete";
      writeJSON(io, join(backup, "transaction.json"), journal);
      if (io.stat(join(backup, "displaced")))
        io.remove(join(backup, "displaced"));
      if (io.stat(join(backup, "new"))) io.remove(join(backup, "new"));
      return { changed: entries.length, games: names, backup: backup };
    } catch (error) {
      if (committing) {
        try {
          restore(io, root, backup, true);
        } catch (recovery) {
          fail(
            error.message +
              "\nRecovery needs attention: " +
              recovery.message +
              "\nBackup: " +
              backup
          );
        }
      } else if (backup && io.stat(backup)) io.remove(backup);
      throw error;
    } finally {
      io.remove(lock);
    }
  }
  return {
    update: update,
    rollback: rollback,
    fingerprint: fingerprint,
    gamePaths: GAME_PATHS,
    topPaths: TOP_PATHS,
    apps: APPS,
  };
})();

function macOSUpdaterIO() {
  ObjC.import("Foundation");
  var fm = $.NSFileManager.defaultManager;
  function errorText(ref) {
    return ref[0]
      ? ObjC.unwrap(ref[0].localizedDescription)
      : "Unknown filesystem error";
  }
  function checked(method) {
    var error = Ref();
    if (!method(error)) throw new Error(errorText(error));
  }
  function task(command, args, input) {
    var process = $.NSTask.alloc.init,
      output = $.NSPipe.pipe;
    process.launchPath = command;
    process.arguments = args;
    process.standardOutput = output;
    process.standardError = output;
    var pipe;
    if (input !== undefined) {
      pipe = $.NSPipe.pipe;
      process.standardInput = pipe;
    }
    process.launch;
    if (pipe) {
      pipe.fileHandleForWriting.writeData(
        $(input).dataUsingEncoding($.NSUTF8StringEncoding)
      );
      pipe.fileHandleForWriting.closeFile;
    }
    var text = ObjC.unwrap(
      $.NSString.alloc.initWithDataEncoding(
        output.fileHandleForReading.readDataToEndOfFile,
        $.NSUTF8StringEncoding
      )
    );
    process.waitUntilExit;
    if (process.terminationStatus !== 0)
      throw new Error(command.split("/").pop() + " failed: " + text.trim());
    return text;
  }
  function stat(path) {
    if (!fm.fileExistsAtPath(path)) return null;
    var error = Ref(),
      attributes = fm.attributesOfItemAtPathError(path, error);
    if (!attributes) {
      if (error[0] && [4, 260].indexOf(Number(error[0].code)) >= 0) return null;
      throw new Error(errorText(error));
    }
    var type = ObjC.unwrap(attributes.objectForKey($.NSFileType));
    return {
      type:
        {
          NSFileTypeDirectory: "directory",
          NSFileTypeRegular: "file",
          NSFileTypeSymbolicLink: "symlink",
        }[type] || type,
      mode: Number(
        ObjC.unwrap(attributes.objectForKey($.NSFilePosixPermissions))
      ),
    };
  }
  return {
    stat: stat,
    canonical: function (path) {
      if (!stat(path)) throw new Error("File or folder not found: " + path);
      return ObjC.unwrap(
        $(path).stringByStandardizingPath.stringByResolvingSymlinksInPath
      );
    },
    list: function (path) {
      var error = Ref(),
        value = fm.contentsOfDirectoryAtPathError(path, error);
      if (!value) throw new Error(errorText(error));
      return ObjC.deepUnwrap(value);
    },
    read: function (path) {
      var error = Ref(),
        value = $.NSString.stringWithContentsOfFileEncodingError(
          path,
          $.NSUTF8StringEncoding,
          error
        );
      if (!value) throw new Error(errorText(error));
      return ObjC.unwrap(value);
    },
    write: function (path, value) {
      checked(function (error) {
        return $(value).writeToFileAtomicallyEncodingError(
          path,
          true,
          $.NSUTF8StringEncoding,
          error
        );
      });
    },
    mkdir: function (path) {
      checked(function (error) {
        return fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
          path,
          true,
          {},
          error
        );
      });
    },
    mkdirExclusive: function (path) {
      var error = Ref();
      if (
        fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
          path,
          false,
          {},
          error
        )
      )
        return true;
      if (stat(path)) return false;
      throw new Error(errorText(error));
    },
    copy: function (from, to) {
      checked(function (error) {
        return fm.copyItemAtPathToPathError(from, to, error);
      });
    },
    move: function (from, to) {
      checked(function (error) {
        return fm.moveItemAtPathToPathError(from, to, error);
      });
    },
    remove: function (path) {
      checked(function (error) {
        return fm.removeItemAtPathError(path, error);
      });
    },
    chmod: function (path, mode) {
      checked(function (error) {
        return fm.setAttributesOfItemAtPathError(
          { NSFilePosixPermissions: mode },
          path,
          error
        );
      });
    },
    readlink: function (path) {
      var error = Ref(),
        value = fm.destinationOfSymbolicLinkAtPathError(path, error);
      if (!value) throw new Error(errorText(error));
      return ObjC.unwrap(value);
    },
    hashFile: function (path) {
      return task("/usr/bin/shasum", ["-a", "256", path])
        .replace(/^\\/, "")
        .slice(0, 64);
    },
    hashText: function (text) {
      return task("/usr/bin/shasum", ["-a", "256"], text).slice(0, 64);
    },
    verifyApp: function (path) {
      task("/usr/bin/codesign", ["--verify", "--deep", "--strict", path]);
    },
    appId: function (path) {
      return task("/usr/bin/plutil", [
        "-extract",
        "CFBundleIdentifier",
        "raw",
        "-o",
        "-",
        path + "/Contents/Info.plist",
      ]).trim();
    },
    running: function (roots) {
      var lines = task("/bin/ps", ["-axo", "pid=,command="]).split("\n");
      return lines.some(function (line) {
        return roots.some(function (root) {
          return line.indexOf(root) >= 0;
        });
      });
    },
    alive: function (pid) {
      try {
        task("/bin/kill", ["-0", String(pid)]);
        return true;
      } catch (_) {
        return false;
      }
    },
    pid: function () {
      return Number($.NSProcessInfo.processInfo.processIdentifier);
    },
    transactionId: function () {
      return (
        new Date().toISOString().replace(/[:.]/g, "-") +
        "-" +
        Number($.NSProcessInfo.processInfo.processIdentifier)
      );
    },
  };
}

function run(argv) {
  var options = {},
    io = macOSUpdaterIO();
  for (var index = 0; index < argv.length; index++) {
    var key = argv[index];
    if (key === "--dry-run") options.dryRun = true;
    else if (
      ["--source", "--target", "--rollback"].indexOf(key) >= 0 &&
      argv[index + 1]
    )
      options[key.slice(2)] = argv[++index];
    else
      throw new Error(
        "Usage: Update YAAGL NVK.command [--target FOLDER] [--dry-run]"
      );
  }
  var result;
  if (options.rollback) result = YAAGLUpdater.rollback(io, options.rollback);
  else {
    if (!options.source)
      throw new Error(
        "Run the update command from the newly extracted launcher package."
      );
    if (!options.target) {
      var app = Application.currentApplication();
      app.includeStandardAdditions = true;
      options.target = app
        .chooseFolder({
          withPrompt:
            "Select your existing YAAGL NVK folder to update. Wine prefixes and settings will be kept.",
        })
        .toString();
    }
    result = YAAGLUpdater.update(
      io,
      options.source,
      options.target,
      options.dryRun
    );
  }
  if (result.dry_run)
    return (
      "Ready to update " +
      result.games.join(", ") +
      ": " +
      result.changed +
      " program items. No files changed."
    );
  if (!result.changed)
    return result.rollback
      ? "This update is already rolled back. No files changed."
      : "Already up to date. No files changed.";
  return (
    (result.rollback
      ? "Previous launcher restored."
      : "Updated " + result.games.join(", ") + ".") +
    " Wine prefixes, settings and caches were kept.\nBackup: " +
    result.backup
  );
}

if (typeof module !== "undefined" && module.exports)
  module.exports = YAAGLUpdater;
