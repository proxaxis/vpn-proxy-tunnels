const PORTAL_URL = "https://tunnels.proxaxis.me/api/start-vpn";
const VPN_DOMAIN = "ldb.c.chuo-u.ac.jp";

// Cloudflare Access Service Token (ユーザー選択 ua〜ud に対応)
const ACCESS_TOKENS = {
  ua: { id: "5d5d5f35a9b4224bedcdd74af6543c45.access", secret: "cfast_ByIll5txNXaas1avPxk0FtkHp3KIszyKlSmiK2wj1a35496f" },
  ub: { id: "039dd48d075dc8532bbf4cf241348f40.access", secret: "cfast_OkvmLU6MrgX0nrWWF4N34v7Hu5ajHUw2Lg9kbbdW4edde19e" },
  uc: { id: "5efddebecdf77306089003a733308f95.access", secret: "cfast_4VhaaBaltODug2Co8ySamOB391PDAf2GOrwIhmCm78f58e25" },
  ud: { id: "de619cfd5f6284cce9479a40e4ebeb93.access", secret: "cfast_RdN2bMwwg8YZMi12kv21KDFNQ7WMZwcJaB8PanBj4f7555eb" },
};

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

      // 2. Container X の API に送信 (Cloudflare Access Service Token 認証)
      const tok = ACCESS_TOKENS[username];
      const response = await fetch(PORTAL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Access-Client-Id": tok.id,
          "CF-Access-Client-Secret": tok.secret
        },
        body: JSON.stringify({
          username: username,
          cookie: session.value
        })
      });

      let data;
      try {
        data = await response.json();
      } catch {
        data = { detail: `非JSON応答 (HTTP ${response.status})。Cloudflare Access ポリシーを確認してください` };
      }

      if (response.ok) {
        showStatus(`起動成功!\nContainer: ${data.container_id}\nプロキシ: HTTPS ${data.proxy_endpoint}:443\n(PAC等で設定・初回は認証入力)`, "success");
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