package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"log/slog"
	"math/rand"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/akennis/dagor"
	"github.com/akennis/dagor/graph"
	"github.com/akennis/dagor/operator"
	"github.com/akennis/dagor/reporter"
	sparsi "github.com/akennis/sparsi-go/library"
	"github.com/akennis/dagor/config"
	builtin "github.com/akennis/dagor/operator/builtin"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/panjf2000/ants/v2"
)

type UserInput struct {
	LibraryPath string `json:"library_path" jsonschema:"Absolute path to playnite_export.json; required"`
}

type Result struct {
	GameID   string `json:"game_id"`
	GameName string `json:"game_name"`
	Pitch    string `json:"pitch"`
}

type ctxKey string

const (
	libraryPathKey ctxKey = "library_path"
)

// --- Custom Ops ---

type ParsePlayniteLibraryOp struct {
	JSON               *string `dag:"input"`
	CategorizedGamesList string  `dag:"output"`
}

func (o *ParsePlayniteLibraryOp) Setup(p *config.Params) error { return nil }
func (o *ParsePlayniteLibraryOp) Reset() error                 { return nil }
func (o *ParsePlayniteLibraryOp) Run(ctx context.Context) error {
	if o.JSON == nil {
		return fmt.Errorf("JSON input is nil")
	}

	type PlayniteGame struct {
		IsInstalled  bool    `json:"isInstalled"`
		Name         string  `json:"name"`
		ID           string  `json:"id"`
		Playtime     float64 `json:"Playtime"`
		LastActivity any     `json:"LastActivity"`
	}

	var games []PlayniteGame
	b := []byte(*o.JSON)
	if len(b) >= 3 && b[0] == 0xef && b[1] == 0xbb && b[2] == 0xbf {
		b = b[3:]
	}
	if err := json.Unmarshal(b, &games); err != nil {
		return fmt.Errorf("failed to unmarshal playnite json: %w", err)
	}

	var installed []PlayniteGame
	for _, g := range games {
		// Accept if installed. Or if none are installed, we'll fall back later.
		if g.IsInstalled {
			installed = append(installed, g)
		}
	}

	if len(installed) == 0 {
		installed = games // fallback
	}

	var played []PlayniteGame
	var unplayed []PlayniteGame

	for _, g := range installed {
		if g.Playtime > 0 {
			played = append(played, g)
		} else {
			unplayed = append(unplayed, g)
		}
	}

	// 1. Top 10 Most Played
	mostPlayed := make([]PlayniteGame, len(played))
	copy(mostPlayed, played)
	sort.Slice(mostPlayed, func(i, j int) bool {
		return mostPlayed[i].Playtime > mostPlayed[j].Playtime
	})
	if len(mostPlayed) > 10 {
		mostPlayed = mostPlayed[:10]
	}

	// 2. Top 10 Recently Played
	recent := make([]PlayniteGame, len(played))
	copy(recent, played)
	sort.Slice(recent, func(i, j int) bool {
		// String comparison for dates usually works for ISO8601
		si := fmt.Sprintf("%v", recent[i].LastActivity)
		sj := fmt.Sprintf("%v", recent[j].LastActivity)
		return si > sj
	})
	if len(recent) > 10 {
		recent = recent[:10]
	}

	// 3. 10 Random Unplayed
	rand.Seed(time.Now().UnixNano())
	rand.Shuffle(len(unplayed), func(i, j int) { unplayed[i], unplayed[j] = unplayed[j], unplayed[i] })
	if len(unplayed) > 10 {
		unplayed = unplayed[:10]
	}

	var out strings.Builder
	out.WriteString("--- TOP 10 MOST PLAYED ---\n")
	for _, g := range mostPlayed {
		out.WriteString(fmt.Sprintf("ID: %s | Name: %s | Playtime: %.1f hours\n", g.ID, g.Name, g.Playtime/3600.0))
	}

	out.WriteString("\n--- TOP 10 RECENTLY PLAYED ---\n")
	for _, g := range recent {
		out.WriteString(fmt.Sprintf("ID: %s | Name: %s | LastActivity: %v\n", g.ID, g.Name, g.LastActivity))
	}

	out.WriteString("\n--- 10 RANDOM UNPLAYED (BACKLOG) ---\n")
	for _, g := range unplayed {
		out.WriteString(fmt.Sprintf("ID: %s | Name: %s\n", g.ID, g.Name))
	}

	o.CategorizedGamesList = out.String()
	return nil
}
func (o *ParsePlayniteLibraryOp) InputFields() map[string]any  { return map[string]any{"JSON": &o.JSON} }
func (o *ParsePlayniteLibraryOp) OutputFields() map[string]any { return map[string]any{"CategorizedGamesList": &o.CategorizedGamesList} }
func (o *ParsePlayniteLibraryOp) SetInputField(f string, v any) error {
	if f == "JSON" {
		o.JSON = v.(*string)
		return nil
	}
	return fmt.Errorf("unknown input %s", f)
}
func (o *ParsePlayniteLibraryOp) ResetFields() { o.JSON = nil; o.CategorizedGamesList = "" }

