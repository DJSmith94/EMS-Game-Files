# Changelog

## July 2, 2026

### Site Shell
- Added `trainer.html` from the spectrum trainer splash page as a separate entry point in the version 1.0.0 folder.
- Added a fifth splash-page selection called Games.
- The Games selection links to the existing RF Tug of War splash page in `index.html`, leaving that game page unchanged.
- Rebuilt `trainer.html` on the shared game page structure so it now uses `styles.css` and `app.js` instead of its old standalone inline analyzer.
- Trainer mode now defaults to the shared sandbox/spec-a backend so analyzer behavior, traces, markers, RX locks, save states, printed traces, and I/Q behavior match the game.
- Updated the shared mode-card grid styling to support the trainer's five-card splash layout.
- Restored the trainer splash concept as four teaching-tool tiles plus a bottom Games tile, with only Spec-A Trainer active for now.
- Left Detect Change & Advanced Characterization as a blank disabled placeholder for future build-out.
- Changed the trainer splash back to a stacked menu and removed the visible Learn/Practice/Apply and custom settings sections from trainer mode.
- Simplified the trainer workspace to focus on the Spec-A, analyzer controls, waterfall, traces, and markers while hiding game-specific scoreboards, TX modems, RX modem panels, and player-vs-AI status UI.
- Added a starter task panel to trainer mode that asks the student to place a marker on a generated signal center frequency and checks marker accuracy.
- Trainer mode now generates 10 narrower non-overlapping sandbox signals for student search and marker practice.
- Added Home navigation controls so players can return from active trainer/game views to the splash page.
- New Task now advances within the existing generated trainer environment instead of rebuilding or resetting Spec-A settings.
- Trainer tasks now track completed generated signals until the full set has been hit.
- Added an Intermediate trainer mode that checks center-frequency marker placement, then opens an I/Q modulation identification popup with BPSK, QPSK, 8PSK, and 16QAM choices.
- Enabled Characterization Sprint as a timed trainer mode using the same generated Spec-A signal environment.
- Characterization Sprint now gives students 15 minutes to characterize as many generated signals as possible by entering center frequency, occupied bandwidth, effective/3 dB bandwidth, and SNR.
- Sprint scoring now awards 1 point for each correct submitted parameter, with the default 10-signal environment shown as a 0/40 running tally.
- Clarified Characterization Sprint measurement definitions: occupied bandwidth is the full roll-off span, 3 dB bandwidth is the half-power span, and SNR uses noise integrated across occupied bandwidth.
- Enabled Signal Design Simulator with a two-transponder environment, one TX modem, one Data RX modem, five assigned gaps, and 4-point scoring for bandwidth use, placement/parameters, RX lock, and throughput-or-survival objective fit.

### Gameplay and Scoring
- Added a tactical point system with a running score for both player and AI.
- Players now earn points for clean uninterrupted data transmission, restoring data flow, RX lock, successful recovery actions, and effective jamming.
- Dummy signals now matter more: a player earns points when a dummy absorbs jamming, while the jammer loses points for wasting energy on a non-data signal.
- Recovery points are awarded only when the link was under pressure and the player action improves margin, goodput, jam fraction, or flow state.

### AI Behavior
- Added calm-link optimization to the AI decision matrix.
- When the player turns off a jamming waveform, the AI now reduces excessive data transmit power instead of continuing to transmit at emergency levels.
- Once interference clears, the AI gradually returns toward throughput optimization by raising FEC rate, modulation, and tightening rolloff when link margin allows.
- AI defensive actions still use the delayed reconfiguration path so power and waveform changes feel like modem retuning rather than instant reactions.

### Spectrum Analyzer
- Added a Reset Spec-A control that restores analyzer start settings without rebuilding the signal environment.
- Expanded analyzer markers from M1-M3 to M1-M5 across buttons, readouts, delta tools, and right-click marker actions.
- Added right-click Jump to Marker actions that center the analyzer view on any placed marker.
- Stabilized marker readout placement so marker labels no longer bounce with trace noise or stack directly on top of each other.
- Changed the reference control to a noise-reference level that starts at the generated noise floor instead of using 0 dBm as the top-of-screen reference.
- Added temporary Spec-A save states through the right-click analyzer menu.
- Saved Spec-A states include analyzer settings and trace buffers, including clear-write, average, max hold, min hold, acquired/video traces, and printed overlays.
- Saved Spec-A states are stored only in memory and automatically clear after each new round.
- Added a print trace function that freezes visible traces onto the spectrum display as dashed reference overlays.
- Added a clear printed traces function.
- Expanded the right-click menu with save, recall, print, and clear printed trace actions.

### Modem and Link Simulation
- Added FEC type selection for TX modems, including LDPC, Turbo, Viterbi, Viterbi+RS, and Uncoded.
- FEC rate options are now limited by the selected FEC type.
- Eb/No threshold calculations now account for the selected FEC type.
- Data throughput and link calculations continue to derive from modulation, FEC, symbol rate, and bandwidth.

### RX and I/Q Behavior
- RX modems can lock onto transmitted signals more consistently when tuned to the correct center frequency, bandwidth, and modulation.
- Data RX lock behavior is tied to the actual selected data signal, while general RX modems can inspect other transmitted signals.
- TX I/Q plots were made less lab-perfect with more realistic impairments.
- RX I/Q previews were tuned to show received-signal noise and interference without becoming unusably noisy.

### UI Updates
- Added point totals and latest point event readouts to the scoreboard.
- Added total TX power/headroom readout near the top of the game view.
- Added tooltips to RX modem action buttons.
- Adjusted RX data modem I/Q sizing so it matches the other I/Q displays more closely.
- Updated the right-click Spec-A menu styling to support additional analyzer tools and saved-state recall entries.
