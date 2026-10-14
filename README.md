# keyrace

Multiplayer typing races for your local network, right in the terminal.
No server, no account: friends on the same Wi-Fi show up automatically, and you race them word for word.

```
 keyrace  v2.0.0  Alice · NMBU-CRR4                       192.168.1.20:5052 · ● 2 friends online
─────────────────────────────────────────────────────────────────────────────────────────────────
              ██╗  ██╗███████╗██╗   ██╗██████╗  █████╗  ██████╗███████╗
              ██║ ██╔╝██╔════╝╚██╗ ██╔╝██╔══██╗██╔══██╗██╔════╝██╔════╝
              █████╔╝ █████╗   ╚████╔╝ ██████╔╝███████║██║     █████╗
              ██╔═██╗ ██╔══╝    ╚██╔╝  ██╔══██╗██╔══██║██║     ██╔══╝
              ██║  ██╗███████╗   ██║   ██║  ██║██║  ██║╚██████╗███████╗
              ╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝

                    ▶ Start a race  enter    Solo practice s

 REQUESTS · 1                                             ╭──────────────────────────────────╮
 ❯ ◆ Carl             invites you to a 60s sprint         │ YOUR STATS                       │
                                                          │ 11 races · 7 wins (64%)          │
 FRIENDS · 2 ONLINE                                       │ 4 solo · 96% avg accuracy        │
   ▶ Carl             racing                you 3 : 1     │                                  │
   ● Bob              online                you 7 : 4     │ PERSONAL BESTS                   │
   ○ Dana             offline               you 1 : 2     │ Sprint 60s      78 wpm           │
                                                          │ Race 50         71 wpm · 0:41    │
 NEARBY                                                   │ Sudden Death    1:12 survived    │
   ● Eve              on your network · 192.168.1.31      ╰──────────────────────────────────╯
```

## Installation

