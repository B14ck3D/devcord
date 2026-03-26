package devcordapi

import (
	"encoding/json"
	"net/http"
	"strconv"
)

func jsonWrite(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func jsonErr(w http.ResponseWriter, status int, msg string) {
	jsonWrite(w, status, map[string]string{"error": msg})
}

func parseInt64(s string) (int64, error) {
	return strconv.ParseInt(s, 10, 64)
}
