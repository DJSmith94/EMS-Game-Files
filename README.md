# RF Tug of War

Static RF game with solo AI play and two-computer multiplayer.

## Game Speed

Pick the game speed before launching:

- `Fast`: 0.5 Gb file, 5 minute live cap
- `Normal`: 2 Gb file, 10 minute live cap
- `Slow`: 6 Gb file, 15 minute live cap

If the live cap expires before a file completes, the player with more transferred data wins.

## Solo Play

Open `index.html` directly in a browser, or run the local server below and choose `Solo`.

## Sandbox

Choose `Sandbox` from the start screen to open the full 80 MHz analyzer with 4-6 generated signals. Sandbox uses the same analyzer, marker, Data RX, RX search, and I/Q tools without file scoring or a live timer. Sandbox also uses relaxed transmit power and occupancy limits so you can experiment more freely.

Available modulation schemes now run from `BPSK` through `64QAM`; denser constellations have stricter Eb/No requirements and tighter I/Q decision spacing.

Player modems use desired Mbps as the throughput knob. Receivers accept the measured occupied bandwidth, so players still need to calculate or measure the bandwidth produced by their Mbps, modulation, FEC, and waveform choices.

## Custom Settings

Enable `Custom settings` on the start screen to override the mode preset. Custom games can set TX modems per player, total system power bank, minimum and maximum occupied signal bandwidth, and transponder count. Transponders stay 36 MHz wide with 4 MHz guard gaps; each transponder adds 40 MHz to the battle span.

## Two-Computer Multiplayer

Network play needs the included local server because the two browsers must exchange live game state.

Two-computer multiplayer uses a 160 MHz battle area: four 36 MHz transponders with 4 MHz guard gaps and small edge guards. It also has a higher shared system power budget than solo mode.

1. On the host computer, run:

   ```bash
   node server.js
   ```

2. The server prints addresses like:

   ```text
   http://localhost:3000
   http://192.168.1.25:3000
   ```

3. Open the printed network address on both computers.

4. On Player 1's computer, choose `Two Computers`, then `Host Player 1`.

5. On Player 2's computer, choose `Two Computers`, enter the room code from Player 1, then `Join Player 2`.

6. Each player gets their own screen. Press `Ready` on both computers to enter the transmit phase.

If the second computer cannot connect, make sure both computers are on the same network and that the host computer's firewall allows Node.js to accept local network connections.
