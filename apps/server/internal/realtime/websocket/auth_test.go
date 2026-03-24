package websocket

import "testing"

func TestTokenFromSubprotocol(t *testing.T) {
	token := tokenFromSubprotocol("catwa.v1, access_token.abc.def.ghi")
	if token != "abc.def.ghi" {
		t.Fatalf("unexpected token %q", token)
	}
}

func TestTokenFromSubprotocolMissing(t *testing.T) {
	if token := tokenFromSubprotocol("catwa.v1"); token != "" {
		t.Fatalf("expected empty token, got %q", token)
	}
}
