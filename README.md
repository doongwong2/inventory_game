# inventory_game

## Local content editor (Go)

The designer editor is a local Go program. It serves the editor UI from the executable, opens it in your browser, and saves validated content to `data/game-content.json`. The Phaser game loads that same JSON at startup, so the published game remains a static web game with no Go server requirement.

### Set up Go on Windows

1. Install the Windows MSI from [go.dev/dl](https://go.dev/dl/), using the suggested defaults.
2. Close and reopen PowerShell so the Go command is available.
3. From this project folder, confirm the installation with `go version`.

### Start the editor

From the project folder, run:

```powershell
go run .
```

The editor opens in your default browser on an available local port. The game can continue running at `http://localhost:8080`; the editor selects its own port. Keep the terminal window open while editing. Press `Ctrl+C` there to stop the editor.

The editor can save directly to the project data file, import a JSON file, or export a copy. After saving, reload the game page to play with the new content.

Item sprites can be uploaded as transparent PNG files (up to 512 × 512 pixels and 2 MB). The editor stores them in `assets/items/` and records their relative paths in the game data. Use **Export game bundle** after saving to download a ZIP containing `data/game-content.json` and the sprite files; extract it into the static web game's root so Phaser can load the same data and images.

To build a standalone Windows executable in the project folder:

```powershell
go build -o cozy-uni-designer.exe .
```

Run the executable from the project folder (or pass `-data` with the path to `game-content.json`). The executable contains the editor page; the JSON file remains alongside the game so both the editor and Phaser can use it.
