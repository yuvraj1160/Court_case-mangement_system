"""
Court Case Management System - Filings Module
Manages court filings with dual-source party validation and strict field immutability.
"""

from flask import Blueprint

filings_bp = Blueprint("filings", __name__)

from backend.filings import routes  # noqa: E402, F401

