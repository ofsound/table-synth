# Table Synth

A browser-based iPhone controller for a virtual ball rolling on a 2D note grid, plus a local companion bridge that turns OSC-over-WebSocket hit events into DAW-readable MIDI.

## Run

```sh
npm install
npm run certs
npm run dev:companion
npm run dev
```

Open the Vite URL on the iPhone using HTTPS, then connect the app to:

```text
wss://YOUR_MAC_LAN_IP:8787
```

The companion creates a virtual MIDI output named `Table Synth MIDI`. Select that as a MIDI input in your DAW.

## iPhone HTTPS Notes

iPhone Safari requires a secure context and a tap-triggered permission request for motion/orientation sensors. The same local server certificate in `.cert/` is used by Vite and the companion.

For iPhone testing, install `.cert/table-synth-local-ca.cert.pem` on the phone and enable full trust:

1. AirDrop or otherwise transfer `.cert/table-synth-local-ca.cert.pem` to the iPhone.
2. Install the profile in Settings.
3. Enable it in Settings > General > About > Certificate Trust Settings.
4. Open `https://YOUR_MAC_LAN_IP:8787` in Safari and confirm it shows `Table Synth companion is running.`

You can replace the generated certs with your own and set:

```sh
TABLE_SYNTH_TLS_CERT=/path/to/cert.pem TABLE_SYNTH_TLS_KEY=/path/to/key.pem npm run dev:companion
```

## Companion Environment

```sh
TABLE_SYNTH_WS_PORT=8787
TABLE_SYNTH_MIDI_PORT_NAME="Table Synth MIDI"
TABLE_SYNTH_MIDI_CHANNEL=1
TABLE_SYNTH_NOTE_DURATION_MS=160
TABLE_SYNTH_NO_MIDI=1
```

`TABLE_SYNTH_NO_MIDI=1` is useful when testing the bridge on a machine without virtual MIDI support.
