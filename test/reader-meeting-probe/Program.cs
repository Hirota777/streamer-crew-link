using System.Text.Json;
using var probe=new NebulaPalette();probe.Read(int.Parse(args[1]));Console.WriteLine(JsonSerializer.Serialize(new{completedMeetings=probe.CompletedMeetings(),madmateCollateralCount=probe.MadmateCollateralDeaths(Enumerable.Range(0,32).ToHashSet()).Count}));
