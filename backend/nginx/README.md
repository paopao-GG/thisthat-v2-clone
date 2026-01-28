# Nginx Configuration Files

This directory contains nginx configuration files for the THISTHAT backend reverse proxy setup.

## Files

- `nginx.conf` - Main nginx configuration (global settings, worker processes, gzip, rate limiting zones)
- `default.conf` - Site-specific configuration (upstream, SSL, routing rules)

## SSL Certificates

You need to set up SSL certificates in the `ssl/` directory:

1. **For Development (Self-Signed):**
   ```bash
   mkdir -p ssl
   openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
     -keyout ssl/privkey.pem \
     -out ssl/fullchain.pem
   ```

2. **For Production (Let's Encrypt):**
   ```bash
   # Install certbot
   sudo apt-get install certbot
   
   # Generate certificates
   sudo certbot certonly --standalone -d api.yourdomain.com
   
   # Copy to ssl directory
   sudo cp /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem ssl/
   sudo cp /etc/letsencrypt/live/api.yourdomain.com/privkey.pem ssl/
   ```

## Configuration Notes

- Update `server_name` in `default.conf` to match your domain
- Ensure SSL certificate paths are correct
- Adjust rate limiting zones as needed for your traffic patterns
- The configuration uses `least_conn` load balancing for better distribution

## Testing Configuration

```bash
# Test nginx configuration
docker-compose exec nginx nginx -t

# Reload nginx after changes
docker-compose exec nginx nginx -s reload
```




