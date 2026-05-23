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
- Use `/health` after deployment to confirm `status`, active room count, app
  version, and deployed commit.
- Bind Node to localhost only when behind Nginx (`127.0.0.1`) unless you need direct LAN access.
- Use firewall rules to expose only `80/443` publicly.
- Set `SCRUM_POKER_ADMIN_KEY` before using `/admin` for team access and invite management.
- Set `SCRUM_POKER_ACTIVITY_FILE` to a persistent private path if you want the admin audit trail stored outside the app directory.
- Keep dependencies updated (`npm audit` + planned patch windows).
- Re-run the scanner after deployment and keep exceptions documented.
- Deployment runbook: `docs/deployment.md`.

## Remaining accepted risks

- The frontend now uses local external JavaScript and CSS only.
- CSP does not allow `unsafe-eval` or `unsafe-inline`.
- Keep future UI work in external static assets unless there is a documented security exception.

## Design

This app uses the shared `theme-core` design system. The canonical source
lives in `/var/www/signal`; we pull it via `./scripts/sync-theme.sh`. To
update the theme here after a change in Signal:

    ./scripts/sync-theme.sh /var/www/signal
    git add public/css/theme-core.css public/illos/theme-illos.svg public/fonts
    git commit -m "Sync theme-core from Signal"

Scrum Poker-specific styles live in `public/css/theme-poker.css` and
`public/css/app.css`.

## License

This project is provided under a custom free-use license.

- Free to use at no charge.
- Copying, redistribution, modification, and resale are prohibited.
- The software is provided "as is" with no warranty or liability.
- Full legal text: `LICENSE`
- In-app license page: `/license` (also available at `/licence`)
