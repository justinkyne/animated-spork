# SKYRISE 🏙️

A modern, browser-based vertical-city building sim — an original homage to the
classic 90s tower-management genre, rebuilt with contemporary UI, juicy
feedback, and an addictive progression loop.

**No build step. No dependencies.** Open `index.html` in a browser, or:

```sh
python3 -m http.server 8000
# → http://localhost:8000
```

## The Loop

1. **Build** offices, condos, shops and hotels — each strip of floorspace is
   a tenant paying rent.
2. **Connect** everything with elevators. People are really simulated: they
   walk, queue, ride, transfer, and get *angry* when they wait too long.
3. **Keep tenants happy.** Every room has a live mood score driven by
   elevator waits, walking distance, noisy neighbours, nearby food, security,
   medical care and (for condos) the view. Miserable tenants move out on
   rent day.
4. **Climb the star rating.** Population + happiness milestones unlock new
   room types (★2 hotels & shops → ★3 express elevators & sky lobbies →
   ★4 cinemas → ★5 The Crown). Build The Crown on floor 50+ to become a
   **MEGATOWER**.

## Systems

- **Economy** — rent every 4th day, nightly hotel income, upkeep on services
  and elevators, demolition refunds. Income/expense breakdown in the Stats tab.
- **Hotels** — guests check in at night, rooms get dirty at checkout, and
  Housekeeping cleans a limited number per day. Dirty rooms earn nothing.
- **Transit network** — standard elevators span ≤30 floors; express elevators
  only stop at the lobby, basements and Sky Lobbies. Trips are routed with
  BFS over the shaft network (up to 2 transfers), so a tall tower genuinely
  needs a well-planned spine.
- **Commerce** — shops, restaurants and cinemas need minimum population
  (foot traffic) or they go out of business.
- **Goals & achievements** — a 15-step goal chain with cash rewards paces the
  whole game; side achievements reward exploration.
- **Living world** — day/night cycle, seasons with snow and rain, commuter
  rushes, lit windows at night, a parallax city skyline.
- **Quality of life** — autosave to localStorage, drag-to-paint rooms,
  drag-to-size elevators, zoom/pan camera, speed controls (pause→8×),
  synthesized sound effects (mutable), full keyboard shortcuts (`?` button
  in-game).

## Controls

| Input | Action |
|---|---|
| Left drag | Pan (no tool selected) |
| Scroll wheel | Zoom |
| Left click | Build / inspect |
| Drag vertically | Set elevator range (elevator tool) |
| Drag horizontally | Paint multiple rooms |
| Right click / `Esc` | Cancel tool |
| `Space` | Pause |
| `1`–`5` | Game speed |
| Arrow keys | Pan |

## Code Layout

Plain ES2022, classic script tags, zero dependencies:

```
js/constants.js   game data: rooms, elevators, ratings, balance
js/time.js        game clock (minutes → days → rent quarters → seasons)
js/room.js        room state (occupancy, mood, hotel dirt)
js/elevator.js    shafts, multi-car scheduling, queues
js/person.js      agent state machine (walk → wait → ride → inside)
js/tower.js       grid, placement rules, BFS routing, mood evaluation
js/economy.js     money, rent-day collection, ledger
js/goals.js       goal chain + achievements
js/save.js        localStorage persistence
js/renderer.js    canvas: sky, weather, tower, people, effects
js/ui.js          HUD, sidebar, toasts, modals, inspector
js/input.js       camera + build tools
js/game.js        orchestration & simulation scheduling
```
