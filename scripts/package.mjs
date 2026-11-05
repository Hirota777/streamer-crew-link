import {packager} from '@electron/packager';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const staging=path.join(root,'build','app');
if(path.relative(root,staging)!==path.join('build','app'))throw Error('Unexpected staging directory');
const dotnet=spawnSync('dotnet',['publish',path.join(root,'reader','CrewLink.Reader.csproj'),'-c','Release','-r','win-x64','--self-contained','true','-o',path.join(root,'reader','release'),'-p:PublishSingleFile=true','-p:IncludeNativeLibrariesForSelfExtract=true',`-p:PathMap=${root}=/_/src`],{cwd:root,stdio:'inherit',shell:false});
if(dotnet.status!==0)throw Error('Reader build failed. Install the .NET 10 SDK.');
await fs.rm(staging,{recursive:true,force:true});await fs.mkdir(staging,{recursive:true});
for(const folder of ['lib','public'])await fs.cp(path.join(root,folder),path.join(staging,folder),{recursive:true});
for(const file of ['desktop.cjs','server.mjs','package.json','README.md','PRIVACY.md','DISTRIBUTION.md'])await fs.copyFile(path.join(root,file),path.join(staging,file));
const reader=path.join(root,'build','extra','reader');await fs.mkdir(reader,{recursive:true});
await fs.copyFile(path.join(root,'reader','release','CrewLink.Reader.exe'),path.join(reader,'CrewLink.Reader.exe'));
for(const file of ['profiles.json','LICENSE-AmongUsCapture.txt'])await fs.copyFile(path.join(root,'reader',file),path.join(reader,file));
await fs.copyFile(path.join(root,'third_party','dotnet','LICENSE.txt'),path.join(reader,'LICENSE-dotnet.txt'));
await fs.copyFile(path.join(root,'third_party','dotnet','ThirdPartyNotices.txt'),path.join(reader,'THIRD-PARTY-NOTICES-dotnet.txt'));
const results=await packager({dir:staging,out:path.join(root,'dist'),name:'Streamer crew link',platform:'win32',arch:'x64',electronVersion:'45.2.1',asar:true,prune:false,overwrite:true,icon:path.join(root,'assets','app.ico'),extraResource:[reader],win32metadata:{ProductName:'Streamer crew link',CompanyName:'Streamer crew link',FileDescription:'Among Us streaming companion'}});
for(const output of results){for(const file of ['README.md','PRIVACY.md','DISTRIBUTION.md'])await fs.copyFile(path.join(root,file),path.join(output,file));console.log(output);}
