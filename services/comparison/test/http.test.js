import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from '../src/app.js';
import {configuration} from '../src/config.js';
const read = name => JSON.parse(fs.readFileSync(new URL(`../../../fixtures/${name}`,import.meta.url)));
const catalog=read('crops/catalog.json'), climate=read('climate/daily.json');
const input={region_id:'sample_region',baseline:['summer_a','winter_a','summer_a','winter_a'],priority:'water',scenario:'average'};
async function listen(server,t) {
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(() => new Promise(resolve => {server.close(resolve);server.closeAllConnections();}));
  return `http://127.0.0.1:${server.address().port}`;
}
async function harness(t) {
  const state={mode:'fixture',status:200,body:null,delay:0,trickle:false,badJson:false};
  const internal=http.createServer((req,res)=>{
    res.setHeader('Content-Type','application/json');res.setHeader('X-AgriLens-Data-Mode',state.mode);
    if(state.trickle) {
      res.writeHead(200);res.write(' ');
      const interval=setInterval(()=>res.write(' '),15);
      res.on('close',()=>clearInterval(interval));return;
    }
    const timer=setTimeout(()=>{
      res.writeHead(state.status);
      res.end(state.badJson?'invalid':JSON.stringify(state.body ?? (req.url.startsWith('/internal/crops')?catalog:climate)));
    },state.delay);
    res.on('close',()=>clearTimeout(timer));
  });
  const dependency=await listen(internal,t);
  const settings={...configuration({DATA_MODE:'fixture'}),regionId:'sample_region',regionName:'Fixture region',cropUrl:dependency,climateUrl:dependency,connectMs:100,readMs:100,totalMs:250};
  const server=createServer(settings), base=await listen(server,t);
  const post=body=>fetch(`${base}/api/compare`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {state,settings,base,post};
}
test('HTTP config, arbitrary compare, health, CORS, errors, and response labels',async t=>{
  const {base,post}=await harness(t);
  assert.equal((await fetch(`${base}/health`)).status,200);
  const config=await fetch(`${base}/api/config`,{headers:{Origin:'http://localhost:5173'}});
  assert.equal(config.headers.get('access-control-allow-origin'),'http://localhost:5173');
  assert.equal(config.headers.get('x-agrilens-data-mode'),'fixture');
  assert.equal(config.headers.get('cache-control'),'no-store');
  assert.equal((await config.json()).sample_baseline.length,4);
  assert.equal((await fetch(`${base}/api/compare`,{method:'OPTIONS'})).status,200);
  const result=await post(input);assert.equal(result.status,200);assert.equal((await result.json()).plans.length,3);
  for(const [body,status,code] of [[{...input,priority:'bad'},400,'INVALID_INPUT'],[{...input,scenario:'future'},422,'UNSUPPORTED_SCENARIO'],[{...input,region_id:'unknown'},404,'UNKNOWN_REGION']]){
    const response=await post(body);assert.equal(response.status,status);assert.equal((await response.json()).error.code,code);
  }
  const malformed=await fetch(`${base}/api/compare`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});
  assert.equal(malformed.status,400);
  assert.equal((await fetch(`${base}/api/config?unknown=true`)).status,400);
  assert.equal((await fetch(`${base}/api/compare`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({padding:'x'.repeat(66000)})})).status,400);
});
test('dependency outages, invalid JSON and approval errors preserve public error semantics',async t=>{
  const {base,state,post}=await harness(t);
  for(const [status,body,code] of [[503,{error:{code:'SERVICE_UNAVAILABLE',message:'secret storage details'}},'SERVICE_UNAVAILABLE'],[422,{error:{code:'INSUFFICIENT_DATA',message:'pending'}},'INSUFFICIENT_DATA']]){
    state.status=status;state.body=body;
    const response=await post(input);assert.equal(response.status,status);const result=await response.json();assert.equal(result.error.code,code);assert.ok(!result.error.message.includes('secret'));
    assert.equal((await fetch(`${base}/health`)).status,503);
  }
  state.status=200;state.body=null;state.badJson=true;
  assert.equal((await post(input)).status,503);
});
test('absolute deadline bounds trickling peers and read timeout bounds silent peers',async t=>{
  const {state,post}=await harness(t);
  state.delay=200;
  assert.equal((await post(input)).status,503);
  state.trickle=true;
  const started=performance.now();assert.equal((await post(input)).status,503);
  assert.ok(performance.now()-started<1000);
});
test('live comparison rejects fixture responses; development mode refuses unlabelled/live data',async t=>{
  const {base,state,settings,post}=await harness(t);
  settings.mode='live';
  assert.equal((await post(input)).status,503);
  state.mode='live';
  const live=await post(input);assert.equal(live.status,200);assert.equal(live.headers.get('x-agrilens-data-mode'),'live');
  settings.mode='fixture';state.mode='live';
  assert.equal((await fetch(`${base}/api/config`)).status,503);
});