Requires [Node.js](https://nodejs.org) 22 or newer.

```sh
npm i -g https://github.com/trigonyx/keyrace/tarball/main
keyrace
```

### Updating

keyrace checks for a new version every time it starts. If there is one, the header shows
`⬆ 1.2.0 available · /update`. Update in whichever way is handiest:

- inside keyrace: `/update` (installs it and offers to restart)
- in a terminal: `keyrace update`
- or the install command again: `npm i -g https://github.com/trigonyx/keyrace/tarball/main`

Your profile and friends live in `~/.termhub` (shared with termchat and termdrop), your results in
`~/.keyrace`. Both are kept across updates.

Updates never need `sudo`. If Node came from the nodejs.org installer, npm's global folder belongs to root, so
`/update` and `keyrace update` install the new version into `~/.keyrace/app` instead, and the `keyrace`
command always starts the newest version it finds.

Only the first install may need `sudo` on such a setup: if npm says `EACCES`, use `sudo npm i -g https://github.com/trigonyx/keyrace/tarball/main`,
or install Node via a version manager such as [nvm](https://github.com/nvm-sh/nvm), [fnm](https://github.com/Schniz/fnm) or Homebrew.

## One profile for termchat, keyrace and termdrop

keyrace, [termchat](https://github.com/trigonyx/termchat) and [termdrop](https://github.com/trigonyx/termdrop)
share one identity, one name and one friend list (in `~/.termhub`). Become friends in any of them, and you're
friends in all of them – even while several are open at the same time, a change in one shows up in the
others right away. Each app still has its own friends view (requests, Nearby, `a`, `/remove`, `/block` …), and
they all work on the same list.

**Coming from keyrace 1.x?** Your friends carry over automatically, and so do your results, personal bests and
head-to-head records. The first time a 2.x app starts, it moves the identities, names and friend lists of all
three apps into `~/.termhub` (your termchat ID becomes the shared one, if you have termchat; the old files are
kept as a backup in `~/.termhub/legacy`). Friends who updated too recognize you under your new ID through a
signed link, so nobody has to add anyone again – **ask your friends to update too.** Until they do, a 1.x
keyrace sees an updated friend as a stranger.

**termhub** – one app to see all your friends and where they're online, set your profile color and status,
and start chats, races and transfers from one place – is coming soon.

## How it works

- **First launch:** you pick a name (unless termchat or termdrop already asked you). keyrace generates a key pair, and your ID comes from it (e.g. `NMBU-CRR4-…`). It never changes, even if you change your name or IP address, so your friends always recognize you.
- **Finding people:** everyone running keyrace on the same network shows up under "Nearby" (UDP port 5053). Many school and office Wi-Fis drop broadcasts, so keyrace also asks every address of your subnet directly once at startup and whenever your IP changes (about 100 small packets per second, a few seconds for a typical network, at most the /16 around you), checks where your friends were last seen, and passes on the addresses it knows, so finding one person is enough to find the rest. Friends are recognized by their ID, never their IP: if a friend's IP changes, keyrace picks up the new one and reconnects on its own. Someone still not showing up (for example on a different subnet)? Press `a` and enter their IP.
- **Friends:** whoever asks first shows up under "Requests" on the other side, and they decide with `enter` (accept) or `x` (decline). Only friends can invite you to a race.
- **Races:** the one who starts a race is its host. The host's keyrace picks the words, runs the lobby, collects everyone's progress, shows it to all players and decides the results. Everyone races on their own clock (the countdown starts when the text arrives), so it doesn't matter if the computers' clocks differ. Invited friends don't need to be friends with each other – everything goes through the host.
- **Firewalls:** keyrace needs a direct connection to each friend, and it's enough if one of the two computers accepts incoming connections. If it can't reach a friend, it says so. Then allow Node.js in the firewall: on Windows, also for *public* networks (school Wi-Fi usually counts as public); on macOS, click "Allow" when asked whether node may accept incoming connections.
- **Security:** every connection is authenticated and encrypted (X25519 + Ed25519 + ChaCha20-Poly1305, using only Node's built-in crypto). `/whois` shows a safety code. Compare it once in person, and you can rule out anyone sitting in the middle.
- **Profile color and status:** friends who picked a profile color show up in it – in the list, the lobby and the race bars (otherwise in a color from their ID) – and their status (busy, do not disturb, a short message) appears next to their name. You set yours in termhub (coming soon); until then you can edit `~/.termhub/profile.json`. In **do not disturb**, race invites wait quietly under "Requests" instead of popping up, and there are no desktop notifications.
- keyrace, termchat and termdrop use different ports, so all of them can run at the same time – with the same friends.

## Modes

All modes use about 1,000 common English words, lowercase and without punctuation.

**Typing:** characters are checked against the current word. `backspace` fixes the current word,
`alt+backspace` or `ctrl+backspace` (or `ctrl+w`) clears it. `space` ends a word: if it matches exactly,
it's a correct word, otherwise it counts as an error and the race goes on. There's no way back into a
finished word, and a space in an empty word is ignored.

- **WPM** = (characters of all correct words + one space each) / 5 per minute
- **Accuracy** = correct keystrokes / all keystrokes (backspace doesn't count)
- **Errors** = wrong words

| Mode | Length | Goal | Ranking |
|---|---|---|---|
| **Sprint** | 30 / **60** / 120 s | most correct words in the time | words, then accuracy, then WPM |
| **Race** | 25 / **50** / 100 words | first to type that many correct words | finish time; after 5 minutes the race ends and the rest are ranked by progress |
| **Sudden Death** | – | stay alive | whoever is caught last wins (survival time, then characters) |

**Sudden Death:** no correcting, and the first wrong keystroke ends your run. To keep things moving, a
**tempo wall** chases you: after a 3 s head start it moves at 20 WPM and gets 5 WPM faster every 10 s.
Fall behind it with your typed characters and you're out as well. Solo, it's about how long you survive.

In a race, whoever is done keeps watching the others live until everyone is through.
**Solo practice** (`s`) counts for your personal bests, but not as a win or a loss.

## Usage

| Dashboard | |
|---|---|
| `↑` `↓` / `j` `k` | select |
| `←` `→` / `h` `l` | on the banner: switch between "Start a race" and "Solo practice" |
| `enter` | start a race or solo practice (banner) · invite a friend · accept a request · join an invite · add someone from Nearby |
| `s` | solo practice (from anywhere on the dashboard) |
| `x` | decline a request or invite |
| `a` | add a friend by IP |
| `r` / `d` | rename (your own nickname) / remove a friend |
| `/` | enter a command (`tab` completes) |
| `?` | help |
| `q` / `ctrl+c` | quit |

Starting a race: pick the mode (`↑↓`) and its length (`←→`), then tick the friends to invite (`space`).
Nobody ticked means a solo run.

| Lobby | |
|---|---|
| `enter` | start (host) – asks first if someone hasn't joined yet |
| `i` / `k` | invite more friends / remove the selected player (host) |
| `c` or `tab` | chat (guests just start typing) |
| `esc` | leave the lobby (host: close it for everyone) |

Once everyone answered and at least one friend joined, the race starts by itself after a short notice.

| Race | |
|---|---|
| type | the words, `space` after each |
| `backspace` | fix the current word |
| `alt+backspace` / `ctrl+backspace` | clear the current word |
| `esc` | give up (host: calls the race off for everyone) |

| Results | |
|---|---|
| `r` | rematch with the same settings (host) · race again (solo) |
| `enter` | join the host's rematch, if there is one |
| `enter` / `esc` | back to the dashboard |

### Commands

| Command | |
|---|---|
| `/help` | all commands |
| `/race` | start a race and invite friends |
| `/solo` | solo practice |
| `/me` | your name, ID and address |
| `/name <name>` | change your display name (in all three apps) |
| `/add <ip[:port]>` | add a friend by IP |
| `/rename [name]` | your own nickname for the selected friend |
| `/remove` | remove the selected friend |
| `/block` · `/unblock` | block / unblock |
| `/whois` | details and safety code of the selected friend |
| `/stats` | your stats, personal bests and head-to-head records |
| `/notifications [on\|off]` | desktop notifications (for all three apps) |
| `/update` | install the latest version |
| `/quit` | quit |

## Stats

The panel next to the list shows your races, wins, accuracy, personal bests and a friends leaderboard
(best WPM). Select a friend to see your head-to-head record: wins and losses against each other, both
your bests and your last duel. In a race with more players, every "who placed ahead of whom" counts, so
finishing 2nd of 4 is one loss and two wins.

Personal bests are kept per mode and length: Sprint and Race by WPM (a race only counts if you finished
it), Sudden Death by survival time. A new one is marked `★ new best` in the results.

## On macOS

- **Notifications:** a system banner appears when a friend invites you while the terminal window is in the background. Toggle with `/notifications on|off`. It needs a terminal that reports focus (Terminal.app, iTerm2).
- Works in Terminal.app and iTerm2 from 60 columns on; below 84 columns the stats move under the list, and narrow or short windows get a compact logo.

## Options

```
keyrace --home <dir>      # different data directory: <dir> instead of ~/.termhub, <dir>/keyrace
                          # instead of ~/.keyrace (or $TERMHUB_HOME)
        --port <port>     # TCP port (default 5052, falls back to a free one if taken)
        --no-discovery    # no automatic search
        --debug           # connection log at <home>/keyrace.log
        -v, --version
        -h, --help
keyrace update            # install the latest version
```

Two instances on one machine (to try it out):

```sh
keyrace --home /tmp/kr-a --port 5062
keyrace --home /tmp/kr-b --port 5063
```

Then press `a` in one of them and enter `127.0.0.1:5062` (or `:5063`). termchat or termdrop with the same
`--home` are the same person, with the same friends.

## Data

Readable only by you. Shared by termchat, keyrace and termdrop, in `~/.termhub/`:

- `identity.json`: your secret key. **Don't share it.** If it's lost, you get a new ID.
- `profile.json`: your name, profile color and status
- `friends.json`: your friends (and requests), with their last known address and your nicknames
- `peers.json`: names and addresses of opponents who aren't your friends (for results and stats)
- `settings.json`: accent color, animations (`nonstop`, `brief`, `off`), desktop notifications
- `links.json`: links from your old IDs (one per app before 2.0) to the shared one, and the ones your friends sent
- `legacy/`: backups of the old identities and friend lists from before 2.0

keyrace's own, in `~/.keyrace/`:

- `config.json`: port
- `results.jsonl`: one line per finished race – date, mode, length, every player's stats and places. All stats are computed from it. When a friend moves to a new ID, their races move with them.
- `keyrace.lock` and `keyrace.sock`: held by the running keyrace (one per data folder)

## Details and design decisions

- **Ports:** TCP 5052 for connections, UDP 5053 for discovery (termchat uses 5050/5051, termdrop 5054/5055, termhub will use 5056/5057).
- **Shared core:** identity, encryption, discovery, friends and the shared data folder come from termcore (a sibling repo), which is bundled into `dist/` – nothing extra to install.
- **Invites while racing** are declined automatically and the host sees "busy racing"; invites that arrive in a lobby or on the results screen wait under "Requests". An invite disappears when the host closes the lobby or goes offline, and a newer invite from the same host replaces the older one.
- **Who can be invited:** online friends. Up to 16 players per race.
- **Race mode** needs correct words: the last one ends the race as soon as it's typed (no space needed). The text has 50 % spare words, so mistakes never make you run out.
- **Sudden Death:** the wall moves in steps (20, 25, 30 … WPM), its position is the integral over that speed. Whoever hasn't typed anything when the 3 s head start is over is caught right away. A sudden death race stops after 10 minutes at the latest. All wall settings are constants in `src/game/types.ts`.
- **Progress bars:** Race shows words towards the goal; Sprint and Sudden Death show progress relative to the leader.
- **Fair play:** the host ignores progress that runs backwards or is faster than 350 WPM, and a final report like that ends the run with the last believable numbers. There's no elaborate anti-cheat.
- **Connections dropping:** a guest who loses the connection (or gives up) is ranked as "left" and doesn't record the race themselves. If the host goes away, the race is called off for everyone and nothing is recorded – there's no host migration.
- **Lobby chat** is plain text, up to 200 characters, cleaned of control characters; the lobby keeps the last 50 messages.
- **Dashboard selection:** if you haven't moved the selection yet, it starts on an open request, so `enter` answers it right away. A new race invite is selected as soon as it arrives.
- **Animations:** a light glint runs across the logo – twice when the dashboard appears (`brief`, the default), every 6 seconds (`nonstop`) or never (`off`), as set in `~/.termhub/settings.json`. It rests while the terminal is in the background or a dialog is open. Apart from that, only races move (countdown, clock, bars).

## Development

```sh
npm install
npm run dev -- --home /tmp/kr-a      # run from source (needs ../termcore next to this folder)
npm test                             # unit, integration (real instances on 127.0.0.1) and UI tests
npm run typecheck
```
