param([Parameter(Mandatory=$true)][string]$Job)
$ErrorActionPreference='Stop'
# A parent launched from PowerShell 7 can pass a module path that Windows PowerShell 5 cannot use.
$env:PSModulePath=[IO.Path]::Combine($PSHOME,'Modules')
Add-Type -AssemblyName System.Windows.Forms
$info=$null
function Write-Result([string]$status,[string]$message){
 if($null -ne $info){$json=@{status=$status;message=$message;version=$info.version}|ConvertTo-Json -Compress;$json|Set-Content -LiteralPath $info.result -Encoding UTF8;if(Test-Path -LiteralPath $info.commit){$json|Set-Content -LiteralPath $info.lastResult -Encoding UTF8}}
}
try {
 $info=Get-Content -LiteralPath $Job -Raw|ConvertFrom-Json
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
 if(Test-Path -LiteralPath $info.cancel){exit 0}
 $parent=Get-Process -Id $info.pid -ErrorAction SilentlyContinue
 if($null -ne $parent -and !$parent.WaitForExit(60000)){throw 'アプリが終了しなかったため、更新を中止しました。'}
 if(!(Test-Path -LiteralPath $info.commit)){throw 'アプリの終了が確認できないため、更新を中止しました。'}
 if(Test-Path -LiteralPath $info.cancel){exit 0}
 # Repeat immediately before execution, after waiting for the app to exit.
 if((Get-FileHash -LiteralPath $info.msi -Algorithm SHA256).Hash -ine $info.sha256){throw '更新ファイルが変更されたため、中止しました。'}
 $process=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\msiexec.exe') -ArgumentList @('/i',('"'+$info.msi+'"'),'/norestart') -PassThru -Wait -WindowStyle Normal
 if($process.ExitCode -eq 0){Write-Result 'success' '更新が完了しました。';Start-Process -FilePath $info.exe -WorkingDirectory ([IO.Path]::GetDirectoryName($info.exe)) -WindowStyle Hidden}
 elseif($process.ExitCode -eq 3010){Write-Result 'reboot' '更新が完了しました。Windowsを再起動してからアプリを起動してください。';[Windows.Forms.MessageBox]::Show('更新が完了しました。Windowsを再起動してからアプリを起動してください。','Streamer crew link')|Out-Null}
 elseif($process.ExitCode -eq 1602){Write-Result 'cancelled' '更新はキャンセルされました。';Start-Process -FilePath $info.exe -WorkingDirectory ([IO.Path]::GetDirectoryName($info.exe)) -WindowStyle Hidden}
 else{throw ('インストールが完了しませんでした。コード: '+$process.ExitCode)}
}catch{
 Write-Result 'error' $_.Exception.Message
 if($null -ne $info -and (!(Test-Path -LiteralPath $info.commit) -or (Test-Path -LiteralPath $info.cancel))){exit 1}
 [Windows.Forms.MessageBox]::Show(($_.Exception.Message+"`n配信補助アプリをショートカットから起動し直してください。"),'Streamer crew link 更新')|Out-Null
 exit 1
}
