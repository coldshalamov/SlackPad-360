# SlackPad 360

SlackPad 360 is a 3D finger-skateboarding game built around two-finger laptop
trackpad control. The goal is the immediacy of a Tech Deck with the exploration,
lines, gaps, and grinds of an arcade skateboarding game.

## Core controls

- Each tracked finger represents one foot on the skateboard.
- The line between the two contacts determines the board's heading.
- Moving or rotating both contacts steers the board.
- Holding both feet on the board accelerates it.
- Lifting the front foot while the back foot remains planted initiates an ollie.
- Lifting the back foot while the front foot remains planted initiates a nollie.
- A front-foot flick and release contributes roll for flip tricks.
- Contact movement during a pop contributes pitch, roll, and yaw, allowing
  rotated landings and sideways approaches to grinds.

The controls should produce continuous motion and board forces. Trick names are
recognized from the resulting movement for scoring rather than selecting canned
animations from a fixed gesture list.

## Technical direction

- Three.js, TypeScript, and Vite for the browser-rendered game.
- Rapier for collision and skateboard physics.
- A fixed-step simulation kept independent from rendering.
- A normalized contact-frame input API shared by hardware, replay, and agent
  control.
- A native Windows Precision Touchpad bridge if browser APIs cannot expose the
  required independent contact positions and lift events.
- GLB/glTF assets for the board, shoes, environment, and obstacles.

## Observability

Input and simulation must be inspectable from the first prototype. The game will
record normalized contact frames, recognized gesture phases, board state,
collisions, grind candidates, trick results, and frame timing. Recorded sessions
must be deterministic enough to replay after control changes.

An agent-facing test API will inject the same contact frames as the physical
input adapter. It may reset, step, observe, record, and replay the simulation,
but it will not move the board through a privileged game-only interface.

## First milestone

Prove that the target laptop can provide two persistent contact IDs, normalized
positions, and independent lift events at a useful sampling rate. Then build one
small skate area with acceleration, steering, ollie, nollie, flip rotation,
landing, and one grindable rail. Visual polish and a larger level follow only
after the controls are enjoyable under recorded playtests.
