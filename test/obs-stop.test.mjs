import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
test('OBSは独立した停止通知を優先し、明示再開まで停止を維持する',{skip:process.platform!=='win32'},t=>{
 const result=spawnSync('python',[fileURLToPath(new URL('../test-support/obs-stop.py',import.meta.url))],{encoding:'utf8'});if(result.status===77){t.skip('OBS Lua runtime unavailable');return;}assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/references passed/);
});
