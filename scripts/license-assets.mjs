import {readFile,copyFile,mkdir,access,writeFile} from 'node:fs/promises';
import path from 'node:path';import {createHash} from 'node:crypto';
export const applicationNotices=['LICENSE-APPLICATION.txt','THIRD-PARTY-NOTICES.md'];
const sha=data=>createHash('sha256').update(data).digest('hex');
export async function copyLicenseAssets(root,output){
 const sourceRoot=path.join(root,'third_party','sources'),manifest=JSON.parse(await readFile(path.join(sourceRoot,'manifest.json'),'utf8'));
 if(path.basename(manifest.archive)!==manifest.archive||!manifest.archive.endsWith('.zip'))throw Error('Invalid third-party source archive name');
 const archive=path.join(sourceRoot,manifest.archive);if(sha(await readFile(archive))!==manifest.sourceSha256)throw Error('Third-party source archive checksum mismatch');
 if(sha(await readFile(path.join(output,'ffmpeg.dll')))!==manifest.ffmpegSha256)throw Error('FFmpeg binary does not match the bundled source version');
 const required=['LICENSE','LICENSES.chromium.html','resources/reader/LICENSE-dotnet.txt','resources/reader/THIRD-PARTY-NOTICES-dotnet.txt','resources/reader/LICENSE-AmongUsCapture.txt','resources/reader/THIRD-PARTY-NOTICES-reader.md'];for(const file of required)await access(path.join(output,file));
 for(const file of applicationNotices)await copyFile(path.join(root,file),path.join(output,file));
 const target=path.join(output,'third-party-sources');await mkdir(target,{recursive:true});await copyFile(archive,path.join(target,manifest.archive));await copyFile(path.join(sourceRoot,'manifest.json'),path.join(target,'manifest.json'));
 await writeFile(path.join(output,'LICENSE-CHECK.json'),JSON.stringify({schema:1,electronVersion:manifest.electronVersion,ffmpegSha256:manifest.ffmpegSha256,sourceArchive:'third-party-sources/'+manifest.archive,sourceSha256:manifest.sourceSha256,requiredNotices:required.concat(applicationNotices)},null,2)+'\n');
}
