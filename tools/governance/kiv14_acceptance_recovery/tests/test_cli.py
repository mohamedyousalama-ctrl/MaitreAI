from __future__ import annotations

import pytest

from kiv14_pcsb.__main__ import cmd_capture, main


def test_capture_command_refused():
    assert cmd_capture() == 2
    assert main(["capture"]) == 2


def test_authorized_capture_requires_bindings():
    with pytest.raises(SystemExit) as exc:
        main(["authorized-capture"])
    assert exc.value.code == 2
