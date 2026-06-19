# Run this script inside Playnite (e.g., via the Scripting Console or as an Extension)
# This will dump your library including Playtime and LastActivity for the new intelligent suggestions.

$exportPath = "C:\coding-projects\GameShelf3D\playnite_export.json"

# Grab the games and select the needed fields
$games = $PlayniteApi.Database.Games | Select-Object IsInstalled, CoverImage, Name, Id, InstallDirectory, Playtime, LastActivity

# Export as JSON
$games | ConvertTo-Json -Depth 10 | Out-File $exportPath -Encoding utf8

Write-Host "Successfully exported your Playnite library with playtime data to $exportPath"
