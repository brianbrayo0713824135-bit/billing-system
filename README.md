# Mapito WiFi Services

A production-ready full-stack WiFi hotspot billing system using voucher login codes and automatic M-Pesa payment approval via SMS parsing.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbrianbrayo0713824135-bit%2Fbilling-system)

**Live Demo:** [https://billing-system.vercel.app](https://billing-system.vercel.app) *(after deployment)*

## Features

- **Voucher-based login**: Users receive a unique `MAP-XXXXXX` code after payment
- **M-Pesa integration**: Pay via Till Number **5441898**
- **Automatic payment detection**: Backend polls SMS Gate Cloud API every 5 seconds to detect M-Pesa confirmation SMS
- **Real-time updates**: Supabase Realtime notifies the frontend instantly when payment is approved
- **FreeRADIUS support**: `POST /api/validate-code` endpoint for hotspot integration
- **Mobile-friendly UI**: Responsive design optimized for phones

## Project Structure

```
MapitoWiFi/
├── backend/           # Node.js/Express API
│   ├── server.js      # Main server with SMS polling & voucher logic
│   ├── package.json   # Dependencies
│   └── .env.example   # Environment variables template
├── frontend/          # Static HTML/CSS/JS
│   ├── index.html     # Main UI
│   ├── styles.css     # Dark theme styling
│   └── app.js         # Frontend logic & Supabase realtime
├── database/          # SQL scripts
│   └── schema.sql     # Supabase tables, RLS policies & realtime config
├── .gitignore
└── README.md
```

## Packages

| Package | Data | Duration | Price |
|---------|------|----------|-------|
| 1GB / 2hrs | 1GB | 2 hours | Ksh 10 |
| Unlimited 1hr | Unlimited | 1 hour | Ksh 20 |
| Unlimited 2hrs | Unlimited | 2 hours | Ksh 30 |
| Unlimited 6hrs | Unlimited | 6 hours | Ksh 50 |
| Unlimited 12hrs | Unlimited | 12 hours | Ksh 80 |
| Unlimited 24Hrs | Unlimited | 24 hours | Ksh 100 |
| Night | Unlimited | 8 hours (Night) | Ksh 30 |
| Weekly | Unlimited | 7 days | Ksh 300 |
| Monthly | Unlimited | 30 days | Ksh 1000 |

## Quick Start

### 1. Database Setup
1. Open your Supabase project SQL Editor
2. Copy the contents of `database/schema.sql`
3. Run the script to create tables, insert packages, enable RLS, and configure realtime

### 2. Backend Setup
```bash
cd backend
cp .env.example .env
npm install
npm start
```

### 3. Frontend Setup
Serve the `frontend/` folder using any static file server or upload to a CDN:
```bash
cd frontend
# Using Python
python -m http.server 8080
# Or using Node.js npx
npx serve .
```

### 4. FreeRADIUS Integration
Configure your hotspot to call:
```
POST /api/validate-code
Content-Type: application/json

{
  "code": "MAP-XXXXXX",
  "mac": "aa:bb:cc:dd:ee:ff",
  "ip": "192.168.1.100"
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (for backend) |
| `SMS_GATE_SERVER` | SMS Gate Cloud server address |
| `SMS_GATE_USERNAME` | SMS Gate Cloud username |
| `SMS_GATE_PASSWORD` | SMS Gate Cloud password |
| `SMS_GATE_DEVICE_ID` | SMS Gate Cloud device ID |
| `PORT` | API server port (default: 3000) |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/packages` | List all packages |
| POST | `/api/payments` | Create a pending payment |
| GET | `/api/payments/:id` | Get payment status with voucher |
| POST | `/api/validate-code` | Validate voucher code (FreeRADIUS) |
| GET | `/api/check-payment?phone=2547...` | Check payments by phone |
| GET | `/api/vouchers` | List all vouchers (admin) |
| GET | `/api/sms-logs` | List SMS logs (admin) |

## How It Works

1. User connects to WiFi and is redirected to the captive portal
2. User selects a package and sees the M-Pesa Till Number **5441898**
3. User pays via M-Pesa and enters their phone number on the portal
4. Backend creates a `pending` payment record in Supabase
5. Backend polls SMS Gate Cloud every 5 seconds for new SMS messages
6. When an M-Pesa SMS is detected, the backend parses:
   - Transaction Code
   - Amount (Ksh)
   - Phone Number
7. The backend matches the SMS with a pending payment
8. If matched, the payment is approved and a unique `MAP-XXXXXX` voucher code is generated
9. The voucher code is sent to the user's phone via SMS
10. The frontend receives the realtime update and displays the login code

## Tech Stack

- **Backend**: Node.js, Express, Axios, node-cron
- **Database**: Supabase (PostgreSQL + Realtime)
- **Frontend**: Vanilla HTML5, CSS3, JavaScript
- **SMS**: SMS Gate Cloud API
- **Payments**: M-Pesa Till Number

## License

MIT
