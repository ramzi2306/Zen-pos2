let ws = null;
let heartbeatTimer = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
let shouldReconnect = false;
let activeToken = '';
let apiUrl = '';
let everConnected = false;
let failCount = 0;

self.addEventListener('message', (e) => {
  const data = e.data;
  if (data.type === 'CONNECT') {
    activeToken = data.token;
    apiUrl = data.apiUrl;
    shouldReconnect = true;
    reconnectDelay = 1000;
    failCount = 0;
    everConnected = false;
    connectWs();
  } else if (data.type === 'DISCONNECT') {
    shouldReconnect = false;
    activeToken = '';
    everConnected = false;
    if (ws) {
      ws.onclose = null;
      ws.close(1000, 'logout');
      ws = null;
    }
    stopHeartbeat();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    self.postMessage({ type: 'STATUS', connected: false });
  } else if (data.type === 'REFRESH_TOKEN') {
    if (data.token) {
      activeToken = data.token;
      if (shouldReconnect && !ws) {
        connectWs();
      }
    }
  }
});

function connectWs() {
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  stopHeartbeat();
  self.postMessage({ type: 'STATUS', connected: false });

  try {
    const wsUrl = apiUrl.replace(/^http/, 'ws') + `/ws/notifications?token=${activeToken}`;
    ws = new WebSocket(wsUrl);
  } catch (err) {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectDelay = 1000;
    failCount = 0;
    startHeartbeat();
    self.postMessage({ type: 'STATUS', connected: true });
    if (everConnected) {
      self.postMessage({ type: 'RECONNECT' });
    }
    everConnected = true;
  };

  ws.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      if (event.type === 'ping') return;
      self.postMessage({ type: 'EVENT', event });
    } catch {}
  };

  ws.onclose = (e) => {
    stopHeartbeat();
    self.postMessage({ type: 'STATUS', connected: false });
    if (!shouldReconnect) return;
    failCount++;
    const isAuthClose = e.code === 4001 || e.code === 4003;
    scheduleReconnect(isAuthClose || failCount >= 2);
  };

  ws.onerror = () => {};
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send('ping');
    }
  }, 25000);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function scheduleReconnect(refreshFirst = false) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  reconnectTimer = setTimeout(() => {
    if (!shouldReconnect) return;
    if (refreshFirst) {
      self.postMessage({ type: 'NEED_TOKEN' });
    } else {
      connectWs();
    }
  }, delay);
}
