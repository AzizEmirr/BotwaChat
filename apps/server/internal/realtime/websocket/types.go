package websocket

import (
	"encoding/json"

	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/events"
	gws "github.com/gorilla/websocket"
)

type Client struct {
	ID     string
	UserID string
	Conn   *gws.Conn
	Send   chan []byte
	rooms  map[string]struct{}
}

func NewClient(id, userID string, conn *gws.Conn, queueSize int) *Client {
	return &Client{
		ID:     id,
		UserID: userID,
		Conn:   conn,
		Send:   make(chan []byte, queueSize),
		rooms:  make(map[string]struct{}),
	}
}

type Outbound struct {
	Type      string           `json:"type"`
	Event     *events.Envelope `json:"event,omitempty"`
	RequestID string           `json:"requestId,omitempty"`
	Error     string           `json:"error,omitempty"`
	Data      json.RawMessage  `json:"data,omitempty"`
}

type Incoming struct {
	Action    string          `json:"action"`
	RequestID string          `json:"requestId,omitempty"`
	Room      string          `json:"room,omitempty"`
	Data      json.RawMessage `json:"data,omitempty"`
}

func MarshalEvent(event events.Envelope) ([]byte, error) {
	msg := Outbound{
		Type:  "event",
		Event: &event,
	}
	return json.Marshal(msg)
}

func MarshalAck(requestID string, data interface{}) ([]byte, error) {
	var payload json.RawMessage
	if data != nil {
		encoded, err := json.Marshal(data)
		if err != nil {
			return nil, err
		}
		payload = encoded
	}

	msg := Outbound{
		Type:      "ack",
		RequestID: requestID,
		Data:      payload,
	}
	return json.Marshal(msg)
}

func MarshalError(requestID, message string) ([]byte, error) {
	msg := Outbound{
		Type:      "error",
		RequestID: requestID,
		Error:     message,
	}
	return json.Marshal(msg)
}

func MarshalInfo(data interface{}) ([]byte, error) {
	encoded, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}

	msg := Outbound{
		Type: "info",
		Data: encoded,
	}
	return json.Marshal(msg)
}
