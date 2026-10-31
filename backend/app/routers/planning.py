from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.auth import User, require_planner
from app.services import planning

router = APIRouter(prefix='/api/planning',tags=['planning'],dependencies=[Depends(require_planner)])

class Site(BaseModel):
    name: str = Field(min_length=1,max_length=100)
    latitude: float = Field(ge=-90,le=90,allow_inf_nan=False)
    longitude: float = Field(ge=-180,le=180,allow_inf_nan=False)

class Assessment(BaseModel):
    sites: list[Site] = Field(min_length=1,max_length=2)
    radius_m: int = Field(default=1000,ge=250,le=3000)
    objective: Literal['landuse','infrastructure','amenities','active_mobility','roads','policy'] = 'amenities'

class Scenario(Assessment):
    title: str = Field(min_length=3,max_length=150)
    notes: str = Field(default='',max_length=5000)

def compute(request: Assessment):
    if not planning.catalog()['ready']: raise HTTPException(503,'Planning layers are not prepared. Run tools/prepare_planning_data.py.')
    try: return planning.assess([s.model_dump() for s in request.sites],request.radius_m,request.objective)
    except ValueError as exc: raise HTTPException(422,str(exc)) from exc

@router.get('/catalog')
def catalog(): return planning.catalog()

@router.post('/assess')
def assess(request:Assessment): return compute(request)

@router.get('/scenarios')
def scenarios(user:User=Depends(require_planner)): return {'scenarios':planning.list_scenarios(user.id)}

@router.post('/scenarios')
def save(request:Scenario,user:User=Depends(require_planner)):
    return planning.save_scenario(user.id,request.title,request.notes,compute(request))
