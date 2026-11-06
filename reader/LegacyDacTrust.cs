using System.Security.Cryptography;

// .NET 6.0.7 predates the DAC-specific signing EKU required by ClrMD 4.
// Permit only this exact Microsoft runtime/DAC pair, verified against the
// signed Microsoft.NETCore.App.Runtime.win-x64 6.0.7 NuGet package.
// Keep both files locked against replacement until the diagnostic runtime closes.
sealed class LegacyDacTrust : IDisposable
{
    const string CoreHash="04377968C540F704AAE92ECB0EC9BBFD5FDDFE226DFCA30AA3EEB52006A44FD8";
    const string DacHash="DD2DA6E841155C8869A68270D951246CBFE67943BB71082121FC5EA3D5439661";
    readonly FileStream core,dac;
    internal string DacPath {get;}
    LegacyDacTrust(FileStream core,FileStream dac,string path){this.core=core;this.dac=dac;DacPath=Path.GetFullPath(path);}
    internal static LegacyDacTrust? TryOpen(string corePath,string dacPath)
    {
        FileStream? core=null,dac=null;
        try{
            core=File.Open(corePath,FileMode.Open,FileAccess.Read,FileShare.Read);
            dac=File.Open(dacPath,FileMode.Open,FileAccess.Read,FileShare.Read);
            if(core.Length>32*1024*1024||dac.Length>32*1024*1024||
               !Matches(Convert.ToHexString(SHA256.HashData(core)),Convert.ToHexString(SHA256.HashData(dac))))return null;
            var trusted=new LegacyDacTrust(core,dac,dacPath);core=null;dac=null;return trusted;
        }finally{core?.Dispose();dac?.Dispose();}
    }
    internal static bool Matches(string coreHash,string dacHash)=>coreHash==CoreHash&&dacHash==DacHash;
    internal bool IsVerified(string path)=>StringComparer.OrdinalIgnoreCase.Equals(Path.GetFullPath(path),DacPath);
    public void Dispose(){dac.Dispose();core.Dispose();}
    internal static void SelfTest(){
        if(!Matches(CoreHash,DacHash)||Matches(new string('0',64),DacHash)||Matches(CoreHash,new string('0',64)))throw new Exception("Legacy DAC trust policy");
        Console.WriteLine("Legacy DAC trust self-test passed: exact official runtime/DAC pair required.");
    }
}
