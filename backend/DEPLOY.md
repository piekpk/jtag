# Hosting the Jtap backend

The backend is containerized: `Dockerfile` builds a production-ready image, and
`main.py` reads its storage location from the `DATA_DIR` environment variable so
the SQLite database and uploaded profile pictures survive restarts on a
persistent volume. Local behavior is unchanged (`DATA_DIR` defaults to `.`).

## Required environment variables (all hosts)

| Variable         | Value                                                      |
|------------------|------------------------------------------------------------|
| `JTAP_SECRET_KEY`| A long random string. Generate with `openssl rand -hex 32`|
| `DATA_DIR`       | `/data` (must match the volume mount path)                 |

Without `JTAP_SECRET_KEY` the server falls back to an insecure dev default and
prints a warning — never use that in production; existing user sessions would
also be invalidated when you later change it, so set it once and keep it.

After deploying, update the mobile app's `API_URL` (`mobile/app/config.js`) to
your new public URL and rebuild the APK. No more ngrok URL churn.

---

## Option A: Railway (~$5/month, easiest)

1. Sign up at railway.app and create a new project.
2. **Deploy → From GitHub repo** → select `piekpk/jtag`.
   - Set the **root directory** to `backend` (or deploy the whole repo and set
     the Dockerfile path to `backend/Dockerfile`).
   - Railway auto-detects the `Dockerfile`.
3. **Add a volume**: service → Volumes → New Volume, mount path `/data`.
4. **Variables** tab → add:
   - `JTAP_SECRET_KEY` = your generated secret
   - `DATA_DIR` = `/data`
5. **Settings → Networking** → Generate Domain. Your API is live at
   `https://<your-service>.up.railway.app`.

Railway redeploys automatically on every push to your branch. The volume keeps
`jtap.db` and `uploads/` across redeploys.

## Option B: Oracle Cloud Always Free ($0, manual)

1. Create an Oracle Cloud account and provision an Always Free VM
   (VM.Standard.E2.1.Micro is plenty for this app). Open port 8000 in the
   instance's security list / firewall.
2. SSH in and install Docker:
   ```bash
   sudo apt-get update && sudo apt-get install -y docker.io
   sudo systemctl enable --now docker
   ```
3. Copy the `backend/` folder to the VM (or `git clone` the repo), then:
   ```bash
   cd jtag/backend
   sudo docker build -t jtap-backend .
   sudo mkdir -p /data/jtap
   sudo docker run -d --name jtap --restart unless-stopped \
     -p 8000:8000 \
     -e DATA_DIR=/data \
     -e JTAP_SECRET_KEY='<your-generated-secret>' \
     -v /data/jtap:/data \
     jtap-backend
   ```
4. Your API is live at `http://<vm-public-ip>:8000`. For HTTPS, put it behind
   a free Cloudflare tunnel or Caddy reverse proxy (recommended before real
   users connect).

To update: `git pull`, rebuild the image, stop/remove the old container, and
re-run the same `docker run` — `/data/jtap` on the host keeps your database.
