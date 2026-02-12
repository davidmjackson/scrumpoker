# Scrum Poker - Security and Production Notes

## Security changes applied

- Added/extended response security headers in `server.js`:
  - `Permissions-Policy`
  - `Referrer-Policy`
  - `X-Content-Type-Options`
  - `X-Frame-Options`
  - `Cross-Origin-Opener-Policy`
  - `Cross-Origin-Resource-Policy`
  - CSP now includes `form-action 'self'`
- Added WebSocket safety limits:
  - `maxPayload: 64 * 1024`
  - `perMessageDeflate: false`
- Removed private IP references from frontend comments (`public/js/app.js`).

## Production reverse proxy (Nginx)

Use a reverse proxy in front of Node and terminate TLS at Nginx.

```nginx
server {
    listen 443 ssl http2;
    server_name scrum-poker.uk;

    # TLS config from certbot / your CA
    ssl_certificate /etc/letsencrypt/live/scrum-poker.uk/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/scrum-poker.uk/privkey.pem;

    # Security headers at edge (mirror app values)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;
    add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=(), browsing-topics=()" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 65s;
    }

    location /ws {
        proxy_pass http://127.0.0.1:3000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
    }
}

server {
    listen 80;
    server_name scrum-poker.uk;
    return 301 https://$host$request_uri;
}
```

## Production runtime tweaks

- Run Node with a process manager (systemd or pm2) and automatic restart.
- Bind Node to localhost only when behind Nginx (`127.0.0.1`) unless you need direct LAN access.
- Use firewall rules to expose only `80/443` publicly.
- Keep dependencies updated (`npm audit` + planned patch windows).
- Re-run the scanner after deployment and keep exceptions documented.

## Remaining accepted risks

- CSP currently keeps:
  - `script-src 'unsafe-eval'`
  - `style-src 'unsafe-inline'`

These are currently tolerated because the app uses browser-side Tailwind runtime and inline-style patterns. If you compile Tailwind ahead of time and remove runtime generation, these can be removed for stronger CSP.
