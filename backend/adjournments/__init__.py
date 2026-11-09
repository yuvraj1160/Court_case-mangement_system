"""
Court Case Management System - Adjournments Module
Manages court adjournments as an append-only ledger linked to hearings.
"""

from flask import Blueprint

adjournments_bp = Blueprint("adjournments", __name__)

from backend.adjournments import routes  # noqa: E402, F401