func init() {
	operator.RegisterOp[ParsePlayniteLibraryOp]()
}

type ParseRecommendationOp struct {
	JSON     *string `dag:"input"`
	GameID   string  `dag:"output"`
	GameName string  `dag:"output"`
	Pitch    string  `dag:"output"`
}

func (o *ParseRecommendationOp) Setup(p *config.Params) error { return nil }
func (o *ParseRecommendationOp) Reset() error                 { return nil }
func (o *ParseRecommendationOp) Run(ctx context.Context) error {
	if o.JSON == nil {
		return fmt.Errorf("JSON is nil")
	}

	var data struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Pitch string `json:"pitch"`
	}

	clean := strings.TrimSpace(*o.JSON)
	if strings.HasPrefix(clean, "```json") {
		clean = strings.TrimPrefix(clean, "```json")
		clean = strings.TrimSuffix(clean, "```")
	} else if strings.HasPrefix(clean, "```") {
		clean = strings.TrimPrefix(clean, "```")
		clean = strings.TrimSuffix(clean, "```")
	}

	if err := json.Unmarshal([]byte(clean), &data); err != nil {
		return fmt.Errorf("failed to unmarshal AI response: %w\nResponse was: %s", err, clean)
	}

	o.GameID = data.ID
	o.GameName = data.Name
	o.Pitch = data.Pitch
	return nil
}
func (o *ParseRecommendationOp) InputFields() map[string]any  { return map[string]any{"JSON": &o.JSON} }
func (o *ParseRecommendationOp) OutputFields() map[string]any { return map[string]any{"GameID": &o.GameID, "GameName": &o.GameName, "Pitch": &o.Pitch} }
func (o *ParseRecommendationOp) SetInputField(f string, v any) error {
	if f == "JSON" {
		o.JSON = v.(*string)
		return nil
	}
	return fmt.Errorf("unknown input %s", f)
}
func (o *ParseRecommendationOp) ResetFields() {
	o.JSON = nil
	o.GameID = ""
	o.GameName = ""
	o.Pitch = ""
}

func init() {
	operator.RegisterOp[ParseRecommendationOp]()
	operator.RegisterOpFactory("LibraryPathOp", builtin.ContextValFactory[string](libraryPathKey))
}

type SuggestGameOp struct{ sparsi.AIComputeStringToStringOp }

func init() { operator.RegisterOp[SuggestGameOp]() }

// --- Graph Building ---

