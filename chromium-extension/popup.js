const PORTAL_URL = "https://tunnels.proxaxis.me/api/start-vpn";
const VPN_DOMAIN = "ldb.c.chuo-u.ac.jp";

document.addEventListener("DOMContentLoaded", () => {
  const sendBtn = document.getElementById("sendBtn");
  const usernameSelect = document.getElementById("username");
  const statusDiv = document.getElementById("status");

  // 前回選択したユーザー名を復元
  chrome.storage.local.get(["saved_user"], (result) => {
    if (result.saved_user) {
      usernameSelect.value = result.saved_user;
    }
  });

  sendBtn.addEventListener("click", async () => {
    const username = usernameSelect.value;
    chrome.storage.local.set({ saved_user: username });

    sendBtn.disabled = true;
    showStatus("Cookie を取得中...", "normal");

    try {
      // 1. 大学VPNドメインの webvpn セッションCookieを取得 (HttpOnly含む)
      //    openconnect --cookie-on-stdin は「値のみ」を受け取り、
      //    Cookie: webvpn=<値> として送信するため name= 等は付けないこと
      const cookies = await chrome.cookies.getAll({ domain: VPN_DOMAIN });
      const session = cookies ? cookies.find(c => c.name === "webvpn") : null;

      if (!session || !session.value) {
        showStatus("webvpn Cookie が見つかりません。先にブラウザでVPNログインを完了してください。", "error");
        sendBtn.disabled = false;
        return;
      }

      showStatus("Container X へ送信中...", "normal");

      // 2. Container X の API に送信
      const response = await fetch(PORTAL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: username,
          cookie: session.value
        })
      });

      const data = await response.json();

      if (response.ok) {
        showStatus(`起動成功!\nContainer: ${data.container_id}\nプロキシを有効化してください。`, "success");
      } else {
        showStatus(`起動失敗: ${data.detail || response.statusText}`, "error");
      }
    } catch (err) {
      console.error(err);
      showStatus(`通信エラー: ${err.message}`, "error");
    } finally {
      sendBtn.disabled = false;
    }
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = type;
  }
});