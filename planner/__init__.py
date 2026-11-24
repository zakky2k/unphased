"""Pure astronomy for the observation planner: night windows, twilight bands,
moon tracks and phase. No HTTP, no rendering — the §6 contract in
docs/REQUIREMENTS.md is the only thing that couples this package to a client.

The visual-design probe (design/probe.py) proved the math; this package is the
authoritative implementation. Where the two disagree, this package wins and
the probe should be updated to match.
"""

from .night import NightError, Site, compute_night, night_payload

__all__ = ["NightError", "Site", "compute_night", "night_payload"]
