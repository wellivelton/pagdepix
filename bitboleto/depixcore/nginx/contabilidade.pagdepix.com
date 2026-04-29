# Nginx — contabilidade.pagdepix.com → DepixCore :3002
#
# Como instalar na VPS:
#   sudo cp /home/pagdepix/depixcore/nginx/contabilidade.pagdepix.com /etc/nginx/sites-available/contabilidade.pagdepix.com
#   sudo ln -s /etc/nginx/sites-available/contabilidade.pagdepix.com /etc/nginx/sites-enabled/
#   sudo nginx -t
#   sudo systemctl reload nginx
#   sudo certbot --nginx -d contabilidade.pagdepix.com
#
# O Certbot vai adicionar o bloco SSL automaticamente.

server {
    listen 80;
    server_name contabilidade.pagdepix.com;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;

    # Logs separados para não misturar com outros serviços
    access_log /var/log/nginx/depixcore.access.log;
    error_log  /var/log/nginx/depixcore.error.log;

    location / {
        proxy_pass         http://127.0.0.1:3002;
        proxy_http_version 1.1;

        # Headers necessários para o Express enxergar o IP real
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 10s;
        proxy_read_timeout    60s;
        proxy_send_timeout    60s;

        # Evita buffering para respostas de streaming
        proxy_buffering off;
    }
}
