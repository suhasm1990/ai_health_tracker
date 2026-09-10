# AI Health Tracker

> **Powered by Google Health API** • Multi-Device Wearables & Smart Scale Analytics with Proactive Clinical AI Coaching

A modern full-stack web application designed to track, visualize, and analyze personal health and fitness telemetry from the **Google Health API**, supporting **Fitbit Air**, **Pixel Watch**, **Fitbit Charge**, **Fitbit Aria Air scale**, and other connected devices.

---

## 🌟 Features

- **Multi-Device Support**:
  - Automatically queries `GET /v4/users/me/pairedDevices` to discover connected wearables and smart scales.
  - Displays real-time device telemetry: battery gauge, firmware version, and last sync timestamp.
  - Supports device-specific filtering and unified multi-device reconciliation.
- **Hero Daily Readiness & Recovery Score (0–100)**:
  - Clinical multivariate algorithm evaluating Sleep Restoration, Cardiac Autonomic Tone (vs 7-day personal resting HR baseline), and Activity Strain.
  - Concentric glowing activity rings for Steps, Energy, and Recovery.
- **Proactive AI Daily Health Briefing & Coach**:
  - Zero-latency personalized circadian briefing synthesizing sleep architecture and heart rate variability.
  - 1-click interactive AI deep-dives for sleep optimization, movement planning, and cardiac analysis.
  - Powered by Gemini, NVIDIA NIM (Llama 3.3 70B), or custom OpenAI-compatible providers.
- **Habit Streaks & Milestone Celebrations**:
  - Tracks consecutive days for Daily Steps, Restorative Sleep, and Active Zone Minutes with a 7-day dot completion tracker.
- **Family & Friends Social Share Card**:
  - Client-side 2x Retina graphic generation via HTML5 Canvas (zero server load) for sharing daily highlights to WhatsApp, iMessage, and Slack.
- **Mobile First & PWA Ready**:
  - Fully responsive mobile navigation with compact header and slide-down drawer.
  - Installable Progressive Web App (PWA) with standalone display mode.
- **Developer Tools**:
  - Integrated **API Explorer & Tester** to send requests to Google Health API endpoints and inspect live JSON payloads.

---

## 🚀 Getting Started

### 1. Prerequisites

- Node.js 18+ or 20+
- A Google Cloud Project with the Google Health API enabled (for live data), or use the built-in **Demo Sandbox Mode**.

### 2. Installation

```bash
# Clone the repository
git clone git@github.com:suhasm1990/ai_health_tracker.git
cd ai_health_tracker

# Install dependencies
npm install
```

### 3. Environment Configuration

Create a `.env.local` file by copying `.env.example`:

```bash
cp .env.example .env.local
```

Fill in your configuration:

```env
# Google Cloud OAuth 2.0 Credentials
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Session encryption secret (required in production)
SESSION_SECRET=your-random-session-secret

# Google Health API version
GOOGLE_HEALTH_API_VERSION=v4

# Optional: AI Health Assistant Provider (Gemini / NVIDIA NIM / OpenAI)
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
```

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⚡ Deploying to Vercel

Since the code is hosted on GitHub at `suhasm1990/ai_health_tracker`, deploying to Vercel is seamless:

### Option A: Via Vercel Dashboard (Recommended)

1. Go to [vercel.com/new](https://vercel.com/new).
2. Under **Import Git Repository**, select **`ai_health_tracker`**.
3. In **Environment Variables**, add the keys from your `.env.local`:
   - `GOOGLE_CLIENT_ID`: Your Google OAuth client ID.
   - `GOOGLE_CLIENT_SECRET`: Your Google OAuth client secret.
   - `SESSION_SECRET`: A strong random string for encrypting user session cookies (e.g. run `openssl rand -hex 32`).
   - `GOOGLE_HEALTH_API_VERSION`: `v4`
   - `GOOGLE_REDIRECT_URI`: `https://<your-app-name>.vercel.app/api/auth/callback` *(or leave blank; Vercel URLs are automatically detected)*.
   - `GEMINI_API_KEY`: Your Google AI Gemini key (or `NVIDIA_API_KEY`).
4. Click **Deploy**.
5. Once deployed, copy your production domain (e.g., `https://ai-health-tracker.vercel.app`), go to **Google Cloud Console > Credentials > your OAuth Client ID**, and add to **Authorized redirect URIs**:
   ```text
   https://<your-app-name>.vercel.app/api/auth/callback
   ```

### Option B: Via Vercel CLI

```bash
# Log in to your Vercel account
npx vercel login

# Deploy preview
npx vercel

# Deploy directly to production
npx vercel --prod
```

---

## 🔑 Google Cloud Setup (For Live Health Data)

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one.
3. Enable the **Google Health API** under **APIs & Services > Library**.
4. Under **OAuth consent screen**:
   - Set User Type to **External**.
   - Add your Google account under **Test users**.
5. Under **Credentials**, create an **OAuth 2.0 Client ID**:
   - Application Type: **Web application**.
   - Name: `AI Health Tracker`.
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback`.
6. Copy the **Client ID** and **Client Secret** into your `.env.local` file.

---

## 🔒 Security & Privacy

- Credentials and OAuth refresh tokens are stored securely in encrypted HTTP-only session cookies and are never committed to version control.
- Sensitive environment files (`.env.local`, `.tokens.json`) are strictly excluded via `.gitignore`.
- Dual-mode architecture ensures the app can run completely offline in Demo Sandbox mode without any external API calls.

---

## 📄 License & Legal Notice

Independently developed. Google Health, Fitbit, and Apple Health are trademarks of their respective owners.
