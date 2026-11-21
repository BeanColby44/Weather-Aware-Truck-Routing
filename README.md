# Weather-Aware Truck Routing

Weather-Aware Truck Routing is a React and Django planner for choosing a truck route by weather risk, load weight, and travel time. A driver enters an origin, a destination, a departure time, and a load weight in pounds. The app geocodes both places, requests up to three routes, and samples the hourly forecast along each road at the time the truck is expected to arrive there.
![A truck on a stormlit mountain highway](<mark.png>)
![A truck on a stormlit mountain highway](<Weather-Aware Truck Routing Dashboard (1).png>)
![A truck on a stormlit mountain highway](<Stormlit Mountain Highway.png>)

Samples are taken every 10, 25, or 50 miles. Each sample is a checkpoint. Its risk is the worst of wind, rain, and snow, scored as Low, Moderate, High, Severe, or No Travel. Heavier loads tighten the wind rules. Wind of 35–44 mph stays High at 40,000 lb and becomes Severe above that weight. Wind of 45–54 mph stays Severe at 30,000 lb and becomes No Travel above that weight. Wind of 55 mph or more is No Travel for any load. Miles between two checkpoints use the worse of the two ends, so a bad stretch is counted even when a neighboring sample is calm.

The recommended route is not always the fastest. Routes are ordered by fewest no-travel miles, then fewest severe miles, then fewest high miles, then lowest average risk, then shortest travel time. No-travel miles come first so a closed corridor is not chosen over a drivable one. Average risk is mile-weighted: Low 1, Moderate 2, High 3, Severe 4, No Travel 5.

The map draws the routes and the checkpoint dots. Selecting a route opens mile, estimated arrival, wind, rain, snow, and the rule that set the level. A load-rule tag means the weight changed the wind band. Route cards can be sorted by total risk, drive time, or distance, and a finished comparison can be saved and opened again later.

A 0–48 hour slider recolors a weather heatmap along the corridor. The colors come from the forecast already loaded in the browser. Moving the slider does not send a new request.

The app runs with no API keys. Geocoding uses OpenStreetMap Nominatim. Weather uses the Open-Meteo hourly forecast: wind in miles per hour, rain in inches per hour, and snowfall converted from centimeters to inches. Routing uses OpenRouteService truck directions (`driving-hgv`) when `ORS_API_KEY` is set. Otherwise it uses the public OSRM driving service, and adds a side via-point when that service returns fewer than three roads. Arrival time at mile `m` is departure plus duration times `m / total miles`.

## Contact

- Email: [colbybean321@gmail.com](mailto:colbybean321@gmail.com)
- Phone: +1 (689) 260-2573
- GitHub: [github.com/BeanColby44](https://github.com/BeanColby44)

## Skills used

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=leaflet&logoColor=white)

![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Django](https://img.shields.io/badge/Django-092E20?style=for-the-badge&logo=django&logoColor=white)
![Django REST](https://img.shields.io/badge/Django%20REST-092E20?style=for-the-badge&logo=django&logoColor=white)
![Gunicorn](https://img.shields.io/badge/Gunicorn-499848?style=for-the-badge&logo=gunicorn&logoColor=white)

![OpenStreetMap](https://img.shields.io/badge/OpenStreetMap-7EBC6F?style=for-the-badge&logo=openstreetmap&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)

## Run it locally

From the project root, in two terminals:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py test
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

```powershell
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173. `scripts\start-demo.ps1` starts both servers.

Copy `.env.example` to `.env` only if you want to change settings. The app runs with no API keys.

## Risk rules

Checkpoint risk is the worst of wind, rain, and snow.

| Condition | Low | Moderate | High | Severe | No Travel |
| --- | --- | --- | --- | --- | --- |
| Wind | <25 mph | 25–34 | 35–44 | 45–54 | ≥55 mph |
| Rain | <0.10 in/hr | 0.10–0.25 | 0.25–0.50 | 0.50–1.00 | >1.00 |
| Snow | <0.5 in/hr | 0.5–1.0 | 1.0–2.0 | 2.0–3.0 | >3.0 |

A value that sits on a shared boundary uses the higher band. 1.00 in/hr of rain and 3.0 in/hr of snow stay Severe.

Load rules apply to wind:

- ≥55 mph is No Travel for any load.
- 45–54 mph and a load over 30,000 lb is No Travel. 30,000 lb exactly stays Severe.
- 35–44 mph and a load over 40,000 lb is Severe. 40,000 lb exactly stays High.

Miles between two checkpoints use the worse of the two ends. Average risk is mile-weighted: Low 1, Moderate 2, High 3, Severe 4, No Travel 5.

Recommendation order:

1. Fewest no-travel miles
2. Fewest severe miles
3. Fewest high miles
4. Lowest average risk
5. Shortest travel time

## Tests

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py test
```

The tests cover band edges, the three load rules, segment miles, and the recommendation sort. They do not call the network.

## Hosting

The Dockerfile builds the React app and serves it with Django, so the site and the API share one origin.

- Build: the repository Dockerfile
- Start: the image command (it reads `PORT`)
- Env: `DJANGO_SECRET_KEY` (any long random string), `ALLOWED_HOSTS=*`, `DJANGO_DEBUG=0`
- Optional: `ORS_API_KEY` for truck routing

Render, Railway, or Fly can host that image.

To host the two parts separately:

- Backend (Render): root directory `backend`, build `pip install -r requirements.txt`, start `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT`. Set `ALLOWED_HOSTS=*` and `DJANGO_DEBUG=0`.
- Frontend (Vercel or Netlify): root directory `frontend`. Set `VITE_API_URL` to the backend origin, with no trailing slash, then redeploy.

Do not commit `.env` if you put a real key in it.

## Project layout

- `backend/planner/services/risk.py` — bands, load rules, miles, ranking
- `backend/planner/services/plan.py` — geocode, routes, weather, recommendation
- `backend/planner/services/heatmap.py` — corridor samples for hours 0–48
- `frontend/src/App.tsx` — trip form, recommendation, route cards, checkpoints
- `frontend/src/components/MapView.tsx` — routes, checkpoints, forecast canvas
