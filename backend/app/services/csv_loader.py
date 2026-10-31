"""Compatibility facade over format-specific readers and the local SQLite catalog."""
from __future__ import annotations

import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any

import pandas as pd

from app.services.dataset_readers import DatasetReadError, ingest_dataset
from app.services.mobility_store import MobilityStore

MAX_IMPORT_BYTES = 1024 * 1024 * 1024
SUPPORTED_SUFFIXES = {'.csv','.tsv','.txt','.xlsx','.xls','.json','.jsonl','.ndjson','.geojson','.zip','.plt'}


class CSVDataLoader:
    """Retained class/API name so existing routes keep working during migration."""

    def __init__(self, data_directory: str | None = None):
        self.data_directory = Path(data_directory or (Path(__file__).resolve().parents[2] / 'data'))
        self.data_directory.mkdir(parents=True, exist_ok=True)
        self.sample_path = Path(__file__).resolve().parents[1] / 'data' / 'sample_data.csv'
        self.store = MobilityStore(self.data_directory)

    def _safe_filename(self, filename: str) -> str:
        # Do not silently strip directory components: reject path traversal for every
        # format before constructing a destination path.
        if not filename or filename != Path(filename.replace('\\', '/')).name or '/' in filename or '\\' in filename:
            raise DatasetReadError('Dataset filename must be a plain filename without directory paths.')
        suffix = Path(filename).suffix.lower()
        if suffix not in SUPPORTED_SUFFIXES:
            raise DatasetReadError('Supported uploads: CSV, TSV, TXT, XLSX, XLS, JSON, JSONL/NDJSON, GeoJSON, ZIP and GeoLife PLT.')
        if len(filename) > 180 or any(ord(char) < 32 or char in '<>:"|?*' for char in filename) or filename.endswith((' ', '.')):
            raise DatasetReadError('Dataset filename contains unsupported or unsafe characters.')
        reserved={'CON','PRN','AUX','NUL',*[f'COM{i}' for i in range(1,10)],*[f'LPT{i}' for i in range(1,10)]}
        if filename.split('.')[0].upper() in reserved:
            raise DatasetReadError('Dataset filename is a reserved Windows device name.')
        return filename

    def _ensure_bundled_and_existing_sources(self) -> None:
        if self.sample_path.is_file() and not self.store.get_source(self.sample_path.name):
            ingest_dataset(self.sample_path, self.sample_path.name, self.store, {
                'label': 'Built-in Hyderabad demonstration sample', 'is_sample': True,
                'is_synthetic': True, 'source_url': 'Bundled project sample', 'license': 'Project demonstration data',
                'timezone': 'Asia/Kolkata', 'attribution': 'Synthetic demonstration data; not observed travel demand.'})
        for path in sorted(self.data_directory.iterdir()):
            if path.name.startswith('.') or path.name == self.store.path.name or path.suffix.lower() not in SUPPORTED_SUFFIXES:
                continue
            if path.is_file() and not self.store.get_source(path.name):
                try:
                    ingest_dataset(path, path.name, self.store, {'label': path.stem, 'license': 'unspecified', 'source_url': 'Local existing file'})
                except DatasetReadError:
                    # An invalid legacy file remains visible as a failed source in its importer logs;
                    # it is excluded from selectable sources rather than poisoning valid data.
                    continue

    def _find_datasets(self) -> list[str]:
        self._ensure_bundled_and_existing_sources()
        return [item['filename'] for item in self.store.list_sources()]

    def get_active_dataset(self) -> str | None:
        self._ensure_bundled_and_existing_sources()
        available = self.store.list_sources()
        active_file = self.data_directory / '.active_dataset'
        try:
            configured = active_file.read_text(encoding='utf-8').strip()
            if self.store.get_source(configured): return configured
        except OSError:
            pass
        return None

    def activate_dataset(self, filename: str) -> None:
        self._ensure_bundled_and_existing_sources()
        if not self.store.get_source(filename): raise DatasetReadError(f'No ready data source named {filename!r}.')
        (self.data_directory / '.active_dataset').write_text(filename, encoding='utf-8')

    def import_path(self, path: str | Path, filename: str, metadata: dict[str, Any] | None = None) -> dict:
        self._ensure_bundled_and_existing_sources()
        safe_name = self._safe_filename(filename)
        source_path = Path(path)
        if not source_path.is_file(): raise DatasetReadError(f'Uploaded file {safe_name!r} was not written to staging storage.')
        if source_path.stat().st_size > MAX_IMPORT_BYTES:
            raise DatasetReadError('Dataset files must be 1 GB or smaller in the local deployment.')
        destination = self.data_directory / safe_name
        if destination.exists(): raise DatasetReadError(f"A source named '{safe_name}' already exists. Rename it to avoid overwriting.")
        if source_path.resolve() != destination.resolve(): shutil.move(str(source_path), str(destination))
        details = {'label': safe_name, 'license': 'unspecified', 'source_url': None, **(metadata or {})}
        try:
            result = ingest_dataset(destination, safe_name, self.store, details)
            if result['format']=='gtfs_static':
                try:
                    self.store.temporal_summary(safe_name)
                    self.store.od_summary(safe_name)
                    self.store.save_source_details(safe_name,{'prepared_analyses':['temporal','scheduled_corridors']})
                except Exception:
                    self.store.save_source_details(safe_name,{'preparation_warning':'The source imported successfully; summary preparation will be retried on the first analysis request.'})
                result['import_report']=self.store.get_source(safe_name).get('details',{})
            if result['record_count']:
                self.activate_dataset(safe_name)
                result['active'] = True
            else:
                result['active'] = False
                result['message'] = 'Geographic features were retained as reference geography; this source has no timestamped observations and was not activated for mobility analysis.'
            result.update({'filename': safe_name, 'label': details.get('label'), 'supported_analyses': result['supported_analyses']})
            return result
        except Exception:
            self.store.delete_source(safe_name)
            try: destination.unlink(missing_ok=True)
            except OSError: pass
            raise

    def import_dataset(self, filename: str, content: bytes, metadata: dict[str, Any] | None = None) -> dict:
        if not content: raise DatasetReadError('The uploaded file is empty.')
        if len(content) > MAX_IMPORT_BYTES: raise DatasetReadError('Dataset files must be 1 GB or smaller.')
        safe_name = self._safe_filename(filename)
        with tempfile.NamedTemporaryFile(dir=self.data_directory, prefix='.upload-', delete=False) as temp:
            temp.write(content)
            temporary_path = Path(temp.name)
        return self.import_path(temporary_path, safe_name, metadata)

    def get_available_datasets(self) -> list[dict]:
        self._ensure_bundled_and_existing_sources()
        sources=[]
        for item in self.store.list_sources():
            filepath = self.sample_path if item['is_sample'] else self.data_directory / item['filename']
            try: columns = pd.read_csv(filepath, nrows=0).columns.tolist() if item['format'] == 'csv' else []
            except Exception: columns=[]
            sources.append({**item, 'columns': columns, 'file_path': str(filepath), 'is_sample': item['is_sample']})
        return sources

    def load_dataset(self, filename: str, *, limit: int = 5000, offset: int = 0) -> dict:
        self._ensure_bundled_and_existing_sources()
        source=self.store.get_source(Path(filename).name)
        if not source: raise FileNotFoundError(f'Dataset not found or not ready: {filename}')
        limit=max(1,min(int(limit),50_000)); offset=max(0,int(offset))
        records,total=self.store.page_observations(source['filename'],limit=limit,offset=offset)
        return {'records':records,'metadata':{**source,'total_records':source['record_count'],'returned_records':len(records),
                'offset':offset,'has_more':offset+len(records)<total},'dataframe':pd.DataFrame(records)}
