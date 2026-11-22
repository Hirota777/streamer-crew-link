import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
test('OBSは連携エラーで表示設定を消さず、同じ内容の復旧で再読込せず、明示停止だけ復元する',{skip:process.platform!=='win32'},t=>{
 const result=spawnSync('python',[fileURLToPath(new URL('../test-support/obs-hold.py',import.meta.url))],{encoding:'utf8'});
 if(result.status===77){t.skip('OBS Lua runtime unavailable');return;}assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/references passed/);
});
