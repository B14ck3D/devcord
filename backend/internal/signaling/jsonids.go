package signaling

import (
	"encoding/json"
	"fmt"
	"strconv"
)

// unstructuredIDToString normalizes JSON user_id / room_id / target_user_id (string lub number).
func unstructuredIDToString(v interface{}) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return x
	case float64:
		return strconv.FormatInt(int64(x), 10)
	case json.Number:
		return string(x)
	default:
		return fmt.Sprint(x)
	}
}
