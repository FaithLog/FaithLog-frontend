import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

assert.equal(process.env.PGDATABASE, 'faithlog_companion_qa');
assert.equal(process.env.FAITHLOG_QA_URL, 'http://127.0.0.1:8080');
const url = process.env.FAITHLOG_QA_URL;

async function request(path, {token, key, body} = {}) {
  const start = performance.now();
  const response = await fetch(url + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body && {'Content-Type':'application/json'}),
      ...(token && {Authorization:'Bearer ' + token}),
      ...(key && {'Idempotency-Key':key}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  return {status:response.status, data:payload.data, ms:performance.now()-start};
}

const sessions = [];
for (let index=1; index<=300; index++) {
  const login = await request('/api/v1/auth/login', {
    body:{email:'perf-' + index + '@example.test',password:'synthetic-farm-only'},
  });
  assert.equal(login.status, 200);
  const token = login.data.accessToken;
  const state = await request('/api/v1/companions/me/instances/garden', {token});
  assert.equal(state.status, 200);
  assert.equal(state.data.length, 5);
  sessions.push({token, pets:state.data});
}

async function stage(users, slot, operation, offset) {
  const results = await Promise.all(sessions.slice(0,users).map(async ({token,pets},index)=>{
    const pet = pets[slot];
    const expectedVersion = pet.version + offset;
    const path = '/api/v1/companions/me/instances/' + pet.instanceId + '/' + operation;
    const body = operation === 'care' ? {expectedVersion,action:'FEED'} : {expectedVersion};
    const key = 'write-' + operation + '-' + users + '-' + index;
    const pair = await Promise.all([request(path,{token, key, body}),request(path,{token, key, body})]);
    for (const result of pair) {
      assert.equal(result.status, 200);
      assert.equal(result.data.version, expectedVersion+1);
      assert.equal(result.data.level, operation==='care' ? 1 : 2);
      assert.equal(result.data.growthXp, 315);
    }
    assert.deepEqual(pair[0].data,pair[1].data);
    return pair.map(result=>result.ms);
  }));
  const durations = results.flat().sort((a,b)=>a-b);
  console.log(JSON.stringify({users,operation,requests:durations.length,
    p95Ms:Number(durations[Math.ceil(durations.length*.95)-1].toFixed(2)),
    p99Ms:Number(durations[Math.ceil(durations.length*.99)-1].toFixed(2))}));
}

for (const [slot,users] of [50,200,300].entries()) {
  await stage(users,slot,'care',0);
  await stage(users,slot,'evolve',1);
}
