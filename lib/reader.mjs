import {spawn} from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
export function startReader(directory,onGame,onStatus){
 const child=spawn(path.join(directory,'CrewLink.Reader.exe'),[],{cwd:directory,windowsHide:true,stdio:['ignore','pipe','ignore']});
 const lines=readline.createInterface({input:child.stdout});
 lines.on('line',line=>{if(line.length>128*1024)return;try{const event=JSON.parse(line);if(event.type==='snapshot')onGame(event.game);if(event.type==='status')onStatus(String(event.status),String(event.message).slice(0,240));}catch{onStatus('error','ゲーム情報を読み取れませんでした。');}});
 child.on('error',()=>onStatus('error','ゲーム取得用プログラムを起動できません。'));
 child.on('exit',()=>{lines.close();onStatus('error','ゲーム取得用プログラムが終了しました。アプリを起動し直してください。');});
 return ()=>{lines.close();child.kill();};
}
