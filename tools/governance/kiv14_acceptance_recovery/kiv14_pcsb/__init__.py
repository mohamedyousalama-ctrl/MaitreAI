"""KIV-254 evidence-custody remediation of the KIV-246 candidate.

Default capture remains refused. The reviewed authorized-capture seam is
disabled until a later Linear work order supplies matching runtime authority
for route_class direct-postgres. Consumed identities are PCSB-1/2/3/4; PCSB-5
is next unused and is not authorized by this package. Capture completeness
requires in-window per-step artifacts, timestamps, SHA/byte/line custody, and
an internal complete-PCSB digest list. This package does not authenticate to
production or capture PCSB-n.
"""

from .constants import PACKAGE_ID, PACKAGE_VERSION

__all__ = ["PACKAGE_ID", "PACKAGE_VERSION"]
