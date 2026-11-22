import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Truck, LogOut, User, Building, ShieldCheck, MapPin } from 'lucide-react';

const roleConfig = {
  admin: { label: 'Administrator', bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
  mailroom: { label: 'Central Mailroom', bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' },
  requester: { label: 'Campus Requester', bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' },
  driver: { label: 'Fleet Driver', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' }
};

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const roleMeta = user ? (roleConfig[user.role] || roleConfig.requester) : null;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center space-x-3 text-slate-900 group">
          <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-sm group-hover:bg-blue-700 transition">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-lg leading-tight block tracking-tight">Campus Freight</span>
            <span className="text-xs text-slate-500 font-medium">Logistics & Delivery System</span>
          </div>
        </Link>

        {/* User Status & Actions */}
        {user ? (
          <div className="flex items-center space-x-4">
            {/* Role Badge */}
            {roleMeta && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${roleMeta.bg} ${roleMeta.text} ${roleMeta.border} hidden sm:inline-flex items-center gap-1`}>
                <ShieldCheck className="w-3.5 h-3.5" />
                {roleMeta.label}
              </span>
            )}

            {/* User Profile summary */}
            <div className="text-right hidden md:block">
              <div className="text-sm font-semibold text-slate-800 leading-snug">{user.name}</div>
              <div className="text-xs text-slate-500 flex items-center justify-end gap-1">
                <span>{user.department || user.campusId || user.email}</span>
                {user.defaultCampusNode && (
                  <span className="inline-flex items-center text-slate-400">
                    <MapPin className="w-3 h-3 ml-1" />
                    {user.defaultCampusNode}
                  </span>
                )}
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm"
          >
            <User className="w-4 h-4" />
            Sign In
          </Link>
        )}
      </div>
    </header>
  );
};

export default Navbar;
