# FORME.md — The Story of PolyTrack

## 1. The Big Picture (Project Overview)

PolyTrack is a live tracking ecosystem that shows exactly where vehicles or devices are on a map in real-time. It acts as both the "GPS device" (via a web simulator) and the powerful control room that tracks those locations with sub-second accuracy, even if the driver briefly loses network connection. 

Think of this system like a **fleet of delivery drivers and a central dispatch office**:
- The **drivers** (the web-based GPS simulators or Arduinos) constantly radio their exact coordinates to headquarters.
- The **dispatch office** (the FastAPI backend) receives these rapid-fire radio messages, checks them to make sure they're real, and permanently writes them down in the master logbook.
- The **giant interactive wall map** in the office (the React-Leaflet dashboard) instantly lights up and moves pins so dispatchers can watch the entire fleet seamlessly glide across the map in real-time.

---

## 2. Technical Architecture — The Blueprint

Here is how the dispatch system is wired together:

```text
[The Drivers]                 [Headquarters]                      [The Wall Map]

 Web Simulator    ----->   FastAPI (The Dispatcher)   ----->    React Dashboard
(Phones/Laptops)             |                  |                 (Local Browser)
                             v                  v
                       PostGIS Database   WebSocket Gateway
                      (The Filing Cabinet) (The PA System)
```

**Let's take a tour of the building:**

- **The Kitchen / Dispatcher (FastAPI Layer):** This is where all the real work happens. Every time a device blinks its location, it talks to FastAPI first. We use FastAPI because it is exceptionally fast at juggling thousands of tiny requests simultaneously without dropping the ball.
- **The PA System (WebSocket Gateway):** If the frontend constantly had to ask the kitchen, "Did any cars move? Did any cars move?", the network would get clogged. Instead, we use WebSockets—an open walkie-talkie channel. The split-second a new location arrives, the kitchen yells it over the PA system. The wall map hears it and updates instantly. We use this to achieve sub-second latency.
- **The Master Filing Cabinet (PostgreSQL + PostGIS):** After broadcasting the location over the PA system, we record it permanently. We specifically chose PostGIS instead of a standard database because it is a "spatial database." It understands geography. It doesn't just store random numbers; it natively knows how to calculate total tracking distance, draw route lines, and check if a vehicle entered a prohibited zone.

---

## 3. Codebase Structure — The Filing System

Our codebase is split into three main wings.

### `/backend/` (The Dispatch Office)
Everything related to receiving, checking, storing, and broadcasting data lives here.
- `app/routers/` — **The Mail Sorters:** This is where the incoming GPS pings first land so they can be sent to the right department.
- `app/db/` — **The Archive Room:** The code that exclusively talks to our PostGIS database to save and retrieve historical routes. Migration scripts (how the cabinets are organized) live here too.
- `app/ws/` — **The Broadcaster's Booth:** Manages the active WebSocket connections. If you want to change how we yell over the PA system, you open this folder.

### `/frontend/` (The Display Room)
This is what the dispatcher actually looks at. 
- `src/components/` — **The Lego Bricks:** Reusable pieces of the user interface, like the tracking map, layout containers, and markers.
- `src/services/` — **The Telephones:** The actual underlying code that dials out to the backend to say, "Hello, please connect me to your PA system."
- `src/utils/` — **The Math Department:** Contains logic like dead-reckoning—the math required to make markers smoothly glide instead of teleporting.

### `/.agents/` (The Company Manual)
This is where all our rules, guidelines, architectural blueprints, and logs (`CHANGELOG.md`, `TODO.md`) live. 

---

## 4. Connections & Data Flow — How Things Talk to Each Other

When a vehicle moves and we want to see it on the map, here is the exact journey of that tiny event:

1. **The Driver Radios In (The Simulator):** A browser or phone grabs its GPS location using standard web APIs. Think of it as writing the coordinates on a postcard. It drops this in the mail and sends it to our backend via HTTP POST.
2. **The Bouncer Checks ID (Payload Validation):** The backend receives it and uses a tool called Pydantic. It acts as a bouncer, asking: "Is the latitude between -90 and 90? Does the device ID exist?" If it's garbage, the bouncer throws it out.
3. **The PA Announcement (WebSocket Broadcast):** The backend immediately hands the valid location to the WebSocket system. The PA system shouts the coordinates to any dashboard currently open. *We do this BEFORE saving it so the map updates with zero delay.*
4. **Filing the Report (Database Write):** The backend then hands a copy to PostGIS, which neatly files it away so we can look at the historical timeline later.
5. **The Map Updates (React/Leaflet):** The dispatcher's dashboard hears the PA system announcement. Instead of abruptly teleporting the pin to the new spot, it runs a "dead reckoning" calculation—meaning it assumes the speed and direction and smoothly glides the marker over so it looks fantastic.

**What if the network drops? (Store-and-Forward)**
If a driver goes into a tunnel and loses cell service, the web simulator recognizes this and starts saving locations into its own local backpack. When they exit the tunnel, it puts all those saved locations into one big envelope (a "batch") and sends them to dispatch all at once. The backend is smart enough to unpack it and draw the history perfectly.

---

## 5. Technology Choices — The Toolbox

