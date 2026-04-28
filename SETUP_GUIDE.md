# MapitoWiFi Setup Guide

## Quick Setup Instructions

### 1. Push to GitHub

The project is already initialized as a Git repository. To push to GitHub:

```bash
# Navigate to project directory
cd MapitoWiFi

# Add remote (replace with your repo URL)
git remote add origin https://github.com/YOUR_USERNAME/billing-system.git

# Push to GitHub
git branch -M main
git push -u origin main
```

If you get authentication errors, use a GitHub Personal Access Token:
```bash
# Set up credential helper
git config --global credential.helper store

# Then push again - it will prompt for credentials
git push -u origin main
```

### 2. Setup Supabase Database

1. Go to [Supabase](https://supabase.com) and create a new project (or use existing)
2. Go to SQL Editor in your Supabase dashboard
3. Copy the contents of `database/schema.sql`
4. Paste and run the SQL script

The script will:
- Create tables: packages, payments, vouchers, sms_logs
- Insert default package data
- Enable Row Level Security (RLS)
- Configure Realtime for instant updates
- Create triggers for automatic timestamps

### 3. Deploy to Vercel

#### Option A: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Navigate to project
cd MapitoWiFi

# Deploy
vercel

# Follow prompts to log in and deploy
```

#### Option B: Deploy via Vercel Website

1. Go to [Vercel](https://vercel.com)
2. Click "Add New Project"
3. Import your GitHub repository
4. Configure environment variables (see below)
5. Click "Deploy"

#### Environment Variables for Vercel

Set these in your Vercel project settings:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `SMS_GATE_SERVER` | SMS Gate server (e.g., api.sms-gate.app) |
| `SMS_GATE_USERNAME` | SMS Gate username |
| `SMS_GATE_PASSWORD` | SMS Gate password |
| `SMS_GATE_DEVICE_ID` | SMS Gate device ID |

### 4. SMS Gate Configuration

If you're getting 404 errors from SMS Gate:

1. Verify your SMS Gate credentials are correct
2. Check the API endpoint format - different SMS Gate providers may use different paths
3. Update `SMS_GATE_SERVER` in your environment variables if needed
4. The server will log detailed error messages to help debug

### 5. Local Development

```bash
# Install backend dependencies
cd backend
npm install

# Create .env file from .env.example
cp .env.example .env
# Edit .env with your credentials

# Start the server
npm start

# In another terminal, serve the frontend
cd ../frontend
npx serve .
# Or: python -m http.server 8080
```

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
├── vercel.json        # Vercel deployment configuration
├── .gitignore         # Git ignore rules
└── README.md          # Project documentation
```

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

## Troubleshooting

### Database Errors
If you see "Could not find table" errors, run the `database/schema.sql` script in Supabase.

### SMS 404 Errors
Check your SMS Gate credentials and server URL. The app logs detailed error messages.

### Vercel Deployment
Make sure all environment variables are set in Vercel dashboard before deploying.

## Support

For issues or questions, contact support.