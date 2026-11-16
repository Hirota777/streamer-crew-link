import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
test('指定元24枚と派生12枚の出典・画像ハッシュ・MIT表記を保持する',async()=>{
 const m=JSON.parse(await readFile(new URL('assets/players-source.json',root),'utf8'));assert.equal(m.originals.length,24);assert.equal(m.derived.length,12);assert.equal(m.repository,'https://github.com/automuteus/amonguscapture');
 const names=[...m.originals,...m.derived].map(x=>x.name).sort();assert.deepEqual((await readdir(new URL('public/icons/',root))).filter(n=>n.endsWith('.png')).sort(),names);
 for(const item of [...m.originals,...m.derived]){const bytes=await readFile(new URL('public/icons/'+item.name,root));assert.equal(sha(bytes),item.sha256,item.name);assert.equal(bytes.readUInt32BE(16),148);assert.equal(bytes.readUInt32BE(20),198);}
 const license=await readFile(new URL('LICENSE-AmongUsCapture-Players.txt',root),'utf8');assert.match(license,/Copyright \(c\) 2020 Denver Quane/);assert.match(license,/Permission is hereby granted/);
 const svg=await readFile(new URL('assets/app.svg',root),'utf8'),embedded=Buffer.from(svg.match(/base64,([A-Za-z0-9+/=]+)/)[1],'base64');assert.equal(sha(embedded),m.originals.find(p=>p.name==='aucyan.png').sha256);
});
