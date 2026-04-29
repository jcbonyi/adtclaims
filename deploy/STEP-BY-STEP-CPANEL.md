# Deploy on claims.adtinsurance.co.ke (no Vercel)

## Can I just copy files and it runs automatically?

**No.** This app has three parts:

| Part | What “copy” does | What you actually need |
|------|-------------------|-------------------------|
| **Frontend** | Copying source does nothing useful | Run `npm run build` and serve the **`frontend/dist`** folder as static files (HTML/JS/CSS). |
| **Backend** | PHP-style “upload and visit” does not apply | **Node.js** must run `backend` (Express) **all the time** (e.g. PM2), listening on a port (e.g. 4000). |
| **Database** | No DB in files | **PostgreSQL** with a real `DATABASE_URL`. |

Apache only serves static files and (if configured) **proxies** `/api` to Node. Nothing starts Node or Postgres by itself.

---

## Overview

1. Point **DNS** for `claims.adtinsurance.co.ke` to your server.  
2. Create **PostgreSQL** database + user in cPanel.  
3. Put the code on the server (Git clone or upload), **install** and **configure** backend, **start** Node with PM2.  
4. **Build** frontend and put **`dist`** in the subdomain’s **document root**.  
5. Configure **Apache** so `https://claims.adtinsurance.co.ke` serves that `dist` and **`/api`** goes to `http://127.0.0.1:4000`.  
6. Enable **SSL** (AutoSSL) for the subdomain.  
7. Open the site once and run **bootstrap admin** (if DB is empty).

Replace paths below with your real cPanel username and subdomain document root (cPanel shows this when you create the subdomain).

---

## Step 1 — DNS

In your DNS host (often same as registrar):

- Add an **A** record: **Host** `claims` → **Value** your server’s IP (e.g. the shared IP cPanel shows).  
- Wait for propagation (minutes to a few hours).

In **cPanel → Domains** (or **Subdomains**), add **`claims.adtinsurance.co.ke`** if it is not already there. Note the **document root**, e.g.:

`/home/USERNAME/public_html/claims`  
or  
`/home/USERNAME/claims.adtinsurance.co.ke`

You will put **`frontend/dist`** *contents* here (or set `DocumentRoot` to a folder that contains them).

---

## Step 2 — PostgreSQL

1. **cPanel → PostgreSQL Databases** (name may vary).  
2. Create a **database** (e.g. `username_claims`).  
3. Create a **user** and **password**, assign the user to the database with **ALL** privileges.  
4. Build **`DATABASE_URL`**. On many cPanel servers it looks like:

   `postgres://DBUSER:DBPASS@127.0.0.1:5432/DBNAME`

   If the host gives a socket or a different host, use their documentation.

**Important:** This app uses **PostgreSQL**, not MariaDB. The “MariaDB” line in Server Information is separate.

---

## Step 3 — SSH and Node.js

1. Enable **SSH Access** in cPanel if needed.  
2. Connect: `ssh USERNAME@claims.adtinsurance.co.ke` (or the host’s SSH hostname).  
3. Install **Node.js** if not present. Options depend on the host:
   - **cPanel “Setup Node.js App” / Application Manager** (use the version they offer, ideally **18+**), or  
   - **nvm** in your home directory (if allowed):

     ```bash
     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
     source ~/.bashrc
     nvm install 20
     ```

4. Install **PM2** globally (if allowed):

   ```bash
   npm install -g pm2
   ```

---

## Step 4 — Put the app on the server

**Option A — Git (recommended)**

```bash
cd ~
git clone https://github.com/YOURUSER/adtclaims.git claims-app
cd claims-app
```

**Option B — Upload**  
Zip the project locally, upload via File Manager, unzip to e.g. `~/claims-app`.

---

## Step 5 — Backend (API)

```bash
cd ~/claims-app/backend
npm ci --omit=dev
```

Create **`backend/.env`** (use **nano** or File Manager; **never** commit this file):

