# Welcome to React Router!

## ASTIG Firebase setup

This build uses Firebase Authentication and the Realtime Database at
`https://astig-backend-default-rtdb.asia-southeast1.firebasedatabase.app`.
The Firebase Web app configuration is included. Complete these steps before using
the secured staff workflows:

1. Enable **Authentication > Email/Password** and create the staff accounts.
2. Assign one of these custom claims to each Firebase Auth user: `admin: true`,
   `teacher: true`, or `kiosk: true`. Only admins can import or modify student master data.
3. Deploy the rules with `firebase deploy --only database`.
4. Optionally import `database.seed.json` once to create the school settings and
   default violation labels.

The supplied `database.rules.json` denies access by default. It gives authenticated
teachers attendance and violation access, restricts student/section imports to
admins, and allows kiosk accounts to record scans without exposing parent data to
unauthenticated devices.

### Student Excel import

Use **Students > Import Excel**. The first worksheet can contain these headers:

- `Name of Student`
- `Name of Parent`
- `Email Address`
- `Phone No. (Parent)`
- `LRN`
- `Grade`
- `Section`

If Grade or Section is absent, the import dialog's defaults are used. Missing grades
and sections are created automatically. LRNs must contain exactly 12 digits.

### Kiosk and phone scanning

Open **Verification** on the kiosk. It creates a six-character session code. Open
the displayed `/scanner?session=...` link on an authenticated phone, allow camera
access, and scan a student's QR code. Attendance scans appear on the kiosk in real
time. In Violation mode, the phone prompts for a violation and optional notes, saves
the student's history, and confirms the result on the kiosk.

The first scan of a student each school day records entry. The next scan records or
updates exit. Entry after 7:15 a.m. in `Asia/Manila` is marked late.

A modern, production-ready template for building full-stack React applications using React Router.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/remix-run/react-router-templates/tree/main/default)

## Features

- 🚀 Server-side rendering
- ⚡️ Hot Module Replacement (HMR)
- 📦 Asset bundling and optimization
- 🔄 Data loading and mutations
- 🔒 TypeScript by default
- 🎉 TailwindCSS for styling
- 📖 [React Router docs](https://reactrouter.com/)

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Docker Deployment

To build and run using Docker:

```bash
docker build -t my-app .

# Run the container
docker run -p 3000:3000 my-app
```

The containerized application can be deployed to any platform that supports Docker, including:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

```
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

---

Built with ❤️ using React Router.
