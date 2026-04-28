-- Mapito WiFi Services - Supabase Database Schema
-- Run this in the Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Packages table
CREATE TABLE IF NOT EXISTS packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    data_limit TEXT,
    duration_minutes INTEGER NOT NULL,
    price INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT NOT NULL,
    amount INTEGER NOT NULL,
    package_id UUID REFERENCES packages(id),
    status TEXT NOT NULL DEFAULT 'pending',
    transaction_code TEXT,
    mpesa_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vouchers table
CREATE TABLE IF NOT EXISTS vouchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    package_id UUID REFERENCES packages(id),
    payment_id UUID REFERENCES payments(id),
    phone_number TEXT,
    duration_minutes INTEGER NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SMS logs table
CREATE TABLE IF NOT EXISTS sms_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender TEXT,
    message TEXT NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    extracted_code TEXT,
    extracted_amount INTEGER,
    extracted_phone TEXT
);

-- Insert default packages
INSERT INTO packages (name, data_limit, duration_minutes, price) VALUES
('1GB / 2hrs', '1GB', 120, 10),
('Unlimited 1hr', NULL, 60, 20),
('Unlimited 2hrs', NULL, 120, 30),
('Unlimited 6hrs', NULL, 360, 50),
('Unlimited 12hrs', NULL, 720, 80),
('Unlimited 24Hrs', NULL, 1440, 100),
('Night', NULL, 480, 30),
('Weekly', NULL, 10080, 300),
('Monthly', NULL, 43200, 1000)
ON CONFLICT DO NOTHING;

-- Enable Row Level Security
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read packages" ON packages FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert payments" ON payments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public read own payments" ON payments FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public update payments" ON payments FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow public read vouchers" ON vouchers FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert vouchers" ON vouchers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update vouchers" ON vouchers FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow public read sms_logs" ON sms_logs FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert sms_logs" ON sms_logs FOR INSERT TO anon WITH CHECK (true);

-- Enable Realtime for payments and vouchers
ALTER TABLE payments REPLICA IDENTITY FULL;
ALTER TABLE vouchers REPLICA IDENTITY FULL;

BEGIN;
  -- Drop the publication if it exists
  DROP PUBLICATION IF EXISTS supabase_realtime;
  -- Create the publication
  CREATE PUBLICATION supabase_realtime;
COMMIT;

-- Add tables to the publication for realtime changes
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER PUBLICATION supabase_realtime ADD TABLE vouchers;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for payments
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
