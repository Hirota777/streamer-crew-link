import fs from 'node:fs/promises';
import path from 'node:path';

// Packaged legal routes read these from the installation root, not app.asar.
export const runtimeFiles=['desktop.cjs','preload.cjs','server.mjs','package.json'];
export const userDocuments=['README.md','PRIVACY.md','TERMS.md','POLICIES.md','ASSET-NOTICES.md','OPERATIONS.md'];
export const retainedLocales=['en-US.pak','ja.pak'];

export async function trimLocales(output){
 const root=await fs.realpath(output),folder=path.join(root,'locales');
 if((await fs.lstat(folder)).isSymbolicLink()||await fs.realpath(folder)!==folder)throw Error('Unexpected locale directory');
 for(const name of retainedLocales)await fs.access(path.join(folder,name));
 for(const item of await fs.readdir(folder,{withFileTypes:true})){
  if(!item.isFile()||!item.name.endsWith('.pak'))throw Error('Unexpected locale file');
  if(retainedLocales.includes(item.name))continue;
  const target=path.resolve(folder,item.name);if(path.dirname(target)!==folder)throw Error('Locale path escaped distribution');
  await fs.unlink(target);
 }
}
