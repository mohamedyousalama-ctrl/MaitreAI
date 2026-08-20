"""KIV-231 conninfo destination-binding remediation of the KIV-229 candidate.

Default capture remains refused. The reviewed authorized-capture seam is
disabled until a later Linear work order supplies matching runtime authority
for route_class direct-postgres. Effective libpq destination is bound to the
authority-validated identity. Session Pooler is continuity-ineligible.
This package does not authenticate to production or capture PCSB-n.
"""

from .constants import PACKAGE_ID, PACKAGE_VERSION

__all__ = ["PACKAGE_ID", "PACKAGE_VERSION"]
