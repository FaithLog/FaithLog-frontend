import {afterEach,expect} from 'vitest';

// Unit tests must supply transport doubles. Only the explicit loopback QA run may use real HTTP.
const nativeFetch=globalThis.fetch;
const qa=process.env.FAITHLOG_QA_URL;
const qaUrl=qa?new URL(qa):null;
if(qaUrl&&!['127.0.0.1','localhost','[::1]'].includes(qaUrl.hostname))throw new Error('QA backend must be loopback-only.');
const attempts:string[]=[];
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(qaUrl&&url.origin===qaUrl.origin)return nativeFetch(input,init);
 attempts.push(`${url.origin}${url.pathname}`);
 throw new Error('Unmocked HTTP is disabled in tests.');
};
afterEach(()=>{const unexpected=attempts.splice(0);expect(unexpected,'Tests must mock HTTP; production traffic is never sent.').toEqual([]);});
