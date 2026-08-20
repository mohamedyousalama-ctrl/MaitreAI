from __future__ import annotations

from kiv14_pcsb.__main__ import cmd_capture, main


def test_capture_command_refused():
    assert cmd_capture() == 2
    assert main(["capture"]) == 2
