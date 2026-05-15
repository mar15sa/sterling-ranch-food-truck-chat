# Sterling Ranch Food Truck Chat

This is a tiny local web app for asking questions like:

- "What food truck is here today?"
- "What food truck is here tomorrow?"
- "What food truck is here May 20?"

It checks the Sterling Ranch CAB calendar event, finds the food truck listed for that date, then searches for likely public menu links. When a truck has a readable online menu, the app shows menu items directly.

## Run it

```powershell
npm start
```

Then open:

```text
http://localhost:3000
```

## Live app

Railway is the primary hosted version:

```text
https://sterling-ranch-food-truck-chat-production.up.railway.app
```

## Put it online

The app can be hosted by Railway or Render.

Railway:

1. Create a new Railway project.
2. Choose GitHub Repository.
3. Select `mar15sa/sterling-ranch-food-truck-chat`.
4. Railway should detect the Node app and deploy it with `npm start`.

Render:

1. Create a GitHub repo for this folder.
2. Push this project to GitHub.
3. In Render, create a new Web Service from that repo.
4. Render should use:
   - Build command: `npm install`
   - Start command: `npm start`
5. When the deploy finishes, Render gives you a public `onrender.com` link.

This project includes a `render.yaml` file, which is a small hosting recipe Render can read.

## Notes

- No paid API key is needed.
- The app reads public web pages live, so results depend on what the truck and search pages make available.
- Some menus are on Facebook, Instagram, DoorDash, or other sites that may block automatic reading. In those cases, the app still gives you the best menu links it found.
