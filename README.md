# Hearts, Unicorns & Cats 🐱💗🦄

A tiny proof-of-concept maze game: guide the cat through the maze, collect
all the hearts, and reach the locked gate to free the trapped unicorn.

Built as a POC — no build tools, no dependencies, just plain HTML/CSS/JS.

## Play it

Open `index.html` in a browser, or serve the folder locally:

```
python3 -m http.server 8080
```

Then visit `http://localhost:8080` (or your machine's LAN IP from a phone
on the same network) to play with touch controls.

## Controls

- **Phone/touch:** on-screen D-pad at the bottom, or swipe on the maze
- **Desktop:** arrow keys or WASD

## How it works

- A new maze is generated each time you play (or tap 🔀 for a new one)
- Collect all the hearts scattered through the maze
- The unicorn's gate stays locked (🔒) until every heart is collected
- Reach the gate with all hearts to win
