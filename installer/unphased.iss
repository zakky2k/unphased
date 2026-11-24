; Unphased — Windows installer.
;
; Build the portable bundle first, then compile this:
;     node web\app\scripts\build-release.mjs --no-zip
;     iscc /DAppVersion=0.1.0 installer\unphased.iss
;
; build-release.mjs does both steps in order when Inno Setup is on PATH, so the
; usual invocation is just the node script. Override the bundle location with
; /DBundleDir=<path> if you built it somewhere else.

#define MyAppName      "Unphased"
#ifndef AppVersion
  #define AppVersion   "0.1.0"
#endif
#ifndef BundleDir
  #define BundleDir    "..\dist\Unphased-" + AppVersion + "-win-x64"
#endif

[Setup]
AppId={{8F3C2A71-5E4B-4C9A-9D1E-0A7B6C2D4E11}
AppName={#MyAppName}
AppVersion={#AppVersion}
AppPublisher=zakfo
DefaultDirName={autopf}\Unphased
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=Unphased-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
LicenseFile=..\LICENSE
UninstallDisplayName={#MyAppName}
; Nothing here needs admin: it binds to 127.0.0.1 and writes no registry keys
; outside its own uninstall entry, so let unprivileged users install per-user.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#BundleDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\Unphased.cmd"; IconFilename: "{app}\installer\unphased.ico"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\Unphased.cmd"; IconFilename: "{app}\installer\unphased.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\Unphased.cmd"; Description: "Start {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\Unphased"
