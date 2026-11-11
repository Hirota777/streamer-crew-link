process.env.CREW_LINK_SIGN_REQUIRED='1';
try{await import('./package.mjs');}catch(error){console.error(error.message);process.exitCode=1;}
