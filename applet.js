const UUID = "remote-sysmon@eric.blanquer";

const Applet = imports.ui.applet;
const Mainloop = imports.mainloop;
const Settings = imports.ui.settings;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const Cairo = imports.cairo;

const HISTORY_SIZE = 40;

function MyApplet(metadata, orientation, panelHeight, instanceId) {
  this._init(metadata, orientation, panelHeight, instanceId);
}

MyApplet.prototype = {
  __proto__: Applet.Applet.prototype,

  _init: function(metadata, orientation, panelHeight, instanceId) {
    Applet.Applet.prototype._init.call(this, orientation, panelHeight, instanceId);

    this.panelHeight = panelHeight;
    this._applet_tooltip._tooltip.set_style("text-align: left; font-family: monospace; font-size: 9pt; background-color: #1e1e2e; color: #cdd6f4; padding: 8px; border-radius: 6px;");

    this.settings = new Settings.AppletSettings(this, UUID, instanceId);
    this.settings.bindProperty(Settings.BindingDirection.IN, "label", "label", this._updateLabel.bind(this), null);
    this.settings.bindProperty(Settings.BindingDirection.IN, "sshHost", "sshHost", null, null);
    this.settings.bindProperty(Settings.BindingDirection.IN, "updateInterval", "updateInterval", null, null);
    this.settings.bindProperty(Settings.BindingDirection.IN, "cpuColor", "cpuColor", null, null);
    this.settings.bindProperty(Settings.BindingDirection.IN, "memColor", "memColor", null, null);
    this.settings.bindProperty(Settings.BindingDirection.IN, "tempColor", "tempColor", null, null);
    this.settings.bindProperty(Settings.BindingDirection.IN, "thermalZone", "thermalZone", null, null);
    this.settings.bindProperty(Settings.BindingDirection.IN, "cpuGraphWidth", "cpuGraphWidth", this._updateGraphWidths.bind(this), null);
    this.settings.bindProperty(Settings.BindingDirection.IN, "memGraphWidth", "memGraphWidth", this._updateGraphWidths.bind(this), null);
    this.settings.bindProperty(Settings.BindingDirection.IN, "tempGraphWidth", "tempGraphWidth", this._updateGraphWidths.bind(this), null);

    this.cpuHistory = [];
    this.memHistory = [];
    this.tempHistory = [];
    for (let i = 0; i < HISTORY_SIZE; i++) {
      this.cpuHistory.push(0);
      this.memHistory.push(0);
      this.tempHistory.push(0);
    }

    this.cpuValue = 0;
    this.memValue = 0;
    this.tempValue = 0;

    let graphHeight = Math.max(panelHeight - 6, 16);

    this.vmLabel = new St.Label({ text: this.label || "" });
    this.vmLabel.set_style("font-size: 8px; padding: 0 2px;");
    this.vmLabel.visible = !!this.label;

    this.cpuArea = new St.DrawingArea({ width: this.cpuGraphWidth, height: graphHeight });
    this.cpuArea.connect("repaint", (area) => this._drawGraph(area, this.cpuHistory, this._parseColor(this.cpuColor)));

    this.memArea = new St.DrawingArea({ width: this.memGraphWidth, height: graphHeight });
    this.memArea.connect("repaint", (area) => this._drawGraph(area, this.memHistory, this._parseColor(this.memColor)));

    this.tempArea = new St.DrawingArea({ width: this.tempGraphWidth, height: graphHeight });
    this.tempArea.connect("repaint", (area) => this._drawGraph(area, this.tempHistory, this._parseColor(this.tempColor)));

    this.actor.add(this.vmLabel, { x_align: St.Align.MIDDLE, y_align: St.Align.MIDDLE, y_fill: false });
    this.actor.add(this.cpuArea, { x_align: St.Align.MIDDLE, y_align: St.Align.MIDDLE, y_fill: false });
    this.actor.add(this.memArea, { x_align: St.Align.MIDDLE, y_align: St.Align.MIDDLE, y_fill: false });
    this.actor.add(this.tempArea, { x_align: St.Align.MIDDLE, y_align: St.Align.MIDDLE, y_fill: false });
    this._updateGraphWidths();

    this.lastCpuTotal = 0;
    this.lastCpuIdle = 0;
    this.tooltipText = "";
    this.unreachable = false;

    this.timeout = Mainloop.timeout_add_seconds(1, () => { this.timeout = 0; this._update(); });
  },

  _updateGraphWidths: function() {
    this.cpuArea.set_width(this.cpuGraphWidth);
    this.cpuArea.visible = this.cpuGraphWidth > 0;
    this.memArea.set_width(this.memGraphWidth);
    this.memArea.visible = this.memGraphWidth > 0;
    this.tempArea.set_width(this.tempGraphWidth);
    this.tempArea.visible = this.tempGraphWidth > 0;
  },

  _updateLabel: function() {
    this.vmLabel.set_text(this.label || "");
    this.vmLabel.visible = !!this.label;
  },

  _remove_timeout: function() {
    if (this.timeout > 0) {
      Mainloop.source_remove(this.timeout);
      this.timeout = 0;
    }
  },

  _drawGraph: function(area, history, color) {
    let cr = area.get_context();
    let [width, height] = area.get_surface_size();

    cr.setSourceRGBA(0.15, 0.15, 0.15, 0.8);
    cr.rectangle(0, 0, width, height);
    cr.fill();

    cr.setSourceRGBA(0.3, 0.3, 0.3, 0.5);
    for (let y = 0.25; y < 1; y += 0.25) {
      cr.moveTo(0, Math.round(height * y) + 0.5);
      cr.lineTo(width, Math.round(height * y) + 0.5);
    }
    cr.setLineWidth(0.5);
    cr.stroke();

    let len = history.length;
    let step = width / (len - 1);

    cr.moveTo(0, height);
    for (let i = 0; i < len; i++) {
      let x = i * step;
      let y = height - (history[i] / 100) * height;
      cr.lineTo(x, y);
    }
    cr.lineTo(width, height);
    cr.closePath();

    cr.setSourceRGBA(color[0], color[1], color[2], 0.3);
    cr.fillPreserve();
    cr.setSourceRGBA(color[0], color[1], color[2], 0.9);
    cr.setLineWidth(1);
    cr.stroke();

    if (this.unreachable) {
      let layout = area.create_pango_layout("\u{26A0}");
      layout.set_font_description(imports.gi.Pango.FontDescription.from_string("Sans 10"));
      let [, extents] = layout.get_pixel_extents();
      let tx = Math.round((width - extents.width) / 2);
      let ty = Math.round((height - extents.height) / 2);
      cr.moveTo(tx, ty);
      cr.setSourceRGBA(1, 0.85, 0.2, 0.9);
      imports.gi.PangoCairo.show_layout(cr, layout);
    }

    cr.$dispose();
  },

  _parseColor: function(colorStr) {
    let match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      return [parseInt(match[1]) / 255, parseInt(match[2]) / 255, parseInt(match[3]) / 255];
    }
    return [0.5, 0.5, 0.5];
  },

  _colorToHex: function(colorStr) {
    let match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      let r = parseInt(match[1]).toString(16).padStart(2, "0");
      let g = parseInt(match[2]).toString(16).padStart(2, "0");
      let b = parseInt(match[3]).toString(16).padStart(2, "0");
      return "#" + r + g + b;
    }
    return "#808080";
  },

  _spawnAsync: function(argv, callback) {
    let proc = new Gio.Subprocess({
      argv: argv,
      flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
    });
    proc.init(null);
    proc.communicate_utf8_async(null, null, (proc, res) => {
      try {
        let [, stdout, stderr] = proc.communicate_utf8_finish(res);
        let exitCode = proc.get_exit_status();
        callback(true, stdout || "", exitCode);
      } catch (e) {
        callback(false, "", -1);
      }
    });
  },

  _update: function() {
    if (!this.sshHost) {
      this.actor.visible = true;
      this.unreachable = true;
      this.cpuArea.queue_repaint();
      this.memArea.queue_repaint();
      this._applet_tooltip.set_markup("<b>Remote Sysmon</b>\n\nSSH host not configured");
      this._remove_timeout();
      this.timeout = Mainloop.timeout_add_seconds(this.updateInterval, () => { this.timeout = 0; this._update(); });
      return;
    }

    let argv = ["ssh", "-o", "ConnectTimeout=3", "-o", "BatchMode=yes",
      this.sshHost, "head -1 /proc/stat; cat /proc/meminfo; for z in /sys/class/thermal/thermal_zone*; do echo \"THERMAL:$(cat $z/type 2>/dev/null):$(cat $z/temp 2>/dev/null)\"; done"];

    this._spawnAsync(argv, (ok, stdout, exitCode) => {
      if (ok && exitCode === 0) {
        let lines = stdout.split("\n");

        let cpuParts = lines[0].split(/\s+/);
        let user = parseInt(cpuParts[1]);
        let nice = parseInt(cpuParts[2]);
        let system = parseInt(cpuParts[3]);
        let idle = parseInt(cpuParts[4]);
        let iowait = parseInt(cpuParts[5]) || 0;
        let irq = parseInt(cpuParts[6]) || 0;
        let softirq = parseInt(cpuParts[7]) || 0;
        let steal = parseInt(cpuParts[8]) || 0;

        let total = user + nice + system + idle + iowait + irq + softirq + steal;
        let totalIdle = idle + iowait;

        if (this.lastCpuTotal > 0) {
          let dTotal = total - this.lastCpuTotal;
          let dIdle = totalIdle - this.lastCpuIdle;
          if (dTotal > 0) {
            this.cpuValue = Math.round(100 * (dTotal - dIdle) / dTotal);
          }
        }
        this.lastCpuTotal = total;
        this.lastCpuIdle = totalIdle;

        this.cpuHistory.push(this.cpuValue);
        if (this.cpuHistory.length > HISTORY_SIZE) this.cpuHistory.shift();

        let memTotal = 0, memAvailable = 0, memBuffers = 0, memCached = 0;
        let swapTotal = 0, swapFree = 0;
        for (let i = 1; i < lines.length; i++) {
          let line = lines[i];
          if (line.indexOf("MemTotal:") === 0) memTotal = parseInt(line.split(/\s+/)[1]);
          if (line.indexOf("MemAvailable:") === 0) memAvailable = parseInt(line.split(/\s+/)[1]);
          if (line.indexOf("Buffers:") === 0) memBuffers = parseInt(line.split(/\s+/)[1]);
          if (line.indexOf("Cached:") === 0) memCached = parseInt(line.split(/\s+/)[1]);
          if (line.indexOf("SwapTotal:") === 0) swapTotal = parseInt(line.split(/\s+/)[1]);
          if (line.indexOf("SwapFree:") === 0) swapFree = parseInt(line.split(/\s+/)[1]);
        }

        let memUsed = memTotal - memAvailable;
        this.memValue = Math.round(100 * memUsed / memTotal);

        this.memHistory.push(this.memValue);
        if (this.memHistory.length > HISTORY_SIZE) this.memHistory.shift();

        let preferred = ["x86_pkg_temp", "TCPU", "coretemp", "cpu_thermal", "CPU"];
        if (this.thermalZone) {
          preferred.unshift(this.thermalZone);
        }
        let fallbackTemp = -1;
        let foundTemp = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].indexOf("THERMAL:") === 0) {
            let parts = lines[i].split(":");
            let name = parts[1];
            let temp = parseInt(parts[2]);
            if (isNaN(temp)) continue;
            if (fallbackTemp < 0) fallbackTemp = temp;
            for (let j = 0; j < preferred.length; j++) {
              if (name === preferred[j]) {
                foundTemp = temp;
                break;
              }
            }
            if (foundTemp >= 0) break;
          }
        }
        let rawTemp = foundTemp >= 0 ? foundTemp : fallbackTemp;
        if (rawTemp >= 0) {
          this.tempValue = Math.round(rawTemp / 1000);
        }
        this.tempHistory.push(this.tempValue);
        if (this.tempHistory.length > HISTORY_SIZE) this.tempHistory.shift();

        let usedGB = (memUsed / 1048576).toFixed(1);
        let totalGB = (memTotal / 1048576).toFixed(1);
        let freeGB = (memAvailable / 1048576).toFixed(1);
        let cachedGB = (memCached / 1048576).toFixed(1);
        let buffersGB = (memBuffers / 1048576).toFixed(1);
        let cpuColor = this._colorToHex(this.cpuColor);
        let memColor = this._colorToHex(this.memColor);
        let tempColorHex = this._colorToHex(this.tempColor);
        let tooltip = this.label
          ? "<b>" + this.label + "</b> (" + this.sshHost + ")\n\n"
          : "<b>" + this.sshHost + "</b>\n\n";
        tooltip += "<span foreground=\"" + cpuColor + "\"><b>CPU</b>  " + this.cpuValue + "%</span>\n\n";
        if (this.tempGraphWidth > 0) {
          tooltip += "<span foreground=\"" + tempColorHex + "\"><b>Temp</b> " + this.tempValue + "°C</span>\n\n";
        }
        tooltip += "<span foreground=\"" + memColor + "\"><b>Memory</b> (" + totalGB + " GB)\n";
        tooltip += "  Used:    " + usedGB + " GB (" + this.memValue + "%)\n";
        tooltip += "  Cached:  " + cachedGB + " GB\n";
        tooltip += "  Buffers: " + buffersGB + " GB\n";
        tooltip += "  Free:    " + freeGB + " GB";
        if (swapTotal > 0) {
          let swapUsed = swapTotal - swapFree;
          let swapPercent = Math.round(100 * swapUsed / swapTotal);
          tooltip += "\n  Swap:    " + (swapUsed / 1048576).toFixed(1) + " GB (" + swapPercent + "%)";
        }
        tooltip += "</span>";
        this._applet_tooltip.set_markup(tooltip);

        this.unreachable = false;
        this.actor.visible = true;
        this.cpuArea.queue_repaint();
        this.memArea.queue_repaint();
        this.tempArea.queue_repaint();
      } else {
        this.unreachable = true;
        this.actor.visible = false;
      }

      this._remove_timeout();
      this.timeout = Mainloop.timeout_add_seconds(this.updateInterval, () => { this.timeout = 0; this._update(); });
    });
  },

  on_applet_clicked: function(event) {
  },

  on_applet_removed_from_panel: function() {
    this._remove_timeout();
  }
};

function main(metadata, orientation, panelHeight, instanceId) {
  return new MyApplet(metadata, orientation, panelHeight, instanceId);
}
