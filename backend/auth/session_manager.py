"""
Court Case Management System - Session Management Subsystem
Handles server-side session lifecycle, supported session ID regeneration,
and session eviction on logout using Flask-Session's public interface.

Safety Rules:
  - Session IDs are regenerated immediately upon successful authentication
    to prevent Session Fixation attacks.
  - Relies exclusively on Flask-Session's supported public session_interface API.
  - Raises explicit RuntimeError if session_interface cannot regenerate session IDs.
  - Never accesses or modifies private internal session attributes.
  - Destroys server-side session state and expires client cookies on logout.
"""

import logging
from typing import Any, Dict, Optional
from flask import current_app, session

logger = logging.getLogger(__name__)


def regenerate_session_id() -> str:
    """
    Regenerate the session identifier using Flask-Session's public session_interface.
    This evicts the pre-login session and establishes a brand new session identifier,
    thwarting session fixation attacks.

    Returns:
        str: The newly assigned session ID.

    Raises:
        RuntimeError: If Flask-Session interface does not support session regeneration.
    """
    interface = current_app.session_interface
    if not hasattr(interface, "regenerate"):
        raise RuntimeError(
            "Session fixation protection failure: session_interface does not implement 'regenerate'."
        )

    # In Flask-Session, ServerSideSession.__bool__() evaluates False when empty.
    # If the session is empty, interface.regenerate(session) would skip regeneration.
    # We set a temporary key so bool(session) is True, execute regenerate, then pop it.
    if not session:
        session["_init"] = True

    interface.regenerate(session)
    session.pop("_init", None)
    session.modified = True
    return getattr(session, "sid", "")


def establish_user_session(user_data: Dict[str, Any]) -> None:
    """
    Establish an authenticated user session.

    Clears any pre-existing session values, regenerates the session ID,
    and populates minimal identity metadata.

    Args:
        user_data: Sanitized dictionary containing user_id, username, role, judge_id.
    """
    # 1. Clear any pre-login session state
    session.clear()

    # 2. Regenerate session ID using supported public API
    regenerate_session_id()

    # 3. Store minimal identity context
    session["user_id"] = user_data["user_id"]
    session["username"] = user_data["username"]
    session["role"] = user_data["role"]
    session["judge_id"] = user_data.get("judge_id")

    session.permanent = True
    session.modified = True


def terminate_user_session() -> None:
    """
    Terminate the authenticated session on logout.
    Clears the session dictionary and marks it modified so Flask-Session
    removes the server-side storage record and instructs the client to delete the cookie.
    """
    session.clear()
    session.modified = True


def get_current_session_user() -> Optional[Dict[str, Any]]:
    """
    Retrieve identity attributes stored in the active session.

    Returns:
        dict: User session info if authenticated, else None.
    """
    user_id = session.get("user_id")
    if not user_id:
        return None

    return {
        "user_id": user_id,
        "username": session.get("username"),
        "role": session.get("role"),
        "judge_id": session.get("judge_id"),
    }