func buildGraph() (*graph.Graph, error) {
	b := graph.NewBuilder("suggest-game")

	b.Vertex("library_path").Op("LibraryPathOp").Output("Result", "library_path")

	b.Vertex("read_library").Op("FileReadOp").
		Input("Path", "library_path").
		Output("Content", "raw_json")

	b.Vertex("parse_library").Op("ParsePlayniteLibraryOp").
		Input("JSON", "raw_json").
		Output("CategorizedGamesList", "categorized_games_list")

	b.Vertex("suggest_game").Op("SuggestGameOp").
		Params(map[string]string{
			"operation": "You are an expert game recommender. Review this user's categorized library data. Use your knowledge of typical game completion times to AVOID suggesting games where the user's Playtime indicates they have likely already finished it (unless it is a highly replayable multiplayer game). Intelligently select ONE game for them to play today. Write a short 1-sentence description of the game for the 'pitch' field. Output ONLY a raw JSON object with keys 'id', 'name', and 'pitch'.",
			"provider":  "gemini",
			"model":     "gemini-3.5-flash",
		}).
		Input("Input", "categorized_games_list").
		Output("Result", "suggestion_json")

	b.Vertex("parse_suggestion").Op("ParseRecommendationOp").
		Input("JSON", "suggestion_json").
		Output("GameID", "game_id").
		Output("GameName", "game_name").
		Output("Pitch", "pitch")

	return b.Build()
}

// --- Execution ---

func runWorkflow(ctx context.Context, pool *ants.Pool, in UserInput) (Result, error) {
	g, err := buildGraph()
	if err != nil {
		return Result{}, fmt.Errorf("build graph: %w", err)
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	reporter := reporter.New(logger)
	eng, err := dagor.NewEngine(g, pool, dagor.WithReporter(reporter))
	if err != nil {
		return Result{}, fmt.Errorf("create engine: %w", err)
	}

	ctx = context.WithValue(ctx, libraryPathKey, in.LibraryPath)

	if err := eng.Run(ctx); err != nil {
		return Result{}, fmt.Errorf("run graph: %w", err)
	}

	var out Result
	if v, ok := eng.GetOutput("game_id"); ok {
		if p, ok := v.(*string); ok && p != nil {
			out.GameID = *p
		}
	}
	if v, ok := eng.GetOutput("game_name"); ok {
		if p, ok := v.(*string); ok && p != nil {
			out.GameName = *p
		}
	}
	if v, ok := eng.GetOutput("pitch"); ok {
		if p, ok := v.(*string); ok && p != nil {
			out.Pitch = *p
		}
	}

	return out, nil
}

func runMCPServer(pool *ants.Pool) {
	server := mcp.NewServer(&mcp.Implementation{
		Name:    "suggest-game",
		Version: "1.0.0",
	}, nil)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "suggest_game",
		Description: "Suggests a single game to play next by intelligently analyzing the user's most played, recently played, and unplayed games.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in UserInput) (*mcp.CallToolResult, Result, error) {
		if in.LibraryPath == "" {
			return nil, Result{}, fmt.Errorf("library_path is required")
		}
		res, err := runWorkflow(ctx, pool, in)
		if err != nil {
			return nil, Result{}, err
		}
		return nil, res, nil
	})

	if err := server.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("mcp server: %v", err)
	}
}

func main() {
	mcpMode := flag.Bool("mcp", false, "run as a stdio MCP server instead of a one-shot CLI")
	libraryPath := flag.String("library_path", "", "Absolute path to playnite_export.json (CLI mode)")
	verbose := flag.Bool("v", false, "enable verbose logging")
	flag.Parse()

	logLevel := slog.LevelInfo
	if *verbose {
		logLevel = slog.LevelDebug
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: logLevel})))

	pool, err := ants.NewPool(10)
	if err != nil {
		log.Fatalf("create pool: %v", err)
	}
	defer pool.Release()

	if *mcpMode {
		runMCPServer(pool)
		return
	}

	in := UserInput{LibraryPath: *libraryPath}
	if in.LibraryPath == "" {
		log.Fatal("library_path is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	res, err := runWorkflow(ctx, pool, in)
	if err != nil {
		log.Fatalf("workflow: %v", err)
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(res); err != nil {
		log.Fatalf("encode output: %v", err)
	}
}
