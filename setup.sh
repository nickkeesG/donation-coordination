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
echo ""
echo "  1. Create .env file:  nano /opt/donation-coordination/.env"
echo "     Add the following:"
echo "       NODE_ENV=production"
echo "       RESEND_API_KEY=your_key_here"
echo "       PORT=3000"
echo ""
echo "  2. Create .env.dev file:  nano /opt/donation-coordination/.env.dev"
echo "     Add the following:"
echo "       NODE_ENV=production"
echo "       RESEND_API_KEY=your_key_here"
echo "       PORT=3001"
echo "       DB_FILE=data-dev.db"
echo "       ALLOW_ALL_EMAILS=true"
echo "       BASE_PATH=/dev"
echo "       COOKIE_NAME=session_dev"
echo ""
echo "  3. Start both apps:"
echo "       pm2 start server.js --name prod"
echo "       ENV_FILE=.env.dev pm2 start server.js --name dev"
echo ""
echo "  4. Enable auto-start on reboot:  pm2 save && pm2 startup"
