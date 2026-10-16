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
      // 1. 大学VPNドメインのCookieを全取得 (HttpOnly含む)
      const cookies = await chrome.cookies.getAll({ domain: VPN_DOMAIN });

      if (!cookies || cookies.length === 0) {
        showStatus("Cookie が見つかりません。先にブラウザでVPNログインを完了してください。", "error");
        sendBtn.disabled = false;
        return;
      }

      // 2. OpenConnect 用の形式 (name=value; name2=value2) に整形
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");

      showStatus("Container X へ送信中...", "normal");

      // 3. Container X の API に送信
      const response = await fetch(PORTAL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: username,
          cookie: cookieHeader
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