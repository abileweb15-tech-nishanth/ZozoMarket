"""Limit ORM reads to the signed-in workspace.

Background jobs and public tracking links leave the context empty, so they can see every
workspace. A request sets it for the duration of that request only.
"""

from contextvars import ContextVar

from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria

from app.models.base import WorkspaceMixin

current_workspace_id: ContextVar[str | None] = ContextVar("current_workspace_id", default=None)


class workspace_scope:
    """Temporarily read and write as one workspace (public forms, confirmation links)."""

    def __init__(self, workspace_id: str) -> None:
        self.workspace_id = workspace_id
        self._token = None

    def __enter__(self):
        self._token = current_workspace_id.set(self.workspace_id)
        return self

    def __exit__(self, *exc) -> None:
        if self._token is not None:
            current_workspace_id.reset(self._token)

_installed = False


def install_tenant_filter() -> None:
    global _installed
    if _installed:
        return
    _installed = True

    @event.listens_for(Session, "do_orm_execute")
    def _scope_selects(execute_state) -> None:
        workspace_id = current_workspace_id.get()
        if not execute_state.is_select or workspace_id is None:
            return
        if execute_state.execution_options.get("include_all_workspaces"):
            return
        execute_state.statement = execute_state.statement.options(
            with_loader_criteria(
                WorkspaceMixin,
                lambda cls: cls.workspace_id == workspace_id,
                include_aliases=True,
            )
        )
