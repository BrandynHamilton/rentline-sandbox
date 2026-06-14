"""
Structured logger for the application.
"""
import logging
import sys


def _build_logger() -> logging.Logger:
    log = logging.getLogger("rwa_issuer")
    if log.handlers:
        return log

    log.setLevel(logging.DEBUG)
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.DEBUG)
    fmt = logging.Formatter(
        "[%(asctime)s] %(levelname)-8s %(name)s — %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(fmt)
    log.addHandler(handler)
    return log


logger = _build_logger()
