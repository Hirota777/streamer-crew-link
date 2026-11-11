import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const input=path.resolve(process.argv[2]??path.join(root,'dist','Streamer crew link-win32-x64'));
const output=path.resolve(process.argv[3]??path.join(root,'dist'));
const wix=process.env.CREW_LINK_WIX3_BIN;if(!wix)throw Error('CREW_LINK_WIX3_BINに公式WiX 3.14.1のフォルダーを指定してください。');
const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const hash=s=>createHash('sha256').update(s).digest('hex');
const id=(prefix,s)=>prefix+hash(s).slice(0,24);
const guid=s=>{const h=hash('Streamer crew link installer:'+s).slice(0,32);return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20)}`;};
const source='WiX-3.14.1-sources.zip',sourceBytes=await fs.readFile(path.join(root,'third_party','sources',source));
if(hash(sourceBytes)!=='a56184e798885641821666bd389fe6276f99363f65bae8f88630b17de297fe9f')throw Error('WiX対応ソースのハッシュが一致しません。');
await fs.access(path.join(input,'LICENSE-CHECK.json'));await fs.access(path.join(input,'resources','app.asar'));
await fs.mkdir(path.join(input,'third-party-sources'),{recursive:true});
await fs.copyFile(path.join(root,'third_party','wix','LICENSE.txt'),path.join(input,'LICENSE-WiX.txt'));
await fs.writeFile(path.join(input,'third-party-sources',source),sourceBytes);
const build=path.join(root,'build','msi');await fs.mkdir(build,{recursive:true});await fs.mkdir(output,{recursive:true});
// RTF uses UTF-16 units, keeping the full Japanese terms readable in native Windows Installer.
const terms=await fs.readFile(path.join(root,'TERMS.md'),'utf8');let rtf='{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Segoe UI;}}\\f0\\fs20 ';
for(let i=0;i<terms.length;i++){const c=terms[i],u=terms.charCodeAt(i);rtf+=c==='\n'?'\\par\n':c==='\r'?'':/[\\{}]/.test(c)?'\\'+c:u>127?'\\u'+(u>32767?u-65536:u)+'?':c;}rtf+='}';
const license=path.join(build,'terms.rtf');await fs.writeFile(license,rtf,'ascii');
let components=[],files=[];
async function directory(folder,rel=''){
 const entries=await fs.readdir(folder,{withFileTypes:true});entries.sort((a,b)=>a.name.localeCompare(b.name,'en'));
 let body='',remove=true;
 for(const entry of entries){const key=rel?rel+'/'+entry.name:entry.name,absolute=path.join(folder,entry.name);
  if(entry.isDirectory()){body+=`<Directory Id="${id('D',key)}" Name="${xml(entry.name)}">${await directory(absolute,key)}</Directory>`;continue;}
  if(!entry.isFile())throw Error('配布フォルダーに通常ファイル以外が含まれています。');
  if(/(?:^|\/)(?:data|test|test-ui|node_modules)(?:\/|$)|discord-auth|settings\.(?:json|bin)|(?:^|\/)\.env(?:\.|$)|\.(?:log|pdb|wixpdb|map|pfx|p12|key|tmp)$/i.test(key))throw Error('個人データまたは開発用ファイルを検出しました。');
  const component=id('C',key),file=id('F',key);components.push(component);files.push(key);
  body+=`<Component Id="${component}" Guid="${guid(key)}" Win64="yes"><File Id="${file}" Source="${xml(absolute)}" KeyPath="no"/><RegistryValue Root="HKCU" Key="Software\\Hirota777\\StreamerCrewLink\\InstallerFiles" Name="${component}" Type="string" Value="${pkg.version}" KeyPath="yes"/>${remove?`<RemoveFolder Id="${id('R',rel||'root')}" On="uninstall"/>`:''}</Component>`;remove=false;
 }
 return body;
}
const tree=await directory(input),exe=id('F','Streamer crew link.exe');
const wxs=`<?xml version="1.0" encoding="utf-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi"><Product Id="${guid('product:'+pkg.version)}" Name="Streamer crew link" Language="1041" Codepage="932" Version="${pkg.version}" Manufacturer="Hirota777" UpgradeCode="8FAFDAD1-280D-478C-A7ED-30FBEA4B5C72">
<Package InstallerVersion="500" Compressed="yes" InstallScope="perUser" Platform="x64" Description="Streamer crew link インストーラー"/>
<MajorUpgrade DowngradeErrorMessage="新しいバージョンがインストールされています。" Schedule="afterInstallInitialize"/>
<MediaTemplate EmbedCab="yes" CompressionLevel="medium"/>
<Property Id="ARPPRODUCTICON" Value="AppIcon"/><Property Id="MSIRESTARTMANAGERCONTROL" Value="DisableShutdown"/>
<Icon Id="AppIcon" SourceFile="${xml(path.join(root,'assets','app.ico'))}"/>
<Condition Message="64ビットWindowsが必要です。対応OSはWindows 10以降です。">Installed OR VersionNT64</Condition>
<Directory Id="TARGETDIR" Name="SourceDir"><Directory Id="LocalAppDataFolder"><Directory Id="Programs" Name="Programs"><Directory Id="INSTALLFOLDER" Name="Streamer crew link">${tree}</Directory></Directory></Directory>
<Directory Id="ProgramMenuFolder"><Directory Id="AppMenu" Name="Streamer crew link"><Component Id="StartMenuShortcut" Guid="${guid('startmenu')}" Win64="yes"><Shortcut Id="AppStartMenu" Name="Streamer crew link" Target="[INSTALLFOLDER]Streamer crew link.exe" WorkingDirectory="INSTALLFOLDER" Icon="AppIcon"/><RemoveFolder Id="RemoveAppMenu" On="uninstall"/><RemoveFolder Id="RemoveEmptyPrograms" Directory="Programs" On="uninstall"/><RegistryValue Root="HKCU" Key="Software\\Hirota777\\StreamerCrewLink" Name="StartMenuShortcut" Type="integer" Value="1" KeyPath="yes"/></Component></Directory></Directory>
<Directory Id="DesktopFolder"><Component Id="DesktopShortcut" Guid="${guid('desktop')}" Win64="yes"><Shortcut Id="AppDesktop" Name="Streamer crew link" Target="[INSTALLFOLDER]Streamer crew link.exe" WorkingDirectory="INSTALLFOLDER" Icon="AppIcon"/><RegistryValue Root="HKCU" Key="Software\\Hirota777\\StreamerCrewLink" Name="DesktopShortcut" Type="integer" Value="1" KeyPath="yes"/></Component></Directory></Directory>
<Feature Id="Application" Title="Streamer crew link" Level="1">${components.map(c=>`<ComponentRef Id="${c}"/>`).join('')}<ComponentRef Id="StartMenuShortcut"/><ComponentRef Id="DesktopShortcut"/></Feature>
<WixVariable Id="WixUILicenseRtf" Value="${xml(license)}"/><UIRef Id="WixUI_Minimal"/>
</Product></Wix>`;
const sourceFile=path.join(build,'installer.wxs'),object=path.join(build,'installer.wixobj'),msi=path.join(output,`Streamer-crew-link-${pkg.version}-Windows-x64.msi`);await fs.writeFile(sourceFile,wxs);
// ICE91 warns that per-user files cannot install for all users. This package intentionally supports per-user only.
for(const [tool,args]of [['candle.exe',['-nologo','-arch','x64','-out',object,sourceFile]],['light.exe',['-nologo','-ext',path.join(wix,'WixUIExtension.dll'),'-sice:ICE91','-cultures:ja-jp','-pdbout',path.join(build,'installer.wixpdb'),'-out',msi,object]]]){
 const result=spawnSync(path.join(wix,tool),args,{stdio:'inherit',windowsHide:true});if(result.status!==0)throw Error(tool+' failed: '+result.status);
}
const bytes=await fs.readFile(msi);await fs.writeFile(path.join(output,`Streamer-crew-link-${pkg.version}-MSI-SHA256.txt`),hash(bytes)+'  '+path.basename(msi)+'\n');
await fs.writeFile(path.join(build,'file-list.json'),JSON.stringify({version:pkg.version,upgradeCode:'8FAFDAD1-280D-478C-A7ED-30FBEA4B5C72',files},null,2));
console.log(`MSI created: ${msi}; ${bytes.length} bytes; ${files.length} application files`);
