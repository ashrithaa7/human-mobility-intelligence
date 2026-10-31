const path = require('node:path')
const repositoryRoot = path.resolve(__dirname, '../..')
process.chdir(repositoryRoot)
const artifacts = path.join(__dirname, 'artifacts')
require('fs').mkdirSync(artifacts, { recursive: true })
const fs=require('fs'),assert=require('node:assert/strict'),{chromium}=require('playwright')
const base=process.env.HMI_TEST_BASE_URL || 'http://127.0.0.1:3000'
;(async()=>{
 const browser=await chromium.launch({executablePath:process.env.HMI_CHROME_EXECUTABLE || (process.platform === 'win32' && fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
 const checks=[],errors=[],tileFailures=[]
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage()
 let role='public_user',latest=null,submissions=0
 const user={id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}
 const token=[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.')
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('tile.openstreetmap.org')&&r.status()>=400)tileFailures.push(r.status())})
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname
  const json=x=>route.fulfill({contentType:'application/json',body:JSON.stringify(x)})
  if(p.includes('/auth/v1/token'))return json({access_token:token,refresh_token:'test-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user})
  if(p.includes('/auth/v1/user'))return json(user)
  if(p.endsWith('/rpc/submit_planner_request')) {submissions++;latest={id:'request',status:'pending',requested_at:new Date().toISOString()};return json(latest)}
  if(p.includes('/rest/v1/planner_requests'))return json(req.headers().accept?.includes('object')?latest:latest?[latest]:[])
  if(p.includes('/rest/v1/users'))return json(req.headers().accept?.includes('object')?{...user,role,is_active:true}:[{...user,role,is_active:true}])
  return route.continue()
 })
 await page.goto(base+'/login');await page.locator('#email').fill(user.email);await page.locator('#password').fill('test-password-only');await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.waitForURL('**/dashboard')
 await page.goto(base+'/dashboard/maps');await page.locator('[data-map-frame] canvas').waitFor({timeout:60000});await page.getByRole('button',{name:'Fit to data'}).waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('[role=status]')).some(e=>e.textContent.includes('Loading map')),{timeout:30000})
 await page.waitForTimeout(5000)
 const renderedMap = await page.evaluate(()=>{
   const el=document.querySelector('.maplibregl-map');let fiber=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))]
   while(fiber){let hook=fiber.memoizedState;while(hook){const value=hook.memoizedState?.current;if(value?.getStyle&&value?.queryRenderedFeatures){window.__testedMap=value;return {zoom:value.getZoom(),source:value.querySourceFeatures('points').length,rendered:value.queryRenderedFeatures({layers:['clusters','unclustered-point']}).length}};hook=hook.next}fiber=fiber.return}
   return 'Map instance unavailable'
 })
 assert(renderedMap.rendered>0,'Point/cluster features must actually render, not just the basemap')
 const cluster=await page.evaluate(()=>{const m=window.__testedMap;const f=m.queryRenderedFeatures({layers:['clusters']})[0];return m.project(f.geometry.coordinates)})
 await page.locator('[data-map-frame] canvas').click({position:cluster});await page.waitForTimeout(1000)
 assert(await page.evaluate(()=>window.__testedMap.getZoom())>renderedMap.zoom,'Clicking a cluster must zoom in')
 await page.getByRole('button',{name:'Fit to data',exact:true}).click()
 const list=page.getByRole('list',{name:'Covered areas'})
 const dimensions=await list.evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight,overflow:getComputedStyle(e).overflowY}))
 assert(dimensions.scroll>dimensions.height);assert.equal(dimensions.overflow,'auto');assert(dimensions.height<600)
 await list.evaluate(e=>e.scrollTop=700);assert(await list.evaluate(e=>e.scrollTop)>0)
 await page.locator('section[aria-label="Location map"]').screenshot({path:artifacts+'/map-streets-desktop.png'})
 await page.getByRole('button',{name:'Show heatmap',exact:true}).click();await page.waitForTimeout(2000);await page.locator('section[aria-label="Location map"]').screenshot({path:artifacts+'/map-density-desktop.png'})
 await page.getByRole('button',{name:'Show points',exact:true}).click()
 await page.getByLabel('Search covered areas').fill('Abids');assert(await list.getByRole('button').count()>0);await list.getByRole('button').first().click();await page.waitForTimeout(2000)
 await page.locator('section[aria-label="Location map"]').screenshot({path:artifacts+'/map-selected-area.png'})
 await page.getByRole('button',{name:'Show all',exact:true}).click();await page.getByLabel('Search covered areas').fill('');await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1000)
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:artifacts+'/map-streets-mobile.png',fullPage:true})
 checks.push({name:'Real active-source street map, rendered cluster features and click-to-zoom, heatmap toggle, area search/focus, independent list scroll, mobile width',renderedMap,dimensions,tileFailures})
 await page.goto(base+'/request-access');await page.locator('input[name=organization]').waitFor();await page.locator('input[name=organization]').fill('City Planning Office');await page.locator('textarea[name=reason]').fill('I need to review transit coverage for the city planning project.')
 await page.locator('form button[type=submit]').click();await page.getByText('Request submitted',{exact:true}).waitFor();assert.equal(submissions,1)
 await page.reload();await page.getByText('Request awaiting review',{exact:true}).waitFor();assert.equal(await page.locator('form button[type=submit]').count(),0)
 latest={...latest,status:'rejected',review_notes:'Please describe your project in more detail.'};await page.reload();await page.getByText(/Please describe your project/).waitFor();assert.equal(await page.locator('form button[type=submit]').isEnabled(),true)
 role='planner';await page.reload();await page.waitForURL('**/planner/dashboard')
 checks.push('Request submission, pending reload without duplicate form, rejected reapplication, approved-role redirect')
 role='admin';await page.goto(base+'/planner/analysis');await page.getByRole('button',{name:'Run Analysis',exact:true}).waitFor();checks.push('Administrator can access planner tools')
 role='public_user';await page.goto(base+'/admin/users');await page.waitForURL('**/dashboard');await page.goto(base+'/planner/reports');await page.waitForURL('**/request-access');checks.push('Public role denied admin and planner pages')
 await browser.close();assert.deepEqual(errors,[])
 const result={checks,errors};console.log(JSON.stringify(result,null,2));fs.writeFileSync(artifacts+'/map-access-results.json',JSON.stringify(result,null,2))
})().catch(e=>{console.error(e);process.exit(1)})
