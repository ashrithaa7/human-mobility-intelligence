"""Generate browser evidence from real prepared layers, without account credentials."""
import json
import sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'backend'))
from app.services.planning import assess, catalog
artifacts=Path(__file__).parent/'artifacts'
artifacts.mkdir(exist_ok=True)
result=assess([{'name':'Abids','latitude':17.3913,'longitude':78.4768},{'name':'Gachibowli','latitude':17.4401,'longitude':78.3489}],1000,'amenities')
(artifacts/'planning-assessment.json').write_text(json.dumps(result),encoding='utf-8')
(artifacts/'planning-catalog.json').write_text(json.dumps(catalog()),encoding='utf-8')
print('Prepared real-data browser fixtures; no authentication data included.')
