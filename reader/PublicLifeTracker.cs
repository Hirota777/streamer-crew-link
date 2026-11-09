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
    long exileDeadline;
    int? completedMeetings;
    readonly HashSet<int> delayedDeaths=new();
    readonly HashSet<int> eligible=new();
    internal void Reset(){states.Clear();eligible.Clear();delayedDeaths.Clear();previous=GamePhase.Unknown;candidate=null;awaitingExile=false;completedMeetings=null;}
    internal string State(int id)=>states.GetValueOrDefault(id,"alive");
    internal bool IsDeferred(int id)=>delayedDeaths.Contains(id);
    void Publish(LifeSample player){if(!delayedDeaths.Contains(player.Id))states[player.Id]=player.Dead?(State(player.Id)=="exiled"?"exiled":"dead"):"alive";}
    internal void Update(GamePhase phase,IReadOnlyList<LifeSample> players,int? votedPlayer,long? timestamp=null,int? publicCompletedMeetings=null,IReadOnlySet<int>? deferredMadmateDeaths=null)
    {
        var now=timestamp??Environment.TickCount64;
        var enteringMeeting=phase==GamePhase.Meeting&&previous!=GamePhase.Meeting;
        if(enteringMeeting)delayedDeaths.Clear();
        else if(deferredMadmateDeaths!=null)foreach(var player in players)if(player.Dead&&State(player.Id)=="alive"&&deferredMadmateDeaths.Contains(player.Id))delayedDeaths.Add(player.Id);
        var completed=publicCompletedMeetings.HasValue&&completedMeetings.HasValue&&publicCompletedMeetings>completedMeetings;
        if(publicCompletedMeetings.HasValue)completedMeetings=publicCompletedMeetings;
        if(phase==GamePhase.Unknown){if(completed)foreach(var player in players)Publish(player);return;}
        if((phase is GamePhase.Lobby or GamePhase.Menu) || (phase==GamePhase.Tasks&&(previous is GamePhase.Lobby or GamePhase.Ended))){
            states.Clear();candidate=null;awaitingExile=false;
            delayedDeaths.Clear();
            completed=false;
        }
        if(phase==GamePhase.Meeting){
            if(previous!=GamePhase.Meeting){
                candidate=null;awaitingExile=false;
                eligible.Clear();foreach(var player in players.Where(p=>!p.Dead))eligible.Add(player.Id);
                foreach(var player in players)Publish(player);
            }
            // Read the candidate only after voting reaches results, not during voting.
            if(votedPlayer.HasValue)candidate=eligible.Contains(votedPlayer.Value)?votedPlayer:null;
        }
        if((previous==GamePhase.Meeting || previous==GamePhase.Exile) && (phase is GamePhase.Exile or GamePhase.Tasks or GamePhase.Ended)){
            if(phase==GamePhase.Exile&&votedPlayer.HasValue)candidate=eligible.Contains(votedPlayer.Value)?votedPlayer:null;
            foreach(var player in players)Publish(player);
            if(previous==GamePhase.Meeting){awaitingExile=true;exileDeadline=now+5000;}
            if(previous==GamePhase.Exile&&phase!=GamePhase.Exile)exileDeadline=now+5000;
        }
        // Exile animations may outlive MeetingHud and the dead flag may arrive
        // after its first frame. Refresh throughout the public exile phase and
        // once on return to tasks, including when no vote target was readable.
        // After that, only the known voted player is eligible for late updates:
        // ordinary task-phase kills must remain hidden until the next meeting.
        if(awaitingExile && (phase is GamePhase.Exile or GamePhase.Tasks or GamePhase.Ended) && candidate.HasValue){
            var voted=players.FirstOrDefault(p=>p.Id==candidate.Value);
            if(phase!=GamePhase.Exile&&now>=exileDeadline)awaitingExile=false;
            else if(voted.Id==candidate.Value&&voted.Dead&&!delayedDeaths.Contains(voted.Id)){states[voted.Id]="exiled";awaitingExile=false;}
        }
        // Nebula completes exile(s), extra victims and synchronization after
        // the native MeetingHud disappears. Its public MeetingEnd event is the
        // authoritative second boundary, regardless of native vote target.
        if(completed){foreach(var player in players)Publish(player);awaitingExile=false;}
        previous=phase;
    }
}
