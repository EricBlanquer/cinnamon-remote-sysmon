# Remote System Monitor - Cinnamon Applet

A Cinnamon panel applet that monitors CPU and RAM usage of a remote Linux machine via SSH, displayed as sparkline graphs.

## Features

- **Sparkline graphs** for CPU (blue) and RAM (green) in the panel
- **Color-coded tooltip** on hover: CPU %, memory breakdown (used, cached, buffers, free, swap)
- **Configurable label** displayed next to the graphs
- **Configurable** SSH host and refresh interval

## Installation

```bash
git clone https://github.com/EricBlanquer/cinnamon-remote-sysmon.git ~/.local/share/cinnamon/applets/remote-sysmon@eric.blanquer
```

Then add it via **System Settings > Applets**.

## Prerequisites

SSH key-based authentication to the remote host (no password prompt).

Recommended: SSH ControlMaster for persistent connections. Add to `~/.ssh/config`:

```
Host <remote-ip>
  ControlMaster auto
  ControlPath ~/.ssh/sockets/%r@%h-%p
  ControlPersist 600
```

Then `mkdir -p ~/.ssh/sockets`.

## Configuration

Right-click the applet > Configure:

| Setting | Default | Description |
|---------|---------|-------------|
| Label | *(empty)* | Text shown in the panel and tooltip |
| SSH host | user@host | Remote machine SSH address |
| Update Interval | 10s | Polling frequency (5-120s) |

## How it works

The applet reads `/proc/stat` and `/proc/meminfo` from the remote machine via SSH. CPU usage is computed as a delta between two successive reads. No agent or daemon is needed on the remote machine.
