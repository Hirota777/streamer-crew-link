# Legacy DAC trust integration check

On Windows with .NET 10 SDK, extract `runtimes/win-x64/native/coreclr.dll` and `mscordaccore.dll` from the signature-verified Microsoft.NETCore.App.Runtime.win-x64 6.0.7 NuGet package into a temporary input directory. Then run:

```
dotnet run --project test/reader-trust/TrustCheck.csproj -- <input-directory>
```

The test copies the inputs into its own temporary directory. It does not modify the input directory or the game. It checks the official pair, a modified DAC, an incorrect runtime pair, and file write protection while the verification lock is held. Native binaries and the package are not committed or shipped.
