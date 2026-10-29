FROM caddy:2.11.7-alpine
RUN setcap -r /usr/bin/caddy
ENV XDG_DATA_HOME=/tmp/caddy/data XDG_CONFIG_HOME=/tmp/caddy/config
COPY Caddyfile /etc/caddy/Caddyfile
COPY public/ /srv/
USER 10001:10001
EXPOSE 8080
