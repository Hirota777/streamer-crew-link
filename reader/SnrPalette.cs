using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Text;

// Inspect the installed assembly as data. Never load or execute mod code.
static class SnrPalette
{
    internal const string VerifiedVersion="3.3.0.0";
    internal static Dictionary<int,NebulaPalette.Shade> Read(string file)
    {
        if(new FileInfo(file).Length>256*1024*1024)throw new IOException("SNR assembly is too large");
        using var stream=File.OpenRead(file);
        using var pe=new PEReader(stream);
        var metadata=pe.GetMetadataReader();var assembly=metadata.GetAssemblyDefinition();
        if(metadata.GetString(assembly.Name)!="SuperNewRoles"||assembly.Version.ToString()!=VerifiedVersion)
            throw new IOException("Unverified SNR version");
        foreach(var handle in metadata.ManifestResources){
            var resource=metadata.GetManifestResource(handle);
            if(metadata.GetString(resource.Name)!="SuperNewRoles.Resources.Color.csv")continue;
            var directory=pe.PEHeaders.CorHeader!.ResourcesDirectory;
            if(!resource.Implementation.IsNil||resource.Offset<0||resource.Offset>directory.Size-4)throw new IOException("Invalid SNR resource");
            var data=pe.GetSectionData(directory.RelativeVirtualAddress).GetContent(0,directory.Size);
            var offset=checked((int)resource.Offset);var length=BitConverter.ToInt32(data.AsSpan(offset,4));
            if(length<1||length>64*1024||length>directory.Size-offset-4)throw new IOException("Invalid SNR resource size");
            return Parse(new UTF8Encoding(false,true).GetString(data.AsSpan(offset+4,length)));
        }
        throw new IOException("SNR colour resource not found");
    }
    internal static Dictionary<int,NebulaPalette.Shade> Parse(string csv)
    {
        if(csv.Length>64*1024)throw new IOException("SNR colour data is too large");
        var rows=new List<(bool light,NebulaPalette.Shade shade)>();var ids=new HashSet<int>();
        foreach(var line in csv.TrimStart('\uFEFF').Split('\n')){
            var text=line.Trim();if(text.Length==0||text[0]=='#'||text[0]=='*')continue;
            var cells=text.Split(',');
            if(cells.Length!=10||!int.TryParse(cells[0],out var id)||id<0||id>255||!ids.Add(id)||cells[9] is not ("light" or "dark"))throw new IOException("Invalid SNR colour row");
            var values=cells.Skip(1).Take(8).Select(s=>byte.TryParse(s,out var b)?b:throw new IOException("Invalid SNR channel")).ToArray();
            if(values[3]!=255||values[7]!=255)throw new IOException("Unsupported SNR alpha");
            rows.Add((cells[9]=="light",new($"#{values[0]:X2}{values[1]:X2}{values[2]:X2}",$"#{values[4]:X2}{values[5]:X2}{values[6]:X2}","#95C9DB")));
        }
        if(rows.Count<1||rows.Count>238)throw new IOException("Invalid SNR palette length");
        // SNR appends light entries first, then dark entries, preserving CSV order.
        return rows.Where(r=>r.light).Concat(rows.Where(r=>!r.light)).Select((r,i)=>(id:i+18,r.shade)).ToDictionary(r=>r.id,r=>r.shade);
    }
    internal static void SelfTest()
    {
        var data=Parse("\uFEFF*0,ignored\n#comment\n99,1,2,3,255,4,5,6,255,dark\n36,200,201,202,255,90,91,92,255,light\n");
        if(data[18].Body!="#C8C9CA"||data[19].Shadow!="#040506")throw new Exception("SNR colour order");
        foreach(var invalid in new[]{"1,256,0,0,255,0,0,0,255,light","1,0,0,0,0,0,0,0,255,light","1,0,0,0,255,0,0,0,255,other"}){
            try{Parse(invalid);throw new Exception("SNR invalid data accepted");}catch(IOException){}
        }
        Console.WriteLine("SNR parser self-test passed: sorted colour IDs and invalid channel/alpha/mode rejected.");
    }
}
