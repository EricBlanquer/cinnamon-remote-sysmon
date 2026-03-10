# Remote System Monitor - Cinnamon Applet

A Cinnamon panel applet that monitors CPU, RAM and temperature of a remote Linux machine via SSH, displayed as sparkline graphs.

## Features

- **Sparkline graphs** for CPU, RAM and temperature in the panel with customizable colors and widths
- **Color-coded tooltip** on hover: CPU %, temperature, memory breakdown (used, cached, buffers, free, swap)
- **Auto-detection** of CPU thermal zone (configurable)
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
| CPU graph color | `#ffa500` (orange) | Color of the CPU sparkline graph |
| Memory graph color | `#b266ff` (violet) | Color of the Memory sparkline graph |
| Temperature graph color | `#ff5050` (red) | Color of the Temperature sparkline graph |
| Thermal zone | *(empty)* | Thermal zone name (empty = auto-detect CPU) |
| CPU graph width | 40px | Width of the CPU graph (10-200px) |
| Memory graph width | 40px | Width of the Memory graph (10-200px) |
| Temperature graph width | 40px | Width of the Temperature graph (10-200px) |

## How it works

The applet reads `/proc/stat`, `/proc/meminfo` and `/sys/class/thermal/` from the remote machine via SSH. CPU usage is computed as a delta between two successive reads. Temperature is auto-detected from thermal zones (prefers `x86_pkg_temp`, `TCPU`, `coretemp`). No agent or daemon is needed on the remote machine.
