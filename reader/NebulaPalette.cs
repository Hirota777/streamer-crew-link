using Microsoft.Diagnostics.Runtime;

sealed class NebulaPalette : IDisposable
{
    DataTarget? target;
    ClrRuntime? runtime;
    LegacyDacTrust? legacyTrust;
    public record Shade(string Body,string Shadow,string Visor);
    public Dictionary<int,Shade> Read(int processId)
    {
        target ??= DataTarget.AttachToProcess(processId, suspend:false,new DataTargetOptions{
            VerifyDacOnWindows=true,
            // All other files retain ClrMD's default signature verification.
            DacSignatureVerificationOverride=path=>legacyTrust?.IsVerified(path)!=true
        });
        if(runtime==null){
            var clr=target.ClrVersions.First();
            var dac=Path.Combine(Path.GetDirectoryName(clr.ModuleInfo.FileName)!,"mscordaccore.dll");
            if(!File.Exists(dac))throw new IOException("Matching local DAC is unavailable");
            legacyTrust=LegacyDacTrust.TryOpen(clr.ModuleInfo.FileName,dac);
            runtime=clr.CreateRuntime(dac);
        }
        runtime.FlushCachedData();
        var type=runtime.EnumerateModules().Select(m=>m.GetTypeByName("Nebula.Modules.Cosmetics.DynamicPalette")).FirstOrDefault(t=>t!=null);
        if(type==null)throw new IOException("Nebula palette is not loaded");
        var domain=runtime.AppDomains.First();
        var body=type.GetStaticFieldByName("PlayerColors")!.ReadObject(domain).AsArray();
        var shadow=type.GetStaticFieldByName("ShadowColors")!.ReadObject(domain).AsArray();
        var visor=type.GetStaticFieldByName("VisorColors")!.ReadObject(domain).AsArray();
        if(body.Length!=32||shadow.Length!=32||visor.Length!=32)throw new IOException("Unexpected Nebula palette layout");
        var result=new Dictionary<int,Shade>();
        for(int i=0;i<body.Length;i++)result[i]=new Shade(Hex(body.GetStructValue(i)),Hex(shadow.GetStructValue(i)),Hex(visor.GetStructValue(i)));
        return result;
    }
    static string Hex(ClrValueType color)
    {
        int Channel(string name){var f=color.ReadField<float>("<"+name+">k__BackingField");if(!float.IsFinite(f)||f<0||f>1)throw new IOException("Invalid color channel");return (int)Math.Round(f*255);}
        return $"#{Channel("R"):X2}{Channel("G"):X2}{Channel("B"):X2}";
    }
    internal static string FailureMessage(Exception error)=>error.Message.Contains("not properly signed",StringComparison.OrdinalIgnoreCase)
        ?"Nebulaの色取得を確認してください：診断ライブラリの署名またはバージョンが未対応です。"
        :error.Message.Contains("palette is not loaded",StringComparison.OrdinalIgnoreCase)
        ?"Nebulaの色情報の準備を待っています。ロビーに参加してください。"
        :error.Message.Contains("palette layout",StringComparison.OrdinalIgnoreCase)
        ?"Nebulaの色取得を確認してください：この色データ形式には未対応です。"
        :"Nebulaの色取得を確認してください：診断情報を読み取れません。実行権限や対応バージョンを確認してください。";
    public void Dispose(){runtime?.Dispose();target?.Dispose();legacyTrust?.Dispose();runtime=null;target=null;legacyTrust=null;}
}
