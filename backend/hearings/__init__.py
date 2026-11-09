"""
Court Case Management System - Hearings Module
Handles hearing listing, retrieval, and scheduling with strict concurrency and DST protections.
"""

from flask import Blueprint

hearings_bp = Blueprint("hearings", __name__)

from backend.hearings import routes  # noqa: E402, F401

