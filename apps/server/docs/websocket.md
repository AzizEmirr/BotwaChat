# WebSocket Realtime Gateway

Endpoint: `GET /ws`

Auth:
- Access token required
- Preferred: `Sec-WebSocket-Protocol: catwa.v1, access_token.<JWT_ACCESS_TOKEN>`
- Alternative: `Authorization: Bearer <token>` header (non-browser clients)

Auth başarısız olursa gateway `401` döner ve upgrade reddedilir.

## Connection Lifecycle
- Bağlantıda socket otomatik `user:<userId>` room'una katılır.
- Sunucu `info` frame gönderir:
  - `connectionId`
  - `userId`
  - `heartbeatIntervalMs`
  - `reconnectAfterMs`
- Sunucu `WS_HEARTBEAT_INTERVAL` ile ping gönderir.
- Client pong dönmelidir (çoğu WS client bunu otomatik yapar).
- Access token süresi dolunca sunucu bağlantıyı `4001` close code ile kapatır.
- Bağlantı kopunca `reconnectAfterMs` sonrası reconnect + room re-subscribe önerilir.

## Client -> Server Actions
Frame format:

```json
{
  "action": "subscribe",
  "requestId": "req-1",
  "room": "channel:<channel-uuid>",
  "data": {}
}
```

Desteklenen action'lar:
- `subscribe`
- `unsubscribe`
- `typing.start`
- `typing.stop`
- `voice.join`
- `voice.leave`
- `voice.mute`
- `voice.unmute`
- `voice.speaking.start`
- `voice.speaking.stop`
- `ping`

Typing payload:

```json
{
  "conversationType": "channel",
  "conversationId": "<uuid>"
}
```

Voice join payload:

```json
{
  "channelId": "<voice-channel-uuid>"
}
```

Voice speaking payload:

```json
{
  "channelId": "<voice-channel-uuid>"
}
```

## Server -> Client Frames
- `ack`: action başarılı
- `error`: action reddedildi
- `info`: bağlantı metadata
- `event`: realtime event envelope

Event envelope:

```json
{
  "type": "event",
  "event": {
    "id": "uuid",
    "type": "message.created",
    "room": "channel:<uuid>",
    "senderId": "uuid",
    "occurredAt": "2026-03-11T20:00:00Z",
    "payload": {}
  }
}
```

`voice.join` ack data:

```json
{
  "channel": {
    "id": "uuid",
    "workspaceId": "uuid",
    "workspaceName": "Catwa Sunucusu",
    "name": "Genel Ses",
    "maxParticipants": 10,
    "participantCount": 2,
    "createdAt": "2026-03-11T20:00:00Z",
    "participants": []
  },
  "state": {
    "channelId": "uuid",
    "muted": false,
    "deafened": false,
    "joinedAt": "2026-03-11T20:00:00Z"
  },
  "liveKit": {
    "url": "ws://localhost:7880",
    "roomName": "catwa-voice-<channel-uuid>",
    "token": "<jwt>"
  }
}
```

## Room Model
Desteklenen room'lar:
- `channel:<channelId>`
- `dm:<conversationId>`
- `server:<serverId>`
- `user:<userId>`
- `voice:<voiceChannelId>`

Yetki kuralları:
- `channel:*`: kullanıcı channel'ın bağlı olduğu server üyesi olmalı
- `dm:*`: kullanıcı direct conversation üyesi olmalı
- `server:*`: kullanıcı server üyesi olmalı
- `user:*`: yalnızca room sahibi (`userId == token.sub`)
- `voice:*`: kullanıcı voice channel'ın bağlı olduğu workspace üyesi olmalı

Yetkisiz subscription denemesi reddedilir.

## Event Types
- `message.created`
- `dm.created`
- `channel.created`
- `user.presence.updated`
- `user.typing.started`
- `user.typing.stopped`
- `voice.join`
- `voice.leave`
- `voice.mute`
- `voice.unmute`
- `voice.speaking.start`
- `voice.speaking.stop`
- `voice.channel.created`

## Presence
- Presence verisi `presence_states` tablosunda tutulur.
- İlk aktif socket -> `online`
- Son socket disconnect -> `offline` + `last_seen_at` güncellenir.

## Voice
- Voice channel state `voice_states` tablosunda tutulur.
- `voice.join` sırasında:
  - membership kontrol edilir
  - kapasite kontrolü yapılır
  - LiveKit room hazırlanır
  - kullanıcıya LiveKit token üretilir
  - state DB'ye yazılır
- `voice.leave` state'i temizler.
- `voice.mute` / `voice.unmute` state'i günceller.
- `voice.speaking.start/stop` eventleri room'a broadcast edilir.

## LISTEN/NOTIFY
- Publish: servisler `pg_notify(WS_NOTIFY_CHANNEL, payload)` ile event yollar.
- Subscribe: startup subscriber `LISTEN WS_NOTIFY_CHANNEL` ile event alır.
- Gelen eventler in-memory room manager üzerinden ilgili room'lara dağıtılır.
