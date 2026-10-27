#!/usr/bin/env python3
"""Exercise the packaged entry point from normal and relocated app paths."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
APP = "YAAGL NVK - Test.app"


class LaunchTests(unittest.TestCase):
    def setUp(self):
        work = Path(os.environ.get("YAAGL_TEST_PACKAGE_WORK", HERE.parents[2] / "yaagl-launch-tests"))
        work.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix="launch with spaces ", dir=work)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.original = self.root / "Original package"
        self.data = self.original / "launcher-data"
        self.data.mkdir(parents=True)
        (self.data / "neutralino.config.json").write_text("{}")

    def entry(self, app):
        mac = app / "Contents/MacOS"
        mac.mkdir(parents=True)
        wrapper = mac / "parameterized"
        wrapper.write_text((HERE / "launch-app.sh").read_text().replace("@APP_NAME@", APP))
        wrapper.chmod(0o755)
        binary = mac / "Yaagl"
        binary.write_text('#!/bin/bash\nprintf "%s\\n" "$PWD" "$1" "$TMPDIR" "$PATH_LAUNCH" "$0"\n')
        binary.chmod(0o755)
        return wrapper

    def assert_launch(self, entry, *args):
        subprocess.run([str(entry), *args], cwd="/", check=True, capture_output=True, text=True)
        lines = (self.data / "logs/launcher-console.log").read_text().splitlines()
        self.assertEqual(lines, [str(self.data), "--path=" + str(self.data),
                                str(self.data / "nvk-state/tmp"), str(self.original / APP),
                                str(entry.parent / "Yaagl")])

    def test_direct_launch_uses_its_adjacent_data(self):
        self.assert_launch(self.entry(self.original / APP))

    def test_translocated_app_uses_original_package_and_writable_data(self):
        relocated = self.root / "AppTranslocation/id/d"
        entry = self.entry(relocated / APP)
        self.assert_launch(entry, "--yaagl-root", str(self.original))
        self.assertFalse((relocated / "launcher-data").exists())

    def test_bad_location_arguments_fail_before_writing_data(self):
        entry = self.entry(self.original / APP)
        for args in [("--yaagl-root",), ("--other", str(self.original)), ("--yaagl-root", "relative")]:
            result = subprocess.run([str(entry), *args], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Invalid launcher location", result.stderr)
        self.assertFalse((self.data / "logs").exists())


if __name__ == "__main__":
    unittest.main()