test('launcher starts the real engine and consumes independent Python fixture servers over HTTP',async t=>{
  const root=new URL('../../../',import.meta.url);
  const children=[];
  t.after(()=>Promise.all(children.map(child=>new Promise(resolve=>{if(child.exitCode!==null || child.signalCode!==null){resolve();return;}child.once('exit',resolve);child.kill('SIGINT');}))));
  async function launch(args,env={}) {
    const child=spawn('python3',args,{cwd:root,env:{...process.env,DATA_MODE:'fixture',...env},stdio:['ignore','pipe','pipe']});children.push(child);
    return child;
  }
  // Reserve ephemeral ports before launching the three independent processes.
  const ports=[];
  for(let i=0;i<3;i++) {
    const temp=http.createServer();temp.listen(0,'127.0.0.1');await once(temp,'listening');ports.push(temp.address().port);await new Promise(resolve=>temp.close(resolve));
  }
  await launch(['tools/fixture_server.py','crops','--port',String(ports[0])]);
  await launch(['tools/fixture_server.py','climate','--port',String(ports[1])]);
  const env={DATA_MODE:'fixture',HOST:'127.0.0.1',COMPARISON_REGION_ID:'sample_region',COMPARISON_REGION_NAME:'Fixture region',COMPARISON_PORT:String(ports[2]),CROP_BASE_URL:`http://127.0.0.1:${ports[0]}`,CLIMATE_BASE_URL:`http://127.0.0.1:${ports[1]}`};
  const child=await launch(['tools/dev.py','run','comparison'],env);
  const base=`http://127.0.0.1:${ports[2]}`;
  const ready=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Launcher did not start')),5000);
    child.stdout.on('data',chunk=>{if(chunk.toString().includes('Comparison service:')){clearTimeout(timer);resolve(true);}});
    child.on('exit',()=>{clearTimeout(timer);reject(new Error('Launcher exited early'));});
  });
  assert.ok(ready);
  const response=await fetch(`${base}/api/compare`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  assert.equal(response.status,200);assert.deepEqual((await response.json()).plans[0].crops,input.baseline);
  // Stop a real dependency and prove the engine does not replay its last success.
  children[0].kill('SIGTERM');await once(children[0],'exit');
  assert.equal((await fetch(`${base}/api/compare`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})).status,503);
});

test('unreviewed mode discloses status in public config and results and cannot mix with live mode', async t=>{
  const {settings,state,base,post}=await harness(t);settings.mode='unreviewed';state.mode='unreviewed';
  const r=await post(input);assert.equal(r.status,200);assert.equal(r.headers.get('x-agrilens-data-mode'),'unreviewed');
  assert.ok((await r.json()).meta.warnings.some(w=>w.includes('UNREVIEWED PROTOTYPE')));
  assert.ok((await (await fetch(`${base}/api/config`)).json()).region.name.includes('unreviewed'));
  settings.mode='live';assert.equal((await post(input)).status,503);
  settings.mode='unreviewed';state.mode='fixture';assert.equal((await post(input)).status,503);
});
