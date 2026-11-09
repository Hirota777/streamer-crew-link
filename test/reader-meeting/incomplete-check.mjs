import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import path from 'node:path';
const [dotnet,probe,assembly]=process.argv.slice(2);
for(const mode of ['missing','null-state','null-role']){
 const fixture=spawn(path.resolve(dotnet),[path.resolve(assembly),mode],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 try{
  const [ready]=await once(fixture.stdout,'data',{signal:AbortSignal.timeout(15000)});
  const read=async()=>JSON.parse((await promisify(execFile)(path.resolve(probe),['--death-timing-probe',ready.toString().trim()],{windowsHide:true,timeout:20000})).stdout);
  assert.deepEqual(await read(),{complete:false,collateral:0,visibleLife:'alive'});
  const restored=once(fixture.stdout,'data',{signal:AbortSignal.timeout(15000)});fixture.stdin.write('restore\n');await restored;
  assert.deepEqual(await read(),{complete:true,collateral:1,visibleLife:'alive'});
  console.log(`Incomplete ${mode}: public life retained; restored MADMATE collateral still withheld.`);
 }finally{fixture.stdin.end('\n');await once(fixture,'exit');}
}
