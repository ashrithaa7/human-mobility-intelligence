"""Actionable import failures, including a machine-readable validation report."""


class DatasetReadError(ValueError):
    def __init__(self, message: str, report: dict | None = None):
        super().__init__(message)
        self.report = report or {'errors': [message], 'warnings': []}
