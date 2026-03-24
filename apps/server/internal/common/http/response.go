package httpx

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

type ErrorResponse struct {
	Error   string      `json:"error"`
	Details interface{} `json:"details,omitempty"`
}

func JSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if payload == nil {
		return
	}
	encoder := json.NewEncoder(w)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(payload)
}

func Error(w http.ResponseWriter, status int, message string) {
	JSON(w, status, ErrorResponse{Error: message})
}

func ValidationError(w http.ResponseWriter, details map[string]string) {
	JSON(w, http.StatusBadRequest, ErrorResponse{Error: "validation_failed", Details: details})
}

func DecodeJSON(r *http.Request, dst interface{}, maxBytes int64) error {
	defer r.Body.Close()

	body, err := io.ReadAll(io.LimitReader(r.Body, maxBytes+1))
	if err != nil {
		return errors.New("failed to read request body")
	}
	if int64(len(body)) > maxBytes {
		return errors.New("request body too large")
	}

	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(dst); err != nil {
		var syntaxErr *json.SyntaxError
		var typeErr *json.UnmarshalTypeError
		if errors.Is(err, io.EOF) {
			return errors.New("request body cannot be empty")
		}
		if errors.As(err, &syntaxErr) || errors.As(err, &typeErr) {
			return errors.New("invalid json body")
		}
		if errors.Is(err, io.ErrUnexpectedEOF) {
			return errors.New("malformed json body")
		}
		return err
	}

	if decoder.More() {
		return errors.New("request body must contain a single json object")
	}

	return nil
}
