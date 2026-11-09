using System.Security.Cryptography;
using System.Text.Json;

// Compiles the production parser unchanged. No mod assembly is loaded/executed.
if(args.Length<1)throw new ArgumentException("Pass the official SNR 3.3.0.0 DLL path; optionally CSV and output JSON paths.");
const string expectedHash="57B47E1DADD9B3FCEC42B69EA8BCF16BD5888E7D27F3C8A69FBD27410B20FAC2";
using(var input=File.OpenRead(args[0]))
    if(Convert.ToHexString(SHA256.HashData(input))!=expectedHash)throw new Exception("Unexpected official DLL hash");
SnrPalette.SelfTest();
var palette=SnrPalette.Read(args[0]);
if(palette.Count!=64||!palette.Keys.Order().SequenceEqual(Enumerable.Range(18,64)))throw new Exception("Expected colour IDs 18 through 81");
void Check(int id,string body,string shadow){if(palette[id].Body!=body||palette[id].Shadow!=shadow)throw new Exception($"Incorrect colour {id}");}
Check(18,"#FFFFFF","#F0F0F0");
Check(24,"#FF9C3B","#A347FF"); // CSV ID 43 precedes ID 42; never sort numerically.
Check(25,"#FFD7B0","#F0B17C");
Check(53,"#EFBFC0","#B67772");
Check(54,"#000000","#000000");
Check(81,"#6D071A","#36020B");
if(palette.Values.Any(s=>s.Visor!="#95C9DB"))throw new Exception("Unexpected visor colour");
Console.WriteLine("Official DLL: SHA256 verified; 64 additional colours (IDs 18..81), CSV order and boundary shades passed.");
if(args.Length>=2){
    // Independent expectation from the tagged official source CSV, not Parse().
    var rows=File.ReadAllLines(args[1]).Select(l=>l.TrimStart('\uFEFF').Trim()).Where(l=>l.Length>0&&l[0]!='*'&&l[0]!='#').Select(l=>l.Split(',')).ToArray();
    var ordered=rows.Where(r=>r[9]=="light").Concat(rows.Where(r=>r[9]=="dark")).ToArray();
    if(ordered.Length!=64)throw new Exception("Unexpected source CSV length");
    for(int i=0;i<ordered.Length;i++){
        var r=ordered[i];
        string Hex(int start)=>"#"+string.Concat(r.Skip(start).Take(3).Select(v=>int.Parse(v).ToString("X2")));
        Check(i+18,Hex(1),Hex(5));
    }
    Console.WriteLine("Official source CSV: every body/shadow channel matches the installed DLL parser output.");
}
foreach(var csv in new[]{"", "1,1,2,3,255,4,5,6,255,light\n1,1,2,3,255,4,5,6,255,dark", "256,1,2,3,255,4,5,6,255,light", "1,1,2,3,255,4,5,6,255,light,extra",new string('x',65537)}){
    try{SnrPalette.Parse(csv);throw new Exception("Invalid CSV accepted");}catch(IOException){}
}
var invalid=Path.GetTempFileName();
try{
    File.WriteAllText(invalid,"not a PE assembly");
    try{SnrPalette.Read(invalid);throw new Exception("Invalid DLL accepted");}catch(BadImageFormatException){}
    try{SnrPalette.Read(typeof(SnrPalette).Assembly.Location);throw new Exception("Wrong assembly accepted");}catch(IOException){}
}finally{File.Delete(invalid);}
Console.WriteLine("Malformed CSV, duplicate/out-of-range IDs, oversized input, invalid PE and wrong assembly rejection passed.");
if(args.Length>=3)File.WriteAllText(args[2],JsonSerializer.Serialize(palette));

// The parser uses only this DTO; the Windows/Nebula memory reader is excluded.
static class NebulaPalette { public record Shade(string Body,string Shadow,string Visor); }