```env
PORT=4000
DATABASE_URL=postgres://DBUSER:DBPASS@127.0.0.1:5432/DBNAME
JWT_SECRET=long-random-secret-at-least-32-chars
JWT_EXPIRES_IN=8h
ADMIN_RESET_KEY=your-secret-reset-key
NODE_ENV=production
```

Start the API (pick one):

```bash
# One-off test
NODE_ENV=production node src/index.js
```

If that works, use PM2 so it stays running:

```bash
cd ~/claims-app/backend
pm2 start src/index.js --name claims-api
pm2 save
# If your host documents startup: pm2 startup
```

The API should listen on **`127.0.0.1:4000`** (or `0.0.0.0:4000`—prefer binding to localhost if the proxy is local only).

**Firewall:** Only Apache needs to be public; port **4000** should **not** be open to the world if possible.

---

## Step 6 — Frontend (static site)

```bash
cd ~/claims-app/frontend
npm ci
npm run build
```

Copy **everything inside** `frontend/dist/` into the subdomain **document root** (the folder Apache uses for `claims.adtinsurance.co.ke`), e.g.:

```bash
rsync -av --delete ~/claims-app/frontend/dist/ /home/USERNAME/public_html/claims/
```

(Adjust the destination to match cPanel’s path for that subdomain.)

**Do not** set `VITE_API_BASE_URL` for same-domain hosting: the app uses **`/api`**, which Apache will forward to Node.

---

## Step 7 — Apache: static + `/api` proxy

You need **`mod_proxy`** and **`mod_proxy_http`**. On **shared cPanel**, you may **not** be allowed to add `ProxyPass` yourself—**open a ticket** and ask:

> “Please enable reverse proxy for `claims.adtinsurance.co.ke`: `DocumentRoot` = (path to dist), and `ProxyPass /api http://127.0.0.1:4000/api` with `ProxyPassReverse`.”

If you have **WHM** or included config access, use the pattern in **[`apache.sample.conf`](apache.sample.conf)** with:

- `ServerName claims.adtinsurance.co.ke`  
- `DocumentRoot` = path where you copied `dist`  
- `ProxyPass /api http://127.0.0.1:4000/api`

Reload Apache after changes.

---

## Step 8 — SSL

**cPanel → SSL/TLS Status** → run **AutoSSL** (or Let’s Encrypt) for **`claims.adtinsurance.co.ke`**.

---

## Step 9 — First use

1. Open **`https://claims.adtinsurance.co.ke`**.  
2. If the database has **no users**, use **Bootstrap first admin** and create the admin account.  
3. If something fails, check:
   - Browser **Network** tab: do `/api/...` requests return **200** or an error?
   - `pm2 logs claims-api`
   - Apache error log (cPanel → Errors / Raw log)

---

## When shared hosting blocks Node or ProxyPass

Some **Web_*** packages only support **PHP + static files**. If the host cannot run **Node** or **ProxyPass**:

- Run the **API** on a small **VPS** or **Railway/Render** and set **`VITE_API_BASE_URL`** at **build time** to `https://your-api-host/api`, then rebuild `frontend` and redeploy `dist`; **or**
- Move to a **VPS** where you control nginx/Apache and PM2.

---

## Checklist

- [ ] DNS **A** for `claims` → server IP  
- [ ] Subdomain document root known  
- [ ] PostgreSQL DB + user + `DATABASE_URL`  
- [ ] `backend/.env` with secrets  
- [ ] `npm ci --omit=dev` in `backend`, PM2 running `src/index.js`  
- [ ] `npm ci && npm run build` in `frontend`, `dist` copied to document root  
- [ ] Apache `ProxyPass /api` → Node (or host ticket)  
- [ ] SSL for `claims.adtinsurance.co.ke`  
- [ ] Bootstrap admin in browser  

---

## Disk space

If the server disk is **~90% full**, free space before `npm ci` and uploads, or installs may fail.
