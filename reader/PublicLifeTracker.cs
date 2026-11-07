enum GamePhase { Unknown, Menu, Lobby, Tasks, Meeting, Exile, Ended }
readonly record struct LifeSample(int Id,bool Dead);

// Raw deaths never leave the reader. Publish them only at the agreed meeting
// boundaries, and classify an exile only when the voted player is actually dead.
sealed class PublicLifeTracker
{
    readonly Dictionary<int,string> states=new();
    GamePhase previous=GamePhase.Unknown;
    int? candidate;
    bool awaitingExile;
    readonly HashSet<int> eligible=new();
    internal void Reset(){states.Clear();eligible.Clear();previous=GamePhase.Unknown;candidate=null;awaitingExile=false;}
    internal string State(int id)=>states.GetValueOrDefault(id,"alive");
    internal void Update(GamePhase phase,IReadOnlyList<LifeSample> players,int? votedPlayer)
    {
        if(phase==GamePhase.Unknown)return;
        if((phase is GamePhase.Lobby or GamePhase.Menu) || (phase==GamePhase.Tasks&&(previous is GamePhase.Lobby or GamePhase.Ended))){
            states.Clear();candidate=null;awaitingExile=false;
        }
        if(phase==GamePhase.Meeting){
            if(previous!=GamePhase.Meeting){
                candidate=null;awaitingExile=false;
                eligible.Clear();foreach(var player in players.Where(p=>!p.Dead))eligible.Add(player.Id);
                foreach(var player in players)states[player.Id]=player.Dead?(State(player.Id)=="exiled"?"exiled":"dead"):"alive";
            }
            // Read the candidate only after voting reaches results, not during voting.
            if(votedPlayer.HasValue)candidate=eligible.Contains(votedPlayer.Value)?votedPlayer:null;
        }
        if(previous==GamePhase.Meeting && (phase is GamePhase.Exile or GamePhase.Tasks or GamePhase.Ended)){
            if(phase==GamePhase.Exile&&votedPlayer.HasValue)candidate=eligible.Contains(votedPlayer.Value)?votedPlayer:null;
            foreach(var player in players)states[player.Id]=player.Dead?(State(player.Id)=="exiled"?"exiled":"dead"):"alive";
            awaitingExile=true;
        }
        if(awaitingExile && (phase is GamePhase.Exile or GamePhase.Tasks or GamePhase.Ended) && candidate.HasValue){
            var voted=players.FirstOrDefault(p=>p.Id==candidate.Value);
            if(voted.Id==candidate.Value&&voted.Dead){states[voted.Id]="exiled";awaitingExile=false;}
            else if(phase is GamePhase.Tasks or GamePhase.Ended)awaitingExile=false;
        }
        previous=phase;
    }
}
