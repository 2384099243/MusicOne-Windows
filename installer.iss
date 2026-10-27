#define AppVersion "1.0.0"
#ifndef AppSource
  #define AppSource SourcePath + "dist\MusicOne-Windows"
#endif
#ifndef OutputPath
  #define OutputPath SourcePath + "dist"
#endif

[Setup]
AppId={{6E098472-18DC-4AC6-A356-BF0BFC5420D7}
AppName=MusicOne Windows
AppVersion={#AppVersion}
AppVerName=MusicOne Windows {#AppVersion}
AppPublisher=MusicOne Windows contributors
AppPublisherURL=https://github.com/2384099243/MusicOne-Windows
AppSupportURL=https://github.com/2384099243/MusicOne-Windows/issues
AppUpdatesURL=https://github.com/2384099243/MusicOne-Windows/releases
DefaultDirName={localappdata}\Programs\MusicOne
DefaultGroupName=MusicOne
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
DisableProgramGroupPage=yes
LicenseFile=LICENSE
OutputDir={#OutputPath}
OutputBaseFilename=MusicOne-Windows-{#AppVersion}-Setup-x64
SetupIconFile=assets\icon.ico
UninstallDisplayIcon={app}\resources\app\assets\icon.ico
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
RestartApplications=no
UninstallDisplayName=MusicOne Windows
VersionInfoVersion=1.0.0.0

[Languages]
Name: "chinesesimp"; MessagesFile: "installer\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "快捷方式："; Flags: unchecked

[Files]
Source: "{#AppSource}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\MusicOne"; Filename: "{app}\MusicOne.exe"; IconFilename: "{app}\resources\app\assets\icon.ico"
Name: "{group}\卸载 MusicOne"; Filename: "{uninstallexe}"
Name: "{autodesktop}\MusicOne"; Filename: "{app}\MusicOne.exe"; IconFilename: "{app}\resources\app\assets\icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\MusicOne.exe"; Description: "启动 MusicOne"; Flags: nowait postinstall skipifsilent unchecked
