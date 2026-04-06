#!/bin/bash
# Run this on the server as root from /opt/donation-coordination

# Set up nginx
cp nginx.conf /etc/nginx/sites-available/coordinatedonate.org
ln -sf /etc/nginx/sites-available/coordinatedonate.org /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Set up HTTPS
certbot --nginx -d coordinatedonate.org -d www.coordinatedonate.org --non-interactive --agree-tos -m "$1"

echo ""
echo "Done! Next steps:"
echo "  1. Create .env file:  nano /opt/donation-coordination/.env"
echo "     Add the following:"
echo "       NODE_ENV=production"
echo "       RESEND_API_KEY=your_key_here"
echo "       PORT=3000"
echo "  2. Start the app:  pm2 start server.js"
echo "  3. Enable auto-start on reboot:  pm2 save && pm2 startup"
