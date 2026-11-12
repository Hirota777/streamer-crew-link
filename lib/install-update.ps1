param([Parameter(Mandatory=$true)][string]$Job)
$ErrorActionPreference='Stop'
# A parent launched from PowerShell 7 can pass a module path that Windows PowerShell 5 cannot use.
$env:PSModulePath=[IO.Path]::Combine($PSHOME,'Modules')
$info=$null
function Show-UpdateMessage([string]$message){Add-Type -AssemblyName System.Windows.Forms;[Windows.Forms.MessageBox]::Show($message,'Streamer crew link 更新')|Out-Null}
function Get-InstallProcesses([string]$root){
 $prefix=[IO.Path]::GetFullPath($root).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
 @(Get-Process | Where-Object {try{$_.Id -ne $PID -and $_.Path -and [IO.Path]::GetFullPath($_.Path).StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)}catch{$false}})
}
function Wait-InstallProcesses([string]$root,[int]$timeoutMs=15000){
 $clock=[Diagnostics.Stopwatch]::StartNew();$quiet=0
 while($clock.ElapsedMilliseconds -lt $timeoutMs){
  if(@(Get-InstallProcesses $root).Count -eq 0){$quiet++;if($quiet -ge 2){return}}else{$quiet=0}
  Start-Sleep -Milliseconds 200
 }
 throw 'アプリの関連プロセスが終了していないため、更新を中止しました。アプリを閉じてから再試行してください。'
}
function Write-Result([string]$status,[string]$message){
 if($null -ne $info){$json=@{status=$status;message=$message;version=$info.version}|ConvertTo-Json -Compress;$json|Set-Content -LiteralPath $info.result -Encoding UTF8;if((Test-Path -LiteralPath $info.commit) -and !(Test-Path -LiteralPath $info.cancel)){$json|Set-Content -LiteralPath $info.lastResult -Encoding UTF8}}
}
try {
 $info=Get-Content -LiteralPath $Job -Raw|ConvertFrom-Json
 if($info.started){[IO.File]::WriteAllText($info.started,'started')}
 if(Test-Path -LiteralPath $info.cancel){Write-Result 'cancelled' '更新を中止しました。';exit 0}
 if($info.sha256 -notmatch '^[a-f0-9]{64}$' -or $info.version -notmatch '^\d+\.\d+\.\d+$'){throw '更新情報が不正です。'}
 $expected=Join-Path $env:LOCALAPPDATA 'Programs\Streamer crew link\Streamer crew link.exe'
 if([IO.Path]::GetFullPath($info.exe) -ine [IO.Path]::GetFullPath($expected)){throw 'インストール先が一致しません。'}
 if((Get-FileHash -LiteralPath $info.msi -Algorithm SHA256).Hash -ine $info.sha256){throw '更新ファイルの照合に失敗しました。'}
 $installer=New-Object -ComObject WindowsInstaller.Installer
 $db=$installer.OpenDatabase($info.msi,0)
 function Msi-Property([string]$name){$v=$db.OpenView("SELECT ``Value`` FROM ``Property`` WHERE ``Property``='$name'");$v.Execute();$r=$v.Fetch();if($null -eq $r){throw 'MSI情報が不足しています。'};return $r.StringData(1)}
 if((Msi-Property 'UpgradeCode') -ine '{8FAFDAD1-280D-478C-A7ED-30FBEA4B5C72}' -or (Msi-Property 'ProductVersion') -ne $info.version -or (Msi-Property 'ProductName') -ne 'Streamer crew link'){throw 'このアプリ用の更新ファイルではありません。'}
 [Runtime.InteropServices.Marshal]::FinalReleaseComObject($db)|Out-Null
 [Runtime.InteropServices.Marshal]::FinalReleaseComObject($installer)|Out-Null
 # The app closes only after this helper has validated the package and signalled readiness.
 [IO.File]::WriteAllText($info.ready,'ready')
 if(Test-Path -LiteralPath $info.cancel){Write-Result 'cancelled' '更新を中止しました。';exit 0}
 $parent=Get-Process -Id $info.pid -ErrorAction SilentlyContinue
 if($null -ne $parent){
  $parentWait=[Diagnostics.Stopwatch]::StartNew()
  while(!$parent.WaitForExit(200)){
   if(Test-Path -LiteralPath $info.cancel){Write-Result 'cancelled' 'アプリの終了が中止されたため、更新を中止しました。';exit 0}
   if($parentWait.ElapsedMilliseconds -ge 60000){
    if(!(Test-Path -LiteralPath $info.commit)){Write-Result 'cancelled' 'アプリの終了が確認できないため、更新を中止しました。';exit 0}
    throw 'アプリが終了しなかったため、更新を中止しました。'
   }
  }
 }
 if(!(Test-Path -LiteralPath $info.commit) -or (Test-Path -LiteralPath $info.cancel)){Write-Result 'cancelled' 'アプリの終了が確認できないため、更新を中止しました。';exit 0}
 Wait-InstallProcesses ([IO.Path]::GetDirectoryName($info.exe))
 # Repeat immediately before execution, after waiting for the app to exit.
 if((Get-FileHash -LiteralPath $info.msi -Algorithm SHA256).Hash -ine $info.sha256){throw '更新ファイルが変更されたため、中止しました。'}
 $process=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\msiexec.exe') -ArgumentList @('/i',('"'+$info.msi+'"'),'/norestart') -PassThru -Wait -WindowStyle Normal
 if($process.ExitCode -eq 0){Write-Result 'success' '更新が完了しました。';Start-Process -FilePath $info.exe -WorkingDirectory ([IO.Path]::GetDirectoryName($info.exe)) -WindowStyle Hidden}
 elseif($process.ExitCode -eq 3010){Write-Result 'reboot' '更新が完了しました。Windowsを再起動してからアプリを起動してください。';Show-UpdateMessage '更新が完了しました。Windowsを再起動してからアプリを起動してください。'}
 elseif($process.ExitCode -eq 1602){Write-Result 'cancelled' '更新はキャンセルされました。';Start-Process -FilePath $info.exe -WorkingDirectory ([IO.Path]::GetDirectoryName($info.exe)) -WindowStyle Hidden}
 else{throw ('インストールが完了しませんでした。コード: '+$process.ExitCode)}
}catch{
 Write-Result 'error' $_.Exception.Message
 if($null -eq $info -or !(Test-Path -LiteralPath $info.commit) -or (Test-Path -LiteralPath $info.cancel)){exit 1}
 Show-UpdateMessage ($_.Exception.Message+"`n配信補助アプリをショートカットから起動し直してください。")
 exit 1
}
