sealed record SnrObservation(int MeetingCount,bool WrapReady,int AirshipWrapCount,Dictionary<int,int> FinalStates)
{
    internal static bool IsCollateral(int status)=>status is 4 or 23 or 26; // Revange, LoversSuicide, VampireWithDead
    internal bool SameAs(SnrObservation other)=>MeetingCount==other.MeetingCount&&WrapReady==other.WrapReady&&AirshipWrapCount==other.AirshipWrapCount&&FinalStates.Count==other.FinalStates.Count&&FinalStates.All(p=>other.FinalStates.TryGetValue(p.Key,out var value)&&value==p.Value);
}
// Observe SNR's wrap-up marker, with durable Airship/final-exile evidence if
// the short marker was missed. Initial attachment never republishes history.
sealed class SnrMeetingTracker
{
    int? meeting;int completed,airship;bool armed,blocked,airshipEvidence;
    GamePhase previous=GamePhase.Unknown;
    readonly HashSet<int> baselineExiles=new();
    readonly Dictionary<int,long> confirmedExiles=new();
    internal int Completed=>completed;
    internal IReadOnlySet<int> ConfirmedExiles(long now)=>confirmedExiles.Where(e=>now-e.Value<5000).Select(e=>e.Key).ToHashSet();
    internal void Published(PublicLifeTracker life){foreach(var id in confirmedExiles.Keys.ToArray())if(life.State(id)!="alive")confirmedExiles.Remove(id);}
    internal void Reset(){meeting=null;completed=0;airship=0;armed=blocked=airshipEvidence=false;previous=GamePhase.Unknown;baselineExiles.Clear();confirmedExiles.Clear();}
    internal void Update(GamePhase phase,SnrObservation frame,long now)
    {
        if(phase is GamePhase.Lobby or GamePhase.Menu){Reset();return;}
        if(meeting==null){meeting=frame.MeetingCount;airship=frame.AirshipWrapCount;foreach(var p in frame.FinalStates.Where(p=>p.Value==5))baselineExiles.Add(p.Key);armed=phase==GamePhase.Meeting;}
        if(frame.MeetingCount<meeting){Reset();meeting=frame.MeetingCount;airship=frame.AirshipWrapCount;}
        if(frame.MeetingCount>meeting||(phase==GamePhase.Meeting&&previous!=GamePhase.Meeting)){meeting=frame.MeetingCount;armed=true;blocked=airshipEvidence=false;baselineExiles.Clear();confirmedExiles.Clear();foreach(var p in frame.FinalStates.Where(p=>p.Value==5))baselineExiles.Add(p.Key);}
        if(armed&&phase!=GamePhase.Meeting){
            if(!frame.WrapReady)blocked=true;
            if(frame.AirshipWrapCount>airship)airshipEvidence=true;
            var newExiles=frame.FinalStates.Where(p=>p.Value==5&&!baselineExiles.Contains(p.Key)).Select(p=>p.Key).ToArray();
            if(frame.WrapReady&&(blocked||airshipEvidence||newExiles.Length>0)){
                foreach(var id in newExiles)confirmedExiles[id]=now;
                completed++;armed=false;
            }
        }
        airship=frame.AirshipWrapCount;
        previous=phase;
    }
}
