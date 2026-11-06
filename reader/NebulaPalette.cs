using Microsoft.Diagnostics.Runtime;

sealed class NebulaPalette : IDisposable
{
    DataTarget? target;
    ClrRuntime? runtime;
    public record Shade(string Body,string Shadow,string Visor);
    public Dictionary<int,Shade> Read(int processId)
    {
        target ??= DataTarget.AttachToProcess(processId, suspend:false);
        if(runtime==null){
            var clr=target.ClrVersions.First();
            var dac=Path.Combine(Path.GetDirectoryName(clr.ModuleInfo.FileName)!,"mscordaccore.dll");
            if(!File.Exists(dac))throw new IOException("Matching local DAC is unavailable");
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
    public void Dispose(){runtime?.Dispose();target?.Dispose();runtime=null;target=null;}
}
