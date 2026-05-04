FROM kong:3.4-ubuntu

# Set Kong to run without a database (DB-less mode) using our YAML config
ENV KONG_DATABASE=off
ENV KONG_DECLARATIVE_CONFIG=/usr/local/kong/declarative/kong.yml
ENV KONG_PROXY_ACCESS_LOG=/dev/stdout
ENV KONG_ADMIN_ACCESS_LOG=/dev/stdout
ENV KONG_PROXY_ERROR_LOG=/dev/stderr
ENV KONG_ADMIN_ERROR_LOG=/dev/stderr

# Copy our traffic rules into the container
COPY kong.yml /usr/local/kong/declarative/kong.yml

USER kong
