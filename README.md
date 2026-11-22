# Campus Freight and Delivery Management System 🚚🏫

A modern, robust, institutional logistics and freight management platform designed for universities, research institutes, and large corporate campuses. Built with **React 19**, **Tailwind CSS v4**, **Leaflet Maps**, **Node.js/Express**, and **MongoDB**.

---

## 🏛️ System Architecture

```
Campus Freight System
├── Frontend (React 19 + Tailwind v4 + Leaflet)
│   ├── Authentication Context & Token Interceptors
│   ├── Interactive Campus Node Map (OpenStreetMap)
│   ├── Requester Portal (Freight Booking & OTP Tracking)
│   ├── Admin & Mailroom Dashboard (Dispatch & Fleet Load Oversight)
│   └── Driver Console (AI Route Navigation & OTP Verification)
│
├── Backend (Node.js + Express REST API)
│   ├── JWT Authentication & Strict Role-Based Access Control (RBAC)
│   ├── Core Campus Logistics Engine (Hubs, Fleet, Drivers)
│   ├── AI Campus Routing & Priority-Weighted Dispatch Engine
│   └── In-Memory Zero-Friction Dev Database Fallback
│
└── Database (MongoDB / In-Memory Fallback)
    ├── DeliveryHubs (10 Campus Buildings & Accessibility Restrictions)
    ├── DeliveryVehicles (Vans, E-Carts, Cargo Bikes, Hand Trolleys)
    ├── Customers (Requesters, Drivers, Mailroom Staff, Admins)
    └── Orders (Lifecycle States, Cargo Specs, PoD OTPs)
```

---

## 🛡️ Key Engineering Guardrails

1. **Atomic Vehicle Load Locking:**
   - Prevents fleet overload by utilizing atomic `DeliveryVehicle.findOneAndUpdate` with MongoDB `$expr` (`currentLoadKg + weightKg <= maxWeightKg`). Automatically rejects over-capacity assignments before they occur and atomically releases vehicle payload upon completed delivery.
2. **Pedestrian & Building Accessibility Restrictions:**
   - Enforces physical transit rules across campus zones. Pedestrian walkways and historic buildings (e.g., *Central Library*, *Hostel Blocks*) restrict commercial vans and restrict access to electric carts, cargo bikes, or hand trolleys. The engine automatically rejects incompatible vehicles.
3. **Fragile & Heavy Cargo Approval Gating:**
   - Requests marked as fragile or weighing over **50 kg** are automatically routed to `PENDING_APPROVAL` status, preventing driver assignment until reviewed and approved by an administrator or mailroom supervisor.
4. **Tamper-Resistant Proof-of-Delivery (PoD) OTP:**
   - Each order generates a secure 4-digit handover OTP visible only to the requester. Drivers must enter the exact OTP to transition the order to `DELIVERED`, triggering real-time vehicle load release.
5. **Deterministic AI Routing with Gemini Fallback:**
   - Computes intra-campus transit distances using the **Haversine formula**. Optimizes multi-stop runs using a **Priority-Weighted Nearest-Neighbor** algorithm (`URGENT` cargo prioritized first). When a `GEMINI_API_KEY` is provided, routes are dynamically enhanced with conversational reasoning; if unavailable or rate-limited, the system falls back seamlessly to deterministic computation with zero downtime.

---

## 👥 Demo Login Credentials

The database includes seeded demo accounts for rapid testing and role switching:

| Role | Email | Password | Campus ID | Default Node | Access Scope |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Administrator** | `admin@campus.edu` | `Password@123` | `ADMIN-001` | `ADMIN-BLOCK` | Full system oversight & order approvals |
| **Mailroom Staff** | `mailroom@campus.edu` | `Password@123` | `STAFF-MR-01` | `MAIN-MAILROOM` | Gate package logging & vehicle dispatch |
| **Faculty Requester** | `faculty@campus.edu` | `Password@123` | `FAC-CSE-01` | `CSE-BLOCK` | Freight booking & PoD OTP tracking |
| **Fleet Driver 1** | `driver1@campus.edu` | `Password@123` | `DRV-001` | `MAIN-MAILROOM` | Active runs, route navigator & OTP verification |
| **Fleet Driver 2** | `driver2@campus.edu` | `Password@123` | `DRV-002` | `MAIN-MAILROOM` | Active runs & delivery completion |

---

## ⚡ Quick Start

### 1. Start the Backend Server

```bash
cd backend
npm install
npm run dev
```

> **Zero-Friction Dev Setup:** If no local MongoDB service is running, the backend automatically spins up an in-memory MongoDB instance and auto-seeds all 10 campus nodes, 6 fleet vehicles, and 5 demo accounts. To use MongoDB Atlas, simply set `MONGO_URI` in `backend/.env`.

### 2. Start the Frontend App

```bash
cd frontend
npm install
npm run dev
```

Visit **`http://localhost:5173`** in your browser. Use the **Quick-Fill Demo Buttons** on the login page to immediately test any role.

---

## 🧪 Automated Testing

Run the automated test suites inside `backend/`:

```bash
# Unit & Guardrail Tests
npm test

# Full 8-Step End-to-End Lifecycle Integration Test
npm run test:e2e
```
