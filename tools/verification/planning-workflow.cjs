// Browser UI uses intercepted auth/API responses; spatial metrics come from planning-fixtures.py.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium}=require('playwright')
const artifacts=path.join(__dirname,'artifacts'),base=process.env.HMI_TEST_BASE_URL||'http://127.0.0.1:3000'
const assessment=JSON.parse(fs.readFileSync(path.join(artifacts,'planning-assessment.json'),'utf8'))
const catalog=JSON.parse(fs.readFileSync(path.join(artifacts,'planning-catalog.json'),'utf8'))
;(async()=>{
 const browser=await chromium.launch({executablePath:process.env.HMI_CHROME_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[]
 page.setDefaultNavigationTimeout(90000);page.setDefaultTimeout(60000)
 page.on('pageerror',e=>errors.push(e.message))
 let role='planner',saved=[],requests=0
 const user={id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}
 const token=[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.')
 await page.route('**/*',async route=>{
   const req=route.request(),p=new URL(req.url()).pathname,json=x=>route.fulfill({contentType:'application/json',body:JSON.stringify(x)})
   if(p.includes('/auth/v1/token'))return json({access_token:token,refresh_token:'fixture',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})
   if(p.includes('/auth/v1/user'))return json(user)
   if(p.includes('/rest/v1/users'))return json(req.headers().accept?.includes('object')?{...user,role,is_active:true}:[{...user,role,is_active:true}])
   if(p.includes('/rest/v1/planner_requests'))return json([])
   if(p==='/api/planning/catalog')return json(catalog)
   if(p==='/api/planning/assess'){requests++;const body=req.postDataJSON();assert.equal(body.sites.length,2);assert.equal(body.radius_m,1000);return json({...assessment,objective:body.objective})}
   if(p==='/api/planning/scenarios'){
     if(req.method()==='POST'){const b=req.postDataJSON();const result={...assessment,id:'saved-fixture',title:b.title,notes:b.notes,objective:b.objective};saved.unshift(result);return json(result)}
     return json({scenarios:saved})
   }
   return route.continue()
 })
 await page.goto(base+'/login?next=/planner/dashboard');await page.locator('#email').fill(user.email);await page.locator('#password').fill('fixture-password');await page.getByRole('button',{name:'Sign In',exact:true}).click()
 await page.waitForURL('**/planner/dashboard');await page.getByRole('heading',{name:'City planning workspace'}).waitFor()
 await page.goto(base+'/dashboard');await page.waitForURL('**/planner/dashboard');await page.getByRole('heading',{name:'City planning workspace'}).waitFor()
 for(const name of ['Land use','Infrastructure','Amenity siting','Active mobility','Road networks','Policy & master plan'])assert.equal(await page.getByRole('button',{name,exact:true}).count(),1)
 await page.getByRole('button',{name:'Assess locations',exact:true}).click();await page.getByRole('heading',{name:'3. Compare alternatives'}).waitFor({timeout:60000});assert.equal(requests,1)
 await page.locator('[data-planning-map] canvas').waitFor();await page.waitForTimeout(3000)
 await page.waitForFunction(()=>{const el=document.querySelector('.maplibregl-map');if(!el)return false;let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];while(f){let h=f.memoizedState;while(h){const m=h.memoizedState?.current;if(m?.queryRenderedFeatures&&m?.getStyle&&m.getLayer('planning-points')){window.__planningMap=m;return m.queryRenderedFeatures({layers:['planning-points','planning-lines','planning-fill']}).some(feature=>!['candidate','study_area'].includes(feature.properties?.planning_layer))}h=h.next}f=f.return}return false})
 const rendered=await page.evaluate(()=>window.__planningMap.queryRenderedFeatures({layers:['planning-points','planning-lines','planning-fill']}).filter(feature=>!['candidate','study_area'].includes(feature.properties?.planning_layer)).length)
 assert(rendered>0,'Planning evidence must render on the map')
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(artifacts,'planner-desktop.png'),fullPage:true})
 await page.getByLabel('Preferred alternative, rationale and required field checks').fill('Compare transit access; validate facilities and land-use permissions on site.')
 await page.getByRole('button',{name:'Save decision brief',exact:true}).click();await page.getByText('Decision brief saved to your account.',{exact:true}).waitFor();assert.equal(saved.length,1)
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export Markdown',exact:true}).click();const d=await download;await d.saveAs(path.join(artifacts,'planner-export.md'));assert(fs.readFileSync(path.join(artifacts,'planner-export.md'),'utf8').includes('## Sources and method'))
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(800);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByRole('button',{name:'Fit study areas',exact:true}).click();await page.waitForFunction(()=>window.__planningMap.queryRenderedFeatures({layers:['planning-points']}).some(f=>f.properties?.planning_layer==='transit'));await page.locator('[data-planning-map]').screenshot({path:path.join(artifacts,'planner-map-mobile.png')});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(artifacts,'planner-mobile.png'),fullPage:true})
 await page.getByRole('button',{name:'Land use',exact:true}).click();await page.getByText('Inputs changed. Assess locations again to update the comparison.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Save decision brief',exact:true}).count(),0)
 role='public_user';await page.goto(base+'/planner/dashboard');await page.waitForURL('**/request-access')
 await page.goto(base+'/login?next=/planner/dashboard');await page.locator('#email').fill(user.email);await page.locator('#password').fill('fixture-password');await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.waitForURL('**/request-access')
 await browser.close();assert.deepEqual(errors,[])
 const result={passed:true,renderedPlanningFeatures:rendered,checks:['planner login destination','generic dashboard role redirect','six planning objectives','real-data assessment rendering','saved brief and Markdown export','mobile width','stale results blocked after edits','public planner intent leads to access request'],errors,scope:'Auth and planning HTTP intercepted; real prepared-data metrics; backend role and persistence enforced in separate tests.'}
 fs.writeFileSync(path.join(artifacts,'planning-browser-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
})().catch(e=>{console.error(e);process.exit(1)})
