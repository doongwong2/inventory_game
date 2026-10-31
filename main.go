package main

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"image/png"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

//go:embed designer.html designer.css designer.js
var editorFiles embed.FS

type gameContent struct {
	SchemaVersion int             `json:"schemaVersion"`
	StartingItems []string        `json:"startingItems"`
	Items         map[string]item `json:"items"`
	Days          []day           `json:"days"`
}

type item struct {
	Name        string   `json:"name"`
	Color       int64    `json:"color"`
	Shape       [][2]int `json:"shape"`
	Category    string   `json:"category"`
	Description string   `json:"description"`
	Sprite      string   `json:"sprite,omitempty"`
}

type day struct {
	Day      int       `json:"day"`
	Activity string    `json:"activity"`
	NPC      string    `json:"npc"`
	Intro    []string  `json:"intro"`
	Triggers []trigger `json:"triggers"`
	Outro    []string  `json:"outro"`
}

type trigger struct {
	WantItems    []string `json:"wantItems"`
	ConsumeItems []string `json:"consumeItems,omitempty"`
	Dialogue     string   `json:"dialogue"`
	AffinityGain float64  `json:"affinityGain"`
	ReceiveItem  string   `json:"receiveItem"`
}

func main() {
	dataPathFlag := flag.String("data", "", "path to game-content.json (default: data/game-content.json in the current or executable directory)")
	noBrowser := flag.Bool("no-browser", false, "print the editor URL without opening a browser")
	flag.Parse()

	dataPath := resolveDataPath(*dataPathFlag)
	if _, err := os.Stat(dataPath); err != nil {
		log.Fatalf("game data file %q is unavailable: %v", dataPath, err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Fatalf("start local editor listener: %v", err)
	}
	address := "http://" + listener.Addr().String()
	projectRoot := filepath.Dir(filepath.Dir(dataPath))
	assetsDir := filepath.Join(projectRoot, "assets", "items")
	mux := http.NewServeMux()
	mux.HandleFunc("/api/content", contentHandler(dataPath))
	mux.HandleFunc("/api/sprite", spriteHandler(assetsDir))
	mux.HandleFunc("/api/export-bundle", bundleHandler(dataPath, projectRoot))
	mux.HandleFunc("/assets/items/", spriteFileHandler(assetsDir))
	mux.HandleFunc("/designer.css", embeddedFile("designer.css", "text/css; charset=utf-8"))
	mux.HandleFunc("/designer.js", embeddedFile("designer.js", "text/javascript; charset=utf-8"))
	mux.HandleFunc("/", embeddedFile("designer.html", "text/html; charset=utf-8"))

	server := &http.Server{
		Handler:           localOnly(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}
	fmt.Printf("Designer editor is running at %s\nGame data: %s\nClose this window to stop the editor.\n", address, dataPath)
	if !*noBrowser {
		go func() {
			time.Sleep(300 * time.Millisecond)
			if err := openBrowser(address); err != nil {
				log.Printf("could not open a browser automatically: %v", err)
			}
		}()
	}
	if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func resolveDataPath(explicit string) string {
	if explicit != "" {
		return filepath.Clean(explicit)
	}
	name := filepath.Join("data", "game-content.json")
	if _, err := os.Stat(name); err == nil {
		absolute, _ := filepath.Abs(name)
		return absolute
	}
	if executable, err := os.Executable(); err == nil {
		candidate := filepath.Join(filepath.Dir(executable), name)
		if _, err := os.Stat(candidate); err == nil {
			absolute, _ := filepath.Abs(candidate)
			return absolute
		}
	}
	absolute, _ := filepath.Abs(name)
	return absolute
}

func embeddedFile(name, contentType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		body, err := editorFiles.ReadFile(name)
		if err != nil {
			http.Error(w, "editor asset unavailable", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusOK)
		if r.Method == http.MethodGet {
			_, _ = w.Write(body)
		}
	}
}

func contentHandler(path string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		switch r.Method {
		case http.MethodGet:
			contents, err := os.ReadFile(path)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "could not read game data: "+err.Error())
				return
			}
			if _, err := decodeAndValidate(contents); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			_, _ = w.Write(contents)
		case http.MethodPut:
			if r.Body == nil {
				writeError(w, http.StatusBadRequest, "request body is empty")
				return
			}
			body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 2<<20))
			if err != nil {
				writeError(w, http.StatusBadRequest, "could not read request body: "+err.Error())
				return
			}
			data, err := decodeAndValidate(body)
			if err != nil {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}
			encoded, err := json.MarshalIndent(data, "", "  ")
			if err != nil {
				writeError(w, http.StatusInternalServerError, "could not format game data")
				return
			}
			encoded = append(encoded, '\n')
			if err := writeAtomically(path, encoded); err != nil {
				writeError(w, http.StatusInternalServerError, "could not save game data: "+err.Error())
				return
			}
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"saved":true}`))
		default:
			w.Header().Set("Allow", "GET, PUT")
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
	}
}

func decodeAndValidate(raw []byte) (*gameContent, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	var data gameContent
	if err := decoder.Decode(&data); err != nil {
		return nil, fmt.Errorf("invalid JSON game data: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, errors.New("game data must contain one JSON object")
	}
	if data.SchemaVersion != 1 {
		return nil, errors.New("unsupported game data schema version")
	}
	if data.Items == nil || len(data.Days) == 0 {
		return nil, errors.New("game data needs at least one item and one event")
	}
	for key, item := range data.Items {
		if strings.TrimSpace(key) == "" || strings.TrimSpace(item.Name) == "" {
			return nil, errors.New("every item needs a key and display name")
		}
		if len(item.Shape) == 0 {
			return nil, fmt.Errorf("item %q needs at least one occupied cell", key)
		}
		seen := make(map[[2]int]bool, len(item.Shape))
		for _, cell := range item.Shape {
			if cell[0] < 0 || cell[0] > 7 || cell[1] < 0 || cell[1] > 9 {
				return nil, fmt.Errorf("item %q has a cell outside the 8 by 10 editor grid", key)
			}
			if seen[cell] {
				return nil, fmt.Errorf("item %q repeats a grid cell", key)
			}
			seen[cell] = true
		}
		if item.Color < 0 || item.Color > 0xFFFFFF {
			return nil, fmt.Errorf("item %q has an invalid color", key)
		}
		if item.Sprite != "" && (!strings.HasPrefix(item.Sprite, "assets/items/") || filepath.Base(item.Sprite) != strings.TrimPrefix(item.Sprite, "assets/items/")) {
			return nil, fmt.Errorf("item %q has an invalid sprite path", key)
		}
	}
	for _, key := range data.StartingItems {
		if _, ok := data.Items[key]; !ok {
			return nil, fmt.Errorf("starting inventory refers to missing item %q", key)
		}
	}
	for index, day := range data.Days {
		if day.Day != index+1 {
			return nil, errors.New("event day numbers must be consecutive and start at 1")
		}
		if len(day.Triggers) == 0 {
			return nil, fmt.Errorf("day %d needs at least one outcome path", day.Day)
		}
		for _, outcome := range day.Triggers {
			for _, key := range outcome.WantItems {
				if _, ok := data.Items[key]; !ok {
					return nil, fmt.Errorf("day %d requires missing item %q", day.Day, key)
				}
			}
			for _, key := range outcome.ConsumeItems {
				if _, ok := data.Items[key]; !ok {
					return nil, fmt.Errorf("day %d consumes missing item %q", day.Day, key)
				}
			}
			if outcome.ReceiveItem != "" {
				if _, ok := data.Items[outcome.ReceiveItem]; !ok {
					return nil, fmt.Errorf("day %d rewards missing item %q", day.Day, outcome.ReceiveItem)
				}
			}
		}
	}
	return &data, nil
}

func spriteHandler(assetsDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST")
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		key := r.URL.Query().Get("item")
		if len(key) == 0 || len(key) > 64 || strings.Trim(key, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-") != "" {
			writeError(w, http.StatusBadRequest, "invalid item key")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
		if err := r.ParseMultipartForm(2 << 20); err != nil {
			writeError(w, http.StatusBadRequest, "sprite must be a PNG no larger than 2 MB")
			return
		}
		file, _, err := r.FormFile("sprite")
		if err != nil {
			writeError(w, http.StatusBadRequest, "choose a PNG sprite to upload")
			return
		}
		defer file.Close()
		contents, err := io.ReadAll(io.LimitReader(file, (2<<20)+1))
		if err != nil || len(contents) > 2<<20 {
			writeError(w, http.StatusBadRequest, "sprite must be no larger than 2 MB")
			return
		}
		config, err := png.DecodeConfig(bytes.NewReader(contents))
		if err != nil || config.Width < 1 || config.Height < 1 || config.Width > 512 || config.Height > 512 {
			writeError(w, http.StatusBadRequest, "sprite must be a valid PNG no larger than 512 × 512 pixels")
			return
		}
		if _, err := png.Decode(bytes.NewReader(contents)); err != nil {
			writeError(w, http.StatusBadRequest, "sprite PNG could not be decoded")
			return
		}
		digest := sha256.Sum256(contents)
		filename := fmt.Sprintf("%s-%x.png", key, digest[:6])
		path := filepath.Join(assetsDir, filename)
		if err := writeAtomically(path, contents); err != nil {
			writeError(w, http.StatusInternalServerError, "could not save sprite: "+err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string]string{"sprite": "assets/items/" + filename})
	}
}

func spriteFileHandler(assetsDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		filename := strings.TrimPrefix(r.URL.Path, "/assets/items/")
		if filename == "" || filepath.Base(filename) != filename || filepath.Ext(filename) != ".png" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, filepath.Join(assetsDir, filename))
	}
}

func bundleHandler(dataPath, projectRoot string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		contents, err := os.ReadFile(dataPath)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not read game data")
			return
		}
		data, err := decodeAndValidate(contents)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		var buffer bytes.Buffer
		archive := zip.NewWriter(&buffer)
		addFile := func(name string, body []byte) error {
			entry, err := archive.Create(name)
			if err != nil {
				return err
			}
			_, err = entry.Write(body)
			return err
		}
		if err := addFile("data/game-content.json", contents); err != nil {
			writeError(w, http.StatusInternalServerError, "could not create bundle")
			return
		}
		seen := map[string]bool{}
		for _, definition := range data.Items {
			if definition.Sprite == "" || seen[definition.Sprite] {
				continue
			}
			seen[definition.Sprite] = true
			filename := strings.TrimPrefix(definition.Sprite, "assets/items/")
			image, err := os.ReadFile(filepath.Join(projectRoot, "assets", "items", filename))
			if err != nil {
				_ = archive.Close()
				writeError(w, http.StatusBadRequest, "missing sprite file: "+filename)
				return
			}
			if err := addFile(definition.Sprite, image); err != nil {
				_ = archive.Close()
				writeError(w, http.StatusInternalServerError, "could not create bundle")
				return
			}
		}
		if err := archive.Close(); err != nil {
			writeError(w, http.StatusInternalServerError, "could not finish bundle")
			return
		}
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", `attachment; filename="game-content-bundle.zip"`)
		_, _ = w.Write(buffer.Bytes())
	}
}

func writeAtomically(path string, content []byte) error {
	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(directory, ".game-content-*.tmp")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if _, err := temporary.Write(content); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return os.Rename(temporaryPath, path)
}

func localOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if host != "localhost" && !strings.HasPrefix(host, "localhost:") && !strings.HasPrefix(host, "127.0.0.1:") && host != "127.0.0.1" {
			http.Error(w, "local editor only", http.StatusForbidden)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" {
			parsed, err := url.Parse(origin)
			if err != nil || parsed.Host != r.Host || parsed.Scheme != "http" {
				http.Error(w, "cross-origin request denied", http.StatusForbidden)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func openBrowser(address string) error {
	var command *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		command = exec.Command("rundll32", "url.dll,FileProtocolHandler", address)
	case "darwin":
		command = exec.Command("open", address)
	default:
		command = exec.Command("xdg-open", address)
	}
	return command.Start()
}
