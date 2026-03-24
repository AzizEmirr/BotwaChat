#!/usr/bin/env node

const API_BASE = process.env.API_BASE ?? "http://127.0.0.1:8091";
const SMOKE_LOGIN = process.env.SMOKE_LOGIN ?? "";
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD ?? "";

let accessToken = "";
let refreshToken = "";

const results = [];

function nowId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function logStep(message) {
  process.stdout.write(`${message}\n`);
}

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  logStep(`PASS ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  logStep(`FAIL ${name}${detail ? ` - ${detail}` : ""}`);
}

async function request(path, options = {}, { auth = true } = {}) {
  const headers = new Headers(options.headers ?? {});
  headers.set("Accept", "application/json");
  if (auth && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  let body = null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await res.json().catch(() => null);
  } else {
    const text = await res.text().catch(() => "");
    body = text ? { text } : null;
  }

  return { res, body };
}

function expectStatus(name, actual, accepted, body) {
  if (accepted.includes(actual)) {
    pass(name, `status=${actual}`);
    return true;
  }
  fail(name, `status=${actual}, expected=${accepted.join(",")}, body=${JSON.stringify(body)}`);
  return false;
}

async function ensureLogin() {
  const { res, body } = await request(
    "/api/v1/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        emailOrUsername: SMOKE_LOGIN,
        password: SMOKE_PASSWORD
      })
    },
    { auth: false }
  );
  if (!expectStatus("auth.login", res.status, [200], body)) {
    return false;
  }
  accessToken = body?.tokens?.accessToken ?? "";
  refreshToken = body?.tokens?.refreshToken ?? "";
  if (!accessToken || !refreshToken) {
    fail("auth.tokens", "access/refresh token missing in login response");
    return false;
  }
  pass("auth.tokens", "access+refresh alındı");
  return true;
}

async function findOrCreateFriendUser() {
  let friend = null;

  const search = await request("/api/v1/users/search?q=friend&limit=20");
  if (expectStatus("users.search(friend)", search.res.status, [200], search.body)) {
    friend = (search.body?.users ?? []).find((u) => u.username === "friend") ?? search.body?.users?.[0] ?? null;
  }

  if (friend) {
    pass("users.friend.resolve", `userId=${friend.id}`);
    return friend;
  }

  const email = `${nowId("friend")}@catwa.local`;
  const username = nowId("friend");
  const register = await request(
    "/api/v1/auth/register",
    {
      method: "POST",
      body: JSON.stringify({
        email,
        username,
        password: "TempUserPass123!"
      })
    },
    { auth: false }
  );

  if (!expectStatus("auth.register(friend-fallback)", register.res.status, [201, 409], register.body)) {
    return null;
  }

  const searchFallback = await request(`/api/v1/users/search?q=${encodeURIComponent(username.slice(0, 6))}&limit=20`);
  if (!expectStatus("users.search(friend-fallback)", searchFallback.res.status, [200], searchFallback.body)) {
    return null;
  }

  friend = (searchFallback.body?.users ?? []).find((u) => u.username === username) ?? searchFallback.body?.users?.[0] ?? null;
  if (!friend) {
    fail("users.friend.resolve", "friend user bulunamadı");
    return null;
  }
  pass("users.friend.resolve", `userId=${friend.id}`);
  return friend;
}

async function run() {
  logStep(`API smoke test base: ${API_BASE}`);

  if (!SMOKE_LOGIN || !SMOKE_PASSWORD) {
    fail("auth.login.config", "SMOKE_LOGIN ve SMOKE_PASSWORD ortam değişkenleri zorunlu.");
    summarizeAndExit();
    return;
  }

  if (!(await ensureLogin())) {
    summarizeAndExit();
    return;
  }

  const me = await request("/api/v1/users/me");
  expectStatus("users.me", me.res.status, [200], me.body);
  const selfUserId = me.body?.id ?? "";

  const friend = await findOrCreateFriendUser();
  if (!friend || friend.id === selfUserId) {
    fail("friend.user", "uygun ikinci kullanıcı bulunamadı");
    summarizeAndExit();
    return;
  }

  const dmsList1 = await request("/api/v1/dms");
  expectStatus("dms.list(initial)", dmsList1.res.status, [200], dmsList1.body);

  const createDM = await request("/api/v1/dms", {
    method: "POST",
    body: JSON.stringify({ userId: friend.id })
  });
  expectStatus("dms.create", createDM.res.status, [200, 201], createDM.body);
  const dmConversationId = createDM.body?.conversationId;

  const dmsList2 = await request("/api/v1/dms");
  expectStatus("dms.list(after-create)", dmsList2.res.status, [200], dmsList2.body);
  const resolvedConversationId =
    dmConversationId ||
    (dmsList2.body?.conversations ?? []).find((c) => c.otherUserId === friend.id)?.conversationId ||
    null;

  if (!resolvedConversationId) {
    fail("dms.resolveConversation", "conversationId bulunamadı");
    summarizeAndExit();
    return;
  }
  pass("dms.resolveConversation", resolvedConversationId);

  const dmMessagesBefore = await request(
    `/api/v1/messages?conversation_type=dm&conversation_id=${encodeURIComponent(resolvedConversationId)}&limit=20`
  );
  expectStatus("messages.list(dm)", dmMessagesBefore.res.status, [200], dmMessagesBefore.body);

  const sendDm = await request("/api/v1/messages", {
    method: "POST",
    body: JSON.stringify({
      conversationType: "dm",
      conversationId: resolvedConversationId,
      content: `smoke-test-dm-${Date.now()}`
    })
  });
  expectStatus("messages.send(dm)", sendDm.res.status, [201], sendDm.body);
  const dmMessageId = sendDm.body?.id;

  if (dmMessageId) {
    const editDm = await request(`/api/v1/messages/${encodeURIComponent(dmMessageId)}`, {
      method: "PATCH",
      body: JSON.stringify({ content: `smoke-test-dm-edited-${Date.now()}` })
    });
    expectStatus("messages.edit(dm)", editDm.res.status, [200], editDm.body);

    const deleteDm = await request(`/api/v1/messages/${encodeURIComponent(dmMessageId)}`, {
      method: "DELETE"
    });
    expectStatus("messages.delete(dm)", deleteDm.res.status, [200], deleteDm.body);
  } else {
    fail("messages.dm.id", "send response message id yok");
  }

  const friendsList = await request("/api/v1/friends");
  expectStatus("friends.list", friendsList.res.status, [200], friendsList.body);

  const reqList = await request("/api/v1/friends/requests");
  expectStatus("friends.requests.list", reqList.res.status, [200], reqList.body);

  const privacyGet = await request("/api/v1/friends/privacy");
  expectStatus("friends.privacy.get", privacyGet.res.status, [200], privacyGet.body);

  const currentPrivacy = privacyGet.body?.settings ?? {};
  const toggleValue = !(currentPrivacy.allowEveryone ?? true);
  const privacyPatch = await request("/api/v1/friends/privacy", {
    method: "PATCH",
    body: JSON.stringify({ allowEveryone: toggleValue })
  });
  expectStatus("friends.privacy.patch", privacyPatch.res.status, [200], privacyPatch.body);

  const privacyRestore = await request("/api/v1/friends/privacy", {
    method: "PATCH",
    body: JSON.stringify({ allowEveryone: currentPrivacy.allowEveryone ?? true })
  });
  expectStatus("friends.privacy.restore", privacyRestore.res.status, [200], privacyRestore.body);

  const blockedListBefore = await request("/api/v1/friends/blocked");
  expectStatus("friends.blocked.list(before)", blockedListBefore.res.status, [200], blockedListBefore.body);

  const blockFriend = await request("/api/v1/friends/blocked", {
    method: "POST",
    body: JSON.stringify({ userId: friend.id })
  });
  expectStatus("friends.block", blockFriend.res.status, [201], blockFriend.body);

  const blockedListAfter = await request("/api/v1/friends/blocked");
  expectStatus("friends.blocked.list(after)", blockedListAfter.res.status, [200], blockedListAfter.body);

  const unblockFriend = await request(`/api/v1/friends/blocked/${encodeURIComponent(friend.id)}`, {
    method: "DELETE"
  });
  expectStatus("friends.unblock", unblockFriend.res.status, [200], unblockFriend.body);

  const serversBefore = await request("/api/v1/servers");
  expectStatus("servers.list(before)", serversBefore.res.status, [200], serversBefore.body);

  const serverName = nowId("smoke-server");
  const createServer = await request("/api/v1/servers", {
    method: "POST",
    body: JSON.stringify({ name: serverName })
  });
  expectStatus("servers.create", createServer.res.status, [201], createServer.body);
  const serverId = createServer.body?.id;
  if (!serverId) {
    fail("servers.id", "create response id yok");
    summarizeAndExit();
    return;
  }

  const getServer = await request(`/api/v1/servers/${encodeURIComponent(serverId)}`);
  expectStatus("servers.get(by-id,no-slash)", getServer.res.status, [200], getServer.body);

  const updatedServerName = `${serverName}-upd`;
  const updateServer = await request(`/api/v1/servers/${encodeURIComponent(serverId)}`, {
    method: "PATCH",
    body: JSON.stringify({ name: updatedServerName })
  });
  expectStatus("servers.update(no-slash)", updateServer.res.status, [200], updateServer.body);

  const serverMembersBeforeInvite = await request(`/api/v1/servers/${encodeURIComponent(serverId)}/members`);
  expectStatus("servers.members.list(before)", serverMembersBeforeInvite.res.status, [200], serverMembersBeforeInvite.body);

  const inviteFriend = await request(`/api/v1/servers/${encodeURIComponent(serverId)}/members`, {
    method: "POST",
    body: JSON.stringify({ userId: friend.id })
  });
  expectStatus("servers.members.invite", inviteFriend.res.status, [200, 201], inviteFriend.body);

  const serverMembersAfterInvite = await request(`/api/v1/servers/${encodeURIComponent(serverId)}/members`);
  expectStatus("servers.members.list(after-invite)", serverMembersAfterInvite.res.status, [200], serverMembersAfterInvite.body);

  const removeFriendMember = await request(
    `/api/v1/servers/${encodeURIComponent(serverId)}/members/${encodeURIComponent(friend.id)}`,
    { method: "DELETE" }
  );
  expectStatus("servers.members.remove", removeFriendMember.res.status, [200], removeFriendMember.body);

  const createTextChannel = await request("/api/v1/channels", {
    method: "POST",
    body: JSON.stringify({
      serverId,
      name: "smoke-text",
      kind: "text"
    })
  });
  expectStatus("channels.create", createTextChannel.res.status, [201], createTextChannel.body);
  const channelId = createTextChannel.body?.id;

  const channelsList = await request(`/api/v1/channels?server_id=${encodeURIComponent(serverId)}&kind=text`);
  expectStatus("channels.list", channelsList.res.status, [200], channelsList.body);

  if (channelId) {
    const sendChannelMessage = await request("/api/v1/messages", {
      method: "POST",
      body: JSON.stringify({
        conversationType: "channel",
        conversationId: channelId,
        content: `smoke-test-channel-${Date.now()}`
      })
    });
    expectStatus("messages.send(channel)", sendChannelMessage.res.status, [201], sendChannelMessage.body);
    const channelMessageId = sendChannelMessage.body?.id;

    if (channelMessageId) {
      const editChannelMessage = await request(`/api/v1/messages/${encodeURIComponent(channelMessageId)}`, {
        method: "PATCH",
        body: JSON.stringify({ content: `smoke-test-channel-edited-${Date.now()}` })
      });
      expectStatus("messages.edit(channel)", editChannelMessage.res.status, [200], editChannelMessage.body);

      const deleteChannelMessage = await request(`/api/v1/messages/${encodeURIComponent(channelMessageId)}`, {
        method: "DELETE"
      });
      expectStatus("messages.delete(channel)", deleteChannelMessage.res.status, [200], deleteChannelMessage.body);
    } else {
      fail("messages.channel.id", "send response message id yok");
    }

    const upload = await request("/api/v1/uploads", {
      method: "POST",
      body: (() => {
        const form = new FormData();
        form.append("file", new Blob(["smoke-upload"], { type: "text/plain" }), "smoke.txt");
        return form;
      })()
    });
    expectStatus("uploads.create", upload.res.status, [201], upload.body);

    const deleteTextChannel = await request(`/api/v1/channels/${encodeURIComponent(channelId)}`, {
      method: "DELETE"
    });
    expectStatus("channels.delete", deleteTextChannel.res.status, [200], deleteTextChannel.body);
  } else {
    fail("channels.id", "create channel id yok");
  }

  const createVoiceChannel = await request("/api/v1/voice/channels", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: serverId,
      name: "Smoke Voice",
      maxParticipants: 5
    })
  });
  expectStatus("voice.channels.create", createVoiceChannel.res.status, [201], createVoiceChannel.body);
  const voiceChannelId = createVoiceChannel.body?.id;

  const listVoiceChannels = await request(`/api/v1/voice/channels?workspace_id=${encodeURIComponent(serverId)}`);
  expectStatus("voice.channels.list", listVoiceChannels.res.status, [200], listVoiceChannels.body);

  if (voiceChannelId) {
    const updateVoiceChannel = await request(`/api/v1/voice/channels/${encodeURIComponent(voiceChannelId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: "Smoke Voice Updated",
        maxParticipants: 6
      })
    });
    expectStatus("voice.channels.update", updateVoiceChannel.res.status, [200], updateVoiceChannel.body);

    const deleteVoiceChannel = await request(`/api/v1/voice/channels/${encodeURIComponent(voiceChannelId)}`, {
      method: "DELETE"
    });
    expectStatus("voice.channels.delete", deleteVoiceChannel.res.status, [200], deleteVoiceChannel.body);
  } else {
    fail("voice.channel.id", "create voice channel id yok");
  }

  const notifications = await request("/api/v1/notifications");
  expectStatus("notifications.list", notifications.res.status, [200], notifications.body);

  const leaveAsOwner = await request(`/api/v1/servers/${encodeURIComponent(serverId)}/leave`, {
    method: "POST"
  });
  expectStatus("servers.leave(owner-check)", leaveAsOwner.res.status, [400], leaveAsOwner.body);

  const deleteServer = await request(`/api/v1/servers/${encodeURIComponent(serverId)}`, {
    method: "DELETE"
  });
  expectStatus("servers.delete(no-slash)", deleteServer.res.status, [200], deleteServer.body);

  const serversAfterDelete = await request("/api/v1/servers");
  expectStatus("servers.list(after-delete)", serversAfterDelete.res.status, [200], serversAfterDelete.body);

  const refresh = await request(
    "/api/v1/auth/refresh",
    {
      method: "POST",
      body: JSON.stringify({ refreshToken })
    },
    { auth: false }
  );
  expectStatus("auth.refresh", refresh.res.status, [200], refresh.body);
  accessToken = refresh.body?.tokens?.accessToken ?? accessToken;
  refreshToken = refresh.body?.tokens?.refreshToken ?? refreshToken;

  const logout = await request(
    "/api/v1/auth/logout",
    {
      method: "POST",
      body: JSON.stringify({ refreshToken })
    },
    { auth: false }
  );
  expectStatus("auth.logout", logout.res.status, [200], logout.body);

  const meAfterLogout = await request("/api/v1/users/me");
  expectStatus("users.me(after-logout)", meAfterLogout.res.status, [401], meAfterLogout.body);

  summarizeAndExit();
}

function summarizeAndExit() {
  const passed = results.filter((item) => item.ok).length;
  const failed = results.filter((item) => !item.ok);
  logStep("");
  logStep(`Toplam: ${results.length}, Başarılı: ${passed}, Başarısız: ${failed.length}`);
  if (failed.length > 0) {
    logStep("Başarısız adımlar:");
    for (const item of failed) {
      logStep(`- ${item.name}: ${item.detail}`);
    }
    process.exitCode = 1;
    return;
  }
  logStep("Tüm smoke test adımları başarılı.");
}

run().catch((error) => {
  fail("smoke.run", error instanceof Error ? error.message : String(error));
  summarizeAndExit();
});

