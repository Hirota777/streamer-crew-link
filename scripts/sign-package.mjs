import {prepareSigning,signPackage} from './windows-signing.mjs';
try{if(!process.argv[2])throw Error('署名対象の配布フォルダーを指定してください。');const config=await prepareSigning();const verified=await signPackage(process.argv[2],config);console.log(`Code signing verified: ${verified.length} application files.`);}catch(error){console.error(error.message);process.exitCode=1;}
