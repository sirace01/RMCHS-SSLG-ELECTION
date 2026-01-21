import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, User, LogIn, AlertCircle, Copy } from 'lucide-react';
import { generatePasscode, cn } from '../lib/utils';
import { getVoterByLrn } from '../lib/supabase'; // Import real function
import { Voter, SCHOOL_LOGO_URL } from '../types';

interface LoginProps {
  onLoginSuccess: (voter: Voter) => void;
  onAdminLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess, onAdminLogin }) => {
  const [lrn, setLrn] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // 1. Check for Hardcoded Admin
      if (lrn === 'ADMIN' && passcode === 'ADMIN') {
        onAdminLogin();
        return;
      }

      // 2. Fetch Voter from DB
      const voter = await getVoterByLrn(lrn);

      if (!voter) {
        throw new Error("LRN not found in the registry.");
      }

      // 3. Verify Passcode
      // Logic: Allow exact match from DB OR the generated formula
      const generatedPasscode = generatePasscode(voter.lrn, voter.first_name, voter.last_name);
      
      const inputPass = passcode.toUpperCase();
      const dbPass = voter.passcode?.toUpperCase();

      if (inputPass !== dbPass && inputPass !== generatedPasscode) {
         throw new Error("Invalid passcode. Please check your LRN and Name combination.");
      }

      // 4. Check if already voted
      if (voter.has_voted) {
        throw new Error("This learner has already cast their vote.");
      }

      onLoginSuccess(voter);

    } catch (err: any) {
      setError(err.message || "An error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (l: string, p: string) => {
    setLrn(l);
    setPasscode(p);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="bg-blue-900 p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            <img 
              src={SCHOOL_LOGO_URL} 
              alt="RMCHS Logo" 
              className="w-20 h-20 mx-auto rounded-full border-4 border-white shadow-lg relative z-10 bg-white object-contain"
            />
            <h1 className="mt-4 text-2xl font-bold text-white relative z-10">SSLG Voting System</h1>
            <p className="text-blue-200 text-sm relative z-10">Ramon Magsaysay (Cubao) High School</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <User size={16} /> Learner Reference Number (LRN)
              </label>
              <input
                type="text"
                maxLength={12}
                value={lrn}
                onChange={(e) => setLrn(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors outline-none text-lg tracking-widest text-center font-mono"
                placeholder="000000000000"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Lock size={16} /> Passcode
              </label>
              <input
                type="text"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors outline-none text-lg text-center tracking-widest font-mono uppercase"
                placeholder="XXXXXAA"
                required
              />
              <p className="text-xs text-gray-500 text-center">
                Format: Last 5 LRN + 1st Letter First Name + 1st Letter Last Name
              </p>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3"
              >
                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <p className="text-sm text-red-600 font-medium">{error}</p>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full bg-blue-900 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-blue-900/20 hover:bg-blue-800 transition-all flex items-center justify-center gap-2 active:scale-[0.98]",
                loading && "opacity-70 cursor-not-allowed"
              )}
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={20} /> Login to Vote
                </>
              )}
            </button>
          </form>

          {/* DEMO CREDENTIALS SECTION */}
          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
               Test Accounts <span className="font-normal normal-case text-gray-300">(Click to fill)</span>
            </p>
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={() => fillCredentials('ADMIN', 'ADMIN')}
                type="button"
                className="text-left bg-slate-50 p-3 rounded-lg border border-slate-200 hover:bg-slate-100 hover:border-blue-300 transition-all group"
              >
                <div className="flex justify-between items-center mb-1">
                  <p className="text-xs font-bold text-blue-900">Admin</p>
                  <Copy size={12} className="text-gray-400 opacity-0 group-hover:opacity-100" />
                </div>
                <p className="font-mono text-[10px] text-gray-500">LRN: ADMIN</p>
                <p className="font-mono text-[10px] text-gray-500">PW: ADMIN</p>
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-2 text-center">
              Student accounts must be created in Admin Dashboard first.
            </p>
          </div>

        </div>
      </motion.div>
    </div>
  );
};

export default Login;
