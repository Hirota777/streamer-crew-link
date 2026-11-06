if(args.Length!=1)throw new ArgumentException("Pass a directory containing the official .NET 6.0.7 win-x64 coreclr.dll and mscordaccore.dll.");
var inputs=Path.GetFullPath(args[0]);
var parent=Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar);
var root=Path.Combine(parent,"crewlink-dac-trust-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
try{
    var core=Path.Combine(root,"coreclr.dll");var dac=Path.Combine(root,"mscordaccore.dll");
    File.Copy(Path.Combine(inputs,"coreclr.dll"),core);File.Copy(Path.Combine(inputs,"mscordaccore.dll"),dac);
    using(var trusted=LegacyDacTrust.TryOpen(core,dac)){
        if(trusted==null||!trusted.IsVerified(dac)||trusted.IsVerified(core))throw new Exception("Official pair was not recognised");
        foreach(var file in new[]{core,dac}){
            try{using var write=File.Open(file,FileMode.Open,FileAccess.Write,FileShare.ReadWrite);throw new Exception("Verified file was writable");}
            catch(IOException){}
        }
    }
    var modified=Path.Combine(root,"tampered-dac.dll");var bytes=File.ReadAllBytes(dac);bytes[200]^=0x80;File.WriteAllBytes(modified,bytes);
    using(var untrusted=LegacyDacTrust.TryOpen(core,modified)){if(untrusted!=null)throw new Exception("Modified DAC was accepted");}
    using(var untrusted=LegacyDacTrust.TryOpen(dac,dac)){if(untrusted!=null)throw new Exception("Wrong runtime was accepted");}
    Console.WriteLine("Real-file trust tests passed: official pair accepted; modified DLL/wrong runtime rejected; both verified files locked against writes.");
}finally{
    if(Path.GetDirectoryName(Path.GetFullPath(root))!=parent||!Path.GetFileName(root).StartsWith("crewlink-dac-trust-"))throw new Exception("Unexpected test directory");
    Directory.Delete(root,recursive:true);
}
