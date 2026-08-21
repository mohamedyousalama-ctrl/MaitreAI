"""KIV-237 passfile / parser remediation of the KIV-234 candidate.

Default capture remains refused. The reviewed authorized-capture seam is
disabled until a later Linear work order supplies matching runtime authority
for route_class direct-postgres. Effective libpq destination is bound to the
authority-validated identity. Recognized libpq environment/default sources are
stripped for the connect call, default filesystem passfile lookup is
neutralized, and client_encoding is forced UTF8. Unquoted keyword backslash
and percent-encoded URI hosts fail closed. Session Pooler is
continuity-ineligible. This package does not authenticate to production or
capture PCSB-n.
"""

from .constants import PACKAGE_ID, PACKAGE_VERSION

__all__ = ["PACKAGE_ID", "PACKAGE_VERSION"]
