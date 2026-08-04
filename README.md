# Prime Diagnostic Centre - POS & Management System

A full-stack, responsive Point of Sale (POS) and Clinic Management System built for a diagnostic centre. This application handles patient registration, service billing, receipt generation, role-based access control, and provides an advanced analytics dashboard.

## 🚀 Features

- **Advanced POS Interface**: Streamlined checkout flow for receptionists to quickly add services, apply dynamic discounts (percentage or flat amount), and capture patient details.
- **Automated Receipt Printing**: Custom `@media print` layouts optimized for 80mm thermal printers, featuring reliable timing logic to prevent blank prints.
- **Role-Based Access Control (RBAC)**: Secure routing and UI elements restricted by user role (Admin vs Receptionist) using Supabase Auth.
- **Real-time Dashboard Analytics**: Advanced data visualization for admins, including revenue tracking, daily/weekly/monthly/custom date filtering, and service-specific breakdowns.
- **Service Management**: Easily add, edit, or categorize medical tests and services directly from the UI (Admin only).
- **Transaction Safety**: Frontend rollback implementations to prevent ghost records if network connections drop during multi-table insertions.

## 🛠️ Tech Stack

- **Frontend**: React, Vite, React Router DOM
- **Styling**: Vanilla CSS with modern flexbox/grid layouts and CSS variables for theming
- **Icons**: Lucide React
- **Backend & Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth (Email/Password)
- **Deployment**: Vercel / Netlify (SPA optimized)

## 📦 Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/aliyan561/POS-app.git
   cd POS-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Variables**
   Create a `.env` file in the root directory and add your Supabase keys:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

## 🗄️ Database Schema Overview

This application relies on a relational PostgreSQL database with the following core tables:
- `patients`: Stores patient demographic information and contact details.
- `services`: Stores available medical tests, pricing, and hierarchical categories (parent/child relationship).
- `orders`: Links a patient to a transaction, storing total amounts, applied discounts, and timestamps.
- `order_items`: The line items for an order, linking `orders` to specific `services`.
- `user_roles`: Links a Supabase Auth UUID to a specific role (`admin` or `receptionist`).

## 🛡️ Security

- **Row Level Security (RLS)** is heavily utilized on the Supabase backend to ensure that database queries only succeed if the user is authenticated and authorized.
- Environment variables are strictly ignored from version control to prevent credential leakage.
