import { nativeDesktopFetch } from "./desktopBridge";
import { isTauriDesktop } from "./runtime";

function encodeBodyBase64(body: BodyInit | null | undefined): string | null {
  if (!body) {
    return null;
  }

  if (typeof body === "string") {
    if (typeof TextEncoder === "undefined") {
      return btoa(unescape(encodeURIComponent(body)));
    }
    const bytes = new TextEncoder().encode(body);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  if (ArrayBuffer.isView(body)) {
    const bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  if (body instanceof ArrayBuffer) {
    const bytes = new Uint8Array(body);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  return null;
}

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64 || "");
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function normalizeHeaders(headers?: HeadersInit): Headers {
  if (headers instanceof Headers) {
    return headers;
  }
  return new Headers(headers ?? {});
}

export const httpFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
  if (isTauriDesktop()) {
    const headers = normalizeHeaders(init.headers);
    const bodyBase64 = encodeBodyBase64(init.body);
    if (!init.body || bodyBase64 !== null) {
      const nativeResponse = await nativeDesktopFetch({
        url,
        method: (init.method ?? "GET").toUpperCase(),
        headers: Object.fromEntries(headers.entries()),
        ...(bodyBase64 ? { bodyBase64 } : {})
      });

      if (nativeResponse) {
        const body = decodeBase64ToArrayBuffer(nativeResponse.bodyBase64);
        return new Response(body, {
          status: nativeResponse.status,
          statusText: nativeResponse.statusText,
          headers: nativeResponse.headers
        });
      }
    }
  }

  return fetch(url, init);
};
