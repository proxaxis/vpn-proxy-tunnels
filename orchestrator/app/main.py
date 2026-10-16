import os
import docker
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="VPN Proxy Orchestrator")
client = docker.DockerClient(base_url="unix://var/run/docker.sock")

BASE_DOMAIN = os.getenv("HOST_BASE_DOMAIN", "proxy.example.com")
NETWORK_NAME = os.getenv("DOCKER_NETWORK", "vpn-proxy-tunnels_n-tunnels")

# ユーザーごとの内部ポートマッピング
USER_CONFIGS = {
    "ua": {"port": 1081, "container_name": "tunnels-worker-ua"},
    "ub": {"port": 1082, "container_name": "tunnels-worker-ub"},
    "uc": {"port": 1083, "container_name": "tunnels-worker-uc"},
    "ud": {"port": 1084, "container_name": "tunnels-worker-ud"}
}

class StartVPNRequest(BaseModel):
    username: str
    cookie: str

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/start-vpn")
def start_vpn(req: StartVPNRequest):
    if req.username not in USER_CONFIGS:
        raise HTTPException(status_code=403, detail="未登録のユーザーです")

    cfg = USER_CONFIGS[req.username]
    container_name = cfg["container_name"]
    host_port = cfg["port"]

    # 既に起動している場合は削除して再起動
    try:
        existing = client.containers.get(container_name)
        existing.remove(force=True)
    except docker.errors.NotFound:
        pass

    try:
        # Container A を起動
        container = client.containers.run(
            image="tunnels-worker:latest",
            name=container_name,
            detach=True,
            cap_add=["NET_ADMIN"],
            devices=["/dev/net/tun:/dev/net/tun"],
            network=NETWORK_NAME,
            ports={"3128/tcp": ("127.0.0.1", host_port)},
            environment={
                "VPN_SERVER": "https://ldb.c.chuo-u.ac.jp",
                "VPN_COOKIE": req.cookie,
                "PROXY_USER": req.username,
                "PROXY_PASSWORD": os.getenv(f"PROXY_PASS_{req.username.upper()}", ""),
            },
            restart_policy={"Name": "no"}
        )
        return {
            "status": "started",
            "container_id": container.short_id,
            "proxy_endpoint": f"{req.username}-{BASE_DOMAIN}",
            "local_forward_port": host_port
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/stop-vpn")
def stop_vpn(username: str):
    if username not in USER_CONFIGS:
        raise HTTPException(status_code=403, detail="未登録のユーザーです")
    
    container_name = USER_CONFIGS[username]["container_name"]
    try:
        c = client.containers.get(container_name)
        c.stop(timeout=5)
        c.remove(force=True)
        return {"status": "stopped", "user": username}
    except docker.errors.NotFound:
        return {"status": "not_running"}
