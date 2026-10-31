'use client'
import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { mobilityMapStyle, geometryPositions } from '@/lib/map-style'

export default function PlanningMap({ data, onSelect, placing=false }: { data: GeoJSON.FeatureCollection; onSelect: (longitude:number,latitude:number)=>void; placing?:boolean }) {
  const container=useRef<HTMLDivElement>(null), instance=useRef<maplibregl.Map|null>(null)
  const selection=useRef(onSelect), current=useRef(data)
  const placement=useRef(placing)
  const fitView=useRef<()=>void>(()=>{})
  const [error,setError]=useState('')
  selection.current=onSelect; current.current=data; placement.current=placing
  useEffect(()=>{
    if(!container.current) return
    const map=new maplibregl.Map({container:container.current,style:mobilityMapStyle(),center:[78.4867,17.385],zoom:12})
    instance.current=map
    map.addControl(new maplibregl.NavigationControl(),'top-right')
    map.addControl(new maplibregl.ScaleControl({unit:'metric'}))
    map.on('error',()=>setError('Some map tiles could not load. Metrics and coordinates remain available.'))
    map.on('load',()=>{
      map.addSource('planning',{type:'geojson',data:current.current})
      const color: maplibregl.ExpressionSpecification=['match',['get','planning_layer'],'water','#38bdf8','waterways','#38bdf8','landuse','#34d399','amenity_areas','#fb923c','amenities','#fb923c','transit','#c084fc','candidate','#fef08a','study_area','#c084fc','#cbd5e1']
      map.addLayer({id:'planning-fill',type:'fill',source:'planning',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':color,'fill-opacity':['case',['==',['get','planning_layer'],'study_area'],0.035,0.22]}})
      map.addLayer({id:'planning-lines',type:'line',source:'planning',filter:['!=',['geometry-type'],'Point'],paint:{'line-color':color,'line-width':['case',['==',['get','planning_layer'],'study_area'],2,1.5],'line-opacity':0.8}})
      map.addLayer({id:'planning-points',type:'circle',source:'planning',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':color,'circle-radius':['case',['==',['get','planning_layer'],'candidate'],9,4],'circle-stroke-color':'#0f172a','circle-stroke-width':1}})
    })
    map.on('click',event=>{
      if(placement.current){selection.current(Number(event.lngLat.lng.toFixed(6)),Number(event.lngLat.lat.toFixed(6)));return}
      const feature=map.queryRenderedFeatures(event.point,{layers:['planning-points','planning-lines','planning-fill']}).find(f=>f.properties?.planning_layer!=='study_area')
      if(feature){const content=document.createElement('div');content.textContent=`${feature.properties?.name||feature.properties?.fclass||'Mapped feature'} · ${feature.properties?.planning_layer}`;new maplibregl.Popup().setLngLat(event.lngLat).setDOMContent(content).addTo(map)}
    })
    const observer=new ResizeObserver(()=>{map.resize();fitView.current()});observer.observe(container.current)
    return()=>{observer.disconnect();fitView.current=()=>{};map.remove();instance.current=null}
  },[])
  useEffect(()=>{
    const map=instance.current
    if(!map) return
    const update=()=>{
      const source=map.getSource('planning') as maplibregl.GeoJSONSource|undefined
      if(!source) return
      source.setData(data)
      fitView.current=()=>{
        const points=data.features.filter(f=>['study_area','candidate'].includes(String(f.properties?.planning_layer))).flatMap(f=>geometryPositions(f.geometry))
        if(points.length){const bounds=new maplibregl.LngLatBounds();points.forEach(p=>bounds.extend([p[0],p[1]]));map.fitBounds(bounds,{padding:35,maxZoom:14,duration:0})}
      }
      fitView.current()
    }
    // isStyleLoaded also becomes false while tiles/source data are loading; the
    // one-time load event will not fire again then. An existing source is writable.
    if(map.getSource('planning')) update();else map.once('load',update)
    return()=>{map.off('load',update)}
  },[data])
  return <div><button onClick={()=>fitView.current()} className="mb-2 rounded-lg border border-white/20 px-3 py-1 text-xs text-purple-200">Fit study areas</button><div ref={container} data-planning-map className="h-[420px] w-full overflow-hidden rounded-xl border border-white/15 sm:h-[500px]"/>{error&&<p className="mt-2 text-xs text-amber-200">{error}</p>}</div>
}
