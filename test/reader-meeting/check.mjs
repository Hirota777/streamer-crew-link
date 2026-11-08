import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import path from 'node:path';
const [dotnet,reader,assembly]=process.argv.slice(2);if(!dotnet||!reader)throw Error('Usage: node check.mjs <dotnet.exe> <CrewLink.Reader.exe>');
const fixture=spawn(path.resolve(dotnet),[assembly?path.resolve(assembly):path.resolve(import.meta.dirname,'bin/Release/net10.0/Nebula.dll')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
try{
 const [ready]=await once(fixture.stdout,'data',{signal:AbortSignal.timeout(15000)});const pid=Number(ready.toString().trim());assert.ok(pid>0);
 const {stdout}=await promisify(execFile)(path.resolve(reader),['--meeting-probe',String(pid)],{windowsHide:true,timeout:20000});
 assert.deepEqual(JSON.parse(stdout),{completedMeetings:2});
 console.log('Real external memory read passed: two completed meetings; other event types ignored.');
}finally{fixture.stdin.end('\n');await once(fixture,'exit');}
