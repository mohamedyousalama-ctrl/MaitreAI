"""KIV-221 capture-binding remediation of the KIV-220-accepted query/driver package.

Default capture remains refused. The reviewed authorized-capture seam is
disabled until a later Linear work order supplies matching runtime authority.
This package does not authenticate to production or capture PCSB-n.
"""

from .constants import PACKAGE_ID, PACKAGE_VERSION

__all__ = ["PACKAGE_ID", "PACKAGE_VERSION"]
