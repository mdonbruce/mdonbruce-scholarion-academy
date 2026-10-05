# The runner service itself. It needs the Docker CLI and access to a Docker daemon, which is
# root-equivalent on that host, so run it on a dedicated VM with nothing else on it.
FROM node:20-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends docker.io \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/runner
COPY server.mjs package.json ./
# Same uid as the sandbox user so the runner can clean up files learners create.
USER 1000:1000
ENV RUNNER_PORT=8787
EXPOSE 8787
CMD ["node", "server.mjs"]
