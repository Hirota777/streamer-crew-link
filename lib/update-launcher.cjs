const fs=require('node:fs/promises');const path=require('node:path');const {spawn}=require('node:child_process');

exports.launchUpdateHelper=async function({script,job,folder,attempt,spawnHelper=spawn}){
 const source=path.join(folder,'helper-'+attempt+'.ps1');await fs.writeFile(source,'\uFEFF'+script);
 const quote=value=>"'"+value.replaceAll("'","''")+"'";
 const wrapper=`& ([scriptblock]::Create([IO.File]::ReadAllText(${quote(source)}))) -Job ${quote(job)}`;
 const encoded=Buffer.from(wrapper,'utf16le').toString('base64');
 const ps=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 // A directly detached PowerShell ConsoleHost can exit without executing its command.
 // start creates its console; -WindowStyle Hidden keeps it hidden. The detached bootstrap
 // also keeps the helper outside Node's kill-on-parent-exit job. Only system paths and
 // a base64-only argument reach cmd; all user paths remain inside the encoded wrapper.
 const command=`start "" /min "${ps}" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${encoded}`;
 if(command.length>7500)throw Error('更新準備のパスが長すぎます。配布ページからMSIを取得してください。');
 return spawnHelper(path.join(process.env.SystemRoot,'System32','cmd.exe'),['/d','/s','/c',command],{windowsHide:true,detached:true,windowsVerbatimArguments:true,stdio:'ignore'});
};
