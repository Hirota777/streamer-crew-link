import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdtemp,writeFile,access,readFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import os from 'node:os';import {spawn} from 'node:child_process';import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url),{launchUpdateHelper}=require('../lib/update-launcher.cjs');
async function appears(file){for(let i=0;i<120;i++){if(await access(file).then(()=>true,()=>false))return true;await new Promise(r=>setTimeout(r,100));}return false;}
test('実起動した更新補助処理は親Node終了後も動き、日本語・引用符を含む保存先を扱える',{skip:process.platform!=='win32'},async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),"crew-helper-日本語'&-")),job=path.join(folder,'job.json'),parent=path.join(folder,'parent.cjs'),launcher=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../lib/update-launcher.cjs');
 const script="param([string]$Job)\n$env:PSModulePath=[IO.Path]::Combine($PSHOME,'Modules')\n$j=Get-Content -LiteralPath $Job -Raw|ConvertFrom-Json\ntry{$p=[Diagnostics.Process]::GetProcessById($j.pid);if(!$p.WaitForExit(6000)){throw 'parent alive'}}catch [ArgumentException]{}\n[IO.File]::WriteAllText($Job+'.after','ok')";
 await writeFile(parent,`const fs=require('node:fs');const {launchUpdateHelper}=require(${JSON.stringify(launcher)});(async()=>{fs.writeFileSync(${JSON.stringify(job)},JSON.stringify({pid:process.pid}));const p=await launchUpdateHelper({script:${JSON.stringify(script)},job:${JSON.stringify(job)},folder:${JSON.stringify(folder)},attempt:'${randomUUID()}'});p.unref();})();`);
 const p=spawn(process.execPath,[parent],{windowsHide:true,stdio:'ignore'});assert.equal(await new Promise((r,j)=>{p.on('exit',r);p.on('error',j)}),0);assert.equal(await appears(job+'.after'),true);
});
test('補助処理の実プロセスで失敗結果を読み取れる（インストーラーは使用しない）',{skip:process.platform!=='win32'},async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'crew-helper-real-')),job=path.join(folder,'job.json'),script="param([string]$Job)\n[IO.File]::WriteAllText($Job+'.result','validated-and-cancelled')";
 await writeFile(job,'{}');const p=await launchUpdateHelper({script,job,folder,attempt:randomUUID()});p.unref();assert.equal(await appears(job+'.result'),true);assert.equal(await readFile(job+'.result','utf8'),'validated-and-cancelled');
});
