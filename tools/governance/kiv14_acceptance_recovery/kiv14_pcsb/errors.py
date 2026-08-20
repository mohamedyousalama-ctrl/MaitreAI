from __future__ import annotations


class FailClosed(RuntimeError):
    """Any capture/package failure that must stop the run with no retry."""


class P0GateFailure(FailClosed):
    pass


class ContinuityFailure(FailClosed):
    pass


class SequenceViolation(FailClosed):
    pass


class StaticContractFailure(FailClosed):
    pass


class Hold(RuntimeError):
    """Lawful package HOLD — missing topology/prerequisite, not a workaround."""


class CaptureAuthorityRefused(RuntimeError):
    """Raised before authentication when capture authority is missing or mismatched.

    This is not a post-authentication capture failure and must not retry.
    """


class ConninfoDestinationRefused(CaptureAuthorityRefused):
    """Raised before authentication when conninfo destination/identity is ambiguous.

    Covers URI query overrides, hostaddr, service/service-file indirection,
    libpq environment destination defaults, multi-host lists, duplicate identity
    keys, and unix-socket / empty-host fallback. This is a pre-auth refusal.
    """
