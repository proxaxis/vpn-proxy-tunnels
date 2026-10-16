FROM alpine:3.19

RUN apk add --no-cache openconnect squid bash curl iproute2

COPY squid.conf /etc/squid/squid.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3128
ENTRYPOINT ["/entrypoint.sh"]