| Technology | What It Does Here | Why This One | Watch Out For |
|-----------|------------------|-------------|---------------|
| **FastAPI** | The backend API framework that receives data. | It is fast, automatically documents itself, and handles simultaneous tracking connections flawlessly. | If you write "blocking" code (code that makes the server wait rather than moving on), the whole system grinds to a halt. |
| **PostgreSQL & PostGIS** | The database where map points and devices are saved. | Standard databases struggle with spatial math (e.g., "draw a line between these 100 points"). PostGIS does this out-of-the-box natively. | Modifying the shape of the database tables requires tools known as "migrations" (Alembic). If you skip a migration step, the whole database crashes. |
| **WebSockets** | The real-time connection from server to the map. | Allows the server to literally push updates onto the map screen without the screen asking for them over and over. | If the internet wiggles, the connection drops. We have to specifically write "re-connect" logic to handle this gracefully. |
| **Leaflet / React Leaflet** | Renders the map, roads, and markers on screen. | It's free, completely open-source, incredibly mature, and removes vendor lock-in. | We migrated from Mapbox to Leaflet specifically to avoid sudden enterprise licensing fees down the line. |
| **Docker** | The shipping containers that hold our backend. | It wraps the database and the backend into neat packages. If it works on my laptop, it will definitely work on the cloud server. | Docker can consume massive amounts of disk space on your computer if you forget to clean up old layers or images. |

---

## 6. Environment & Configuration

Because we use Docker, running this project is like starting a car—you just turn the key. But to do that, you need the right keys in your pocket.

- **Environment Variables (`.env` file):** Think of this as a highly secure vault for settings. It holds the database password, the port numbers, and secret configurations. This file is **never** uploaded to GitHub so bad actors can't steal the database password. 
- **How to manage it:** To set it up, you copy the template we provide (`.env.example`) and rename it to `.env`. 
- **The Rule of Thumb:** "If you need to change the database password to XYZ, you'd update your `.env` file — but be careful because if you don't update it in both the backend folder and root, the backend won't have permission to write to the filing cabinet anymore."

---

## 7. Lessons Learned — The War Stories

### Bugs & Fixes:
- **The React Theme Nuke:** There was a known bug where clicking "Dark Mode" on the dispatcher map completely destroyed the map and forcefully rebuilt it from scratch, causing a huge visual flash and lagging the browser. We had to fix the React hook logic so that the tile layers update smoothly without demolishing the map's foundation.
- **The Silent Assassin:** Our MQTT background task was failing silently. When an unknown error hit, the service quietly died and stopped processing data without telling anyone. We fixed this by wrapping the system in a robust `try-except` net that safely powers down and screams for help (logging the error) if something unexpected happens.

### Pitfalls & Landmines:
- **Timezone Nightmares:** "When did this happen?" is the hardest question in tracking. We quickly realized we needed strict "Timezone Aware" dates. "If you ever need to change how we record timestamps, be careful because it also affects the animation speed and the database history." We use Pydantic to aggressively enforce global standard time to avoid markers teleporting into the future.
- **The Ingestion Bottleneck:** Originally, when a batch of saved locations arrived (like a driver coming out of a tunnel), the system filed them one by one in a loop. It choked the CPU. We refactored it to use a "bulk insert" — tossing the whole stack of reports into the filing cabinet at once using advanced SQLAlchemy 2.0 features.

### Discoveries:
- **Store-and-Forward is non-negotiable:** We realized early on that in the real world, connections drop constantly. Building the feature to cache data locally and "batch send" upon reconnection is the distinct line between a hackathon toy and a resilient, production-proof platform.
- **Open Source Wins:** Dropping Mapbox for Leaflet allowed us to control our own destiny without relying on a paid third-party vendor. It proved our frontend architecture was flexible enough to switch out the map engine entirely.

### Engineering Wisdom:
- **Broadcast First, Save Second:** We learned the golden rule of real-time maps: the database is slower than human eyes. We explicitly architected the API to shout over the WebSockets *first* and write to the database *second*. It looks instantly responsive to users.

---

## 8. Quick Reference Card

### First Time Setup (Assume zero knowledge):
1. **Prerequisites:** Ensure you have Docker Desktop and Node.js installed on your machine.
2. **Setup Secrets:** Copy the `.env.example` to `.env` in the root folder.
3. **Start the Backend:** Open your terminal, go to the top folder, and type:
   `docker compose up -d --build` (this downloads and starts the headquarters).
4. **Prepare the Database:** Run this command to set up the filing cabinets: 
   `docker compose exec api alembic upgrade head`
5. **Start the Frontend:** Open a second terminal window, navigate to the `/frontend` directory, type `npm install` to download dependencies, and then type `npm run dev` to start the wall map.

### Key URLs:
- **The Dispatcher Map (The Wall Map):** `http://localhost:5173/dashboard`
- **The Simulator (The Driver's Radio):** `http://localhost:5173/`
- **The Backend API:** `http://localhost:8000`

### Emergency Contacts (Where to debug):
- If the **map is completely white or missing**, check your frontend terminal window running `npm run dev` for red text.
- If the cars are **driving but nothing is saving**, check the dispatcher logs to see what's wrong:
  `docker compose logs -f api`
- If you need to manually **look inside the filling cabinet**:
  `docker compose exec db psql -U postgres -d polytrack`
