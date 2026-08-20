"""KIV-218 remediation of the KIV-217 no-production A2 PCSB query/driver package.

This package authors a capture driver and query sequence. It does not
authenticate to production, capture PCSB-n, or self-review.
"""

from .constants import PACKAGE_ID, PACKAGE_VERSION

__all__ = ["PACKAGE_ID", "PACKAGE_VERSION"]
