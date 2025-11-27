package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"time"
)

// --- CONFIGURATION ---
const API_KEY = "sk-d54b8e081f874934a0721dbf297921af" // <--- PASTE KEY HERE
const LLM_URL = "https://api.deepseek.com/chat/completions"

type AlertRequest struct {
	UserID   string `json:"user_id"`
	Event    string `json:"event"`
	Duration int    `json:"duration_seconds"`
}

type AlertResponse struct {
	Message string `json:"message"`
}

// Struct for DeepSeek API
type DeepSeekRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
}
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Middleware to force CORS on every request
func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fmt.Printf("🔔 Request: %s %s\n", r.Method, r.URL.Path)

		// 1. Set Headers explicitly
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")

		// 2. Handle Preflight (OPTIONS)
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// 3. Call the actual handler
		next(w, r)
	}
}

func main() {
	// Wrap the handler with CORS middleware
	http.HandleFunc("/api/alert", corsMiddleware(handleAlert))
	
	fmt.Println("LISA Backend is running on http://localhost:8081")
	// Bind to 0.0.0.0 to ensure it listens on all interfaces (localhost and 127.0.0.1)
	err := http.ListenAndServe("0.0.0.0:8081", nil)
	if err != nil {
		fmt.Println("CRITICAL ERROR:", err)
	}
}

func handleAlert(w http.ResponseWriter, r *http.Request) {
	var req AlertRequest
	// Decode JSON
	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	
	fmt.Printf("✅ RECEIVED! User sat for %d seconds\n", req.Duration)

	// Call AI
	llmResponse := callDeepSeek(req.Duration)
	fmt.Println("🤖 AI Says:", llmResponse)

	// Send Response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AlertResponse{Message: llmResponse})
}

func callDeepSeek(duration int) string {
	prompt := fmt.Sprintf("The user has been sitting still for %d seconds. Write a creative, varied, and very short (max 15 words) warning to get them moving. Don't be boring.", duration)

	requestBody := DeepSeekRequest{
		Model: "deepseek-chat",
		Messages: []Message{
			{Role: "system", Content: "You are a helpful assistant."},
			{Role: "user", Content: prompt},
		},
	}
	jsonData, _ := json.Marshal(requestBody)

	req, _ := http.NewRequest("POST", LLM_URL, bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+API_KEY)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "Error calling AI: " + err.Error()
	}
	defer resp.Body.Close()

	body, _ := ioutil.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)

	if choices, ok := result["choices"].([]interface{}); ok && len(choices) > 0 {
		choice := choices[0].(map[string]interface{})
		message := choice["message"].(map[string]interface{})
		return message["content"].(string)
	}
	return "Take a break! (AI Connection issue)"
}