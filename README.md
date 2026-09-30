# Homebridge Fellow EKG

An on/off switch for Fellow kettles that expose the local HTTP CLI. The switch appears in Homebridge and Apple Home as **Fellow Kettle**. Turning it on starts a heat cycle at the temperature already set on the kettle; turning it off stops the cycle. The plugin does not change the temperature setting.

This is an unofficial integration. It uses the protocol documented by [rderewianko/fellow-ekg](https://github.com/rderewianko/fellow-ekg), an Unlicense Home Assistant project. This Homebridge plugin is a separate JavaScript implementation.

**You can install this directly from GitHub now.** An npm release is only needed for the Homebridge Plugins search and install flow; see [Install from GitHub](#install-from-github).

## Before you install

You need:

- A working Homebridge installation with Node.js 18.17 or newer.
- A Fellow kettle whose firmware responds to `http://<kettle-ip>/cli?cmd=state` on your local network. This is **not** a Bluetooth plugin, and it will not work with a kettle that lacks the HTTP CLI.
- The kettle's local IP address. Reserve that address in your router so it does not change.

## Find and verify the kettle IP

Look in your router's connected-device or DHCP list. The kettle may appear with a device name or manufacturer resembling **Espressif** (sometimes shown as “expressif”). That is a clue, not proof: verify the address with the kettle endpoint.

You can also use a LAN scanner such as **LanScan** or **Fing**. From a terminal on the same network, `arp -a` lists devices already seen by your computer. If you have `nmap` installed, scan your own subnet, replacing the example range with your network's range:

```sh
arp -a
nmap -sn 192.168.1.0/24
```

For each likely IP, run the read-only check from the **Homebridge host** (or open the URL in a browser on the same network):

```sh
curl -fsS 'http://192.168.1.50/cli?cmd=state'
```

Replace `192.168.1.50` with the candidate IP. A compatible kettle response contains a line such as `mode=S_Off` or `mode=S_Hold`. Do not use a scanner's name or vendor label alone as confirmation.

## Install with Homebridge UI

This method requires the npm release. Until then, use the GitHub install below.

1. Open Homebridge, then **Plugins**.
2. Search for **`homebridge-fellow-ekg`** and install it.
3. Open the plugin's **Settings**. Enter the kettle's IP address in **Kettle IP address or hostname**. Leave port `80` and poll interval `30` unless your setup differs.
4. Save and restart Homebridge.
5. Open **Accessories**. You should see **Fellow Kettle** as a switch. If Homebridge is already paired with Apple Home, the switch should appear there too.

If you configure Homebridge by editing `config.json`, add this object to its top-level `platforms` array:

```json
{
  "platform": "FellowEKG",
  "name": "Fellow Kettle",
  "host": "192.168.1.50",
  "port": 80,
  "pollInterval": 30
}
```

Replace `192.168.1.50` with your kettle's IP. `host` is an IP address or hostname only, without `http://`, a port suffix, or `/cli`. Restart Homebridge after saving the config.

## Install from GitHub

This works without an npm release. On the official Homebridge Raspberry Pi image or a Linux service using `/var/lib/homebridge` as its plugin directory, open the Homebridge **Terminal** and run:

```sh
sudo npm install --prefix /var/lib/homebridge git+https://github.com/GautamBose/homebridge-fellow-ekg.git#v1.0.0
sudo hb-service restart
```

Then set the kettle IP in the plugin settings or add the `platforms` entry shown above. This GitHub install was tested in a clean npm environment. Check your Homebridge plugin directory before using these commands on other installation types.

### Checklist for an installing agent

1. Determine the Homebridge plugin directory. Use `/var/lib/homebridge` only if that is the service's actual plugin directory; a global npm install elsewhere may not be loaded.
2. Find the kettle IP using the router, LanScan, Fing, `arp -a`, or a scan of the user's own subnet. Treat “Espressif”/“expressif” as a lead. Confirm the candidate with `curl -fsS 'http://IP/cli?cmd=state'` **from the Homebridge host** and require a `mode=` line.
3. Install the pinned GitHub tag with the command above, substituting the correct plugin directory if needed. Verify with `npm ls --prefix /var/lib/homebridge homebridge-fellow-ekg --depth=0` when that directory applies.
4. Set `host` to the confirmed IP in the `FellowEKG` platform config. It must contain only the IP or hostname, without `http://`, a port, or `/cli`.
5. Restart Homebridge. Check its logs for `homebridge-fellow-ekg.FellowEKG` and its Accessories screen for the **Fellow Kettle** switch. Read its state before trying an on/off action.

For development, clone this repository and install it in the same npm environment as Homebridge:

```sh
git clone https://github.com/GautamBose/homebridge-fellow-ekg.git
cd homebridge-fellow-ekg
npm test
npm install -g .
```

A global `npm install` in another Node.js environment may not be discovered by a Homebridge service.

## Behavior and limits

- The switch is **On** while the kettle reports heating or Hold mode. It is **Off** when the kettle reports Off, standby, or a completed heat cycle outside Hold mode.
- Homebridge polls the kettle every 30 seconds by default. A switch action reads back the kettle's state before reporting success. Brief network failures during a mode change are retried.
- The kettle retains its physical target temperature. Use its dial to change that temperature.
- The plugin does not detect water level. Check that the kettle contains water before starting it remotely, and follow the kettle manufacturer's normal use instructions.
- The HTTP CLI is local and unauthenticated. Keep the kettle on a trusted local network and do not expose its port to the internet.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Plugin says the kettle is unavailable | Confirm that `http://<kettle-ip>/cli?cmd=state` responds from the Homebridge host, then check the IP address in plugin settings. |
| No accessory appears | Confirm the plugin is installed in Homebridge's plugin environment, the `FellowEKG` platform is configured, and Homebridge restarted. Check Homebridge logs for `FellowEKG`. |
| The switch turns on but does not heat | Check that the kettle is on its base, has water, and is set to the desired temperature. A kettle already at its target may immediately enter Hold mode. |
| The IP changes | Reserve the kettle's address in your router's DHCP settings, then update the plugin's `host` value. |

## For maintainers and coding agents

- `index.js` is the Homebridge dynamic platform. `kettle-client.js` is the dependency-free HTTP client. `config.schema.json` defines the Homebridge settings form.
- The platform name and schema alias are both `FellowEKG`. The plugin name in `index.js` must match `package.json` exactly because Homebridge uses it when registering cached accessories.
- The kettle accepts spaces in CLI commands as `+` in query strings. It does **not** accept `%20`; keep the `URLSearchParams` encoding and the regression test.
- On/off uses idempotent `ss S_Heat` and `ss S_Off` commands, followed by state verification. Do not replace these with the dial button's toggle command.
- Run `npm test` and inspect `npm pack --dry-run` before a release. Tests use a fake kettle and never heat real hardware. Live tests should record the initial mode and restore it afterward.
- Do not claim support for other Fellow models or firmware until tested against their `state` and control responses.

## License

MIT. This project is not affiliated with Fellow Products or Homebridge.
