#!/bin/bash
# Run this on the server as root from /opt/donation-coordination

# Set up nginx
cp nginx.conf /etc/nginx/sites-available/coordinatedonate.org
ln -sf /etc/nginx/sites-available/coordinatedonate.org /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Set up HTTPS
certbot --nginx -d coordinatedonate.org -d www.coordinatedonate.org --non-interactive --agree-tos -m "$1"

echo "Done! Now start the app with:"
echo "  RESEND_API_KEY=your_key NODE_ENV=production pm2 start server.js"
