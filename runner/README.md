# Scholarion lab runner

The lab terminal's **Run in container** button sends a command and the learner's saved workspace
files to this service. The runner executes the command in a fresh container and sends back the
output and the files that changed. The campus web app never executes learner code itself; the
workspace service only prepares the request and re-checks every returned file against the lab's
frozen policy before saving it.

## What every command gets

| Control | Setting |
| --- | --- |
| Network | `--network none` (no outbound or inbound traffic) |
| Filesystem | read-only root, 64 MB tmpfs at `/tmp`, learner files at `/workspace` |
| User | uid/gid 1000, all Linux capabilities dropped, `no-new-privileges` |
| Resources | memory ≤ 1 GB (default 512 MB, no swap), ≤ 2 CPUs, ≤ 256 processes, 50 MB file-size and 256 open-file ulimits |
| Time | campus sends up to 60 s (the lab's remaining runtime budget); hard kill at the limit |
| Output | 64 KB per stream; text files only come back, each ≤ 2 MB, 20 MB in total, symlinks ignored |
| Requests | HMAC-SHA256 signed, 5-minute window, single use; concurrency limit (503 when busy) |

## Deploy

Access to a Docker daemon is root-equivalent on that host, so run the runner on a **dedicated
VM** with nothing else on it, reachable only from the campus servers. gVisor is recommended
(`RUNNER_DOCKER_RUNTIME=runsc`) so a kernel bug inside a container doesn't reach the host.

```sh
docker build -t scholarion/lab-sandbox:1 -f runner/Dockerfile.sandbox runner
docker build -t scholarion/lab-runner:1  -f runner/Dockerfile runner
docker run -d --name lab-runner -p 8787:8787 \
  -v /var/run/docker.sock:/var/run/docker.sock --group-add "$(getent group docker | cut -d: -f3)" \
  -v /tmp:/tmp \
  -e RUNNER_SECRET=... -e RUNNER_IMAGE=scholarion/lab-sandbox:1 -e RUNNER_DOCKER_RUNTIME=runsc \
  scholarion/lab-runner:1
```

The runner writes each workspace to a scratch directory under `/tmp` and bind-mounts it into the
sandbox, so that path must be the same inside the runner container and on the host (hence
`-v /tmp:/tmp`). Run the runner as uid 1000, the sandbox user, so it can delete what learners
create; otherwise it clears the directory with a throwaway container.

| Runner variable | Default | Meaning |
| --- | --- | --- |
| `RUNNER_SECRET` | required | shared secret, 24+ characters |
| `RUNNER_PORT` / `RUNNER_HOST` | `8787` / `0.0.0.0` | listen address |
| `RUNNER_IMAGE` | `scholarion/lab-sandbox:1` | image commands run in |
| `RUNNER_DOCKER_BIN` | `docker` | `docker` or `podman` |
| `RUNNER_DOCKER_RUNTIME` | (none) | e.g. `runsc` |
| `RUNNER_MAX_CONCURRENCY` | `4` | parallel commands |

On the campus, set `SCHOLARION_RUNNER_URL` (for example `https://runner.internal:8787`) and
`SCHOLARION_RUNNER_SECRET` (the same secret). Until both are set the button is hidden and the
simulated terminal remains the only option.

## Protocol

`POST /v1/exec` with header `x-scholarion-signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`:

```json
{ "command": "python3 main.py", "cwd": "src", "files": { "src/main.py": "print(1)" }, "timeoutSec": 30, "limits": { "memoryMb": 512, "cpus": 1, "pids": 128 } }
```

Response: `{ exitCode, stdout, stderr, timedOut, infra, durationMs, files: { changed, deleted } }`.
`infra: true` means Docker itself failed (missing image, daemon down), not the learner's command;
the campus reports it and saves nothing. `GET /healthz` reports the backend and load.

## Tests

- `tests/campus-container-runner.test.ts` runs the service with a stub Docker CLI (signing,
  replay, unsafe paths, file sync, timeouts, campus policy checks and edit conflicts).
- `runner/integration.mjs` runs against real Docker in CI's `container-runner` job: Python over
  learner files, working directory, uid 1000, no network, read-only root, time limit, process cap.
